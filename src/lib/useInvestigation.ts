"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RULES } from "@/lib/rules";
import type { Investigation, RuleResult, RunMode } from "@/lib/types";

export type RunStatus = "idle" | "running" | "done";
export type NodeState = "pending" | "active" | "resolved";

const STEP_MS = 850;

export interface InvestigationView {
  investigation: Investigation | null;
  status: RunStatus;
  revealed: number; // number of resolved audit steps
  error: string | null;
  run: (claimId: string, mode: RunMode) => Promise<void>;
  reset: () => void;
  nodeStateById: Record<string, NodeState>;
  resultById: Record<string, RuleResult | undefined>;
}

export function useInvestigation(): InvestigationView {
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [revealed, setRevealed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const reset = useCallback(() => {
    clear();
    setInvestigation(null);
    setStatus("idle");
    setRevealed(0);
    setError(null);
  }, []);

  const run = useCallback(async (claimId: string, mode: RunMode) => {
    clear();
    setStatus("running");
    setRevealed(0);
    setInvestigation(null);
    setError(null);
    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, mode }),
      });
      const inv = (await res.json()) as Investigation & { error?: string };
      if (!res.ok) throw new Error(inv.error || "Investigation failed");
      setInvestigation(inv);
      const total = inv.audit.length;
      timer.current = setInterval(() => {
        setRevealed((r) => {
          const n = r + 1;
          if (n >= total) {
            clear();
            setStatus("done");
          }
          return Math.min(n, total);
        });
      }, STEP_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Investigation failed");
      setStatus("idle");
    }
  }, []);

  useEffect(() => () => clear(), []);

  // The LLM's per-concern findings drive the graph node colors; audit records
  // (revealed one by one) drive when each concern lights up as investigated.
  const findingById: Record<string, RuleResult | undefined> = {};
  for (const f of investigation?.ruleResults ?? []) findingById[f.ruleId] = f;

  const revealedRuleIds = new Set(
    (investigation?.audit ?? []).slice(0, revealed).map((a) => a.ruleId).filter(Boolean) as string[],
  );

  const nodeStateById: Record<string, NodeState> = {};
  const resultById: Record<string, RuleResult | undefined> = {};

  for (const meta of RULES) {
    resultById[meta.ruleId] = findingById[meta.ruleId];
    const investigated = revealedRuleIds.has(meta.ruleId) || status === "done";
    nodeStateById[meta.ruleId] =
      status === "idle" ? "pending" : investigated && findingById[meta.ruleId] ? "resolved" : "pending";
  }

  return { investigation, status, revealed, error, run, reset, nodeStateById, resultById };
}
