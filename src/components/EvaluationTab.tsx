"use client";

import { Check, Loader2, Play, X } from "lucide-react";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import claimsData from "@/data/claims.json";
import type { Claim, Investigation, RuleResult, Verdict } from "@/lib/types";

const CLAIMS = claimsData as Claim[];
const VERDICT_COLOR: Record<Verdict, string> = { PAY: "#16a34a", FLAG: "#d97706", DENY: "#dc2626" };
const STATUS_COLOR: Record<string, string> = { pass: "#16a34a", flag: "#d97706", fail: "#dc2626" };

interface EvalResult {
  claimId: string;
  scenario: string;
  groundTruth: Verdict;
  verdict: Verdict;
  correct: boolean;
  confidence: number;
  ruleResults: RuleResult[];
}

export default function EvaluationTab() {
  const [selectedId, setSelectedId] = useState(CLAIMS[0].id);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runEvaluation = async () => {
    const claim = CLAIMS.find((c) => c.id === selectedId);
    if (!claim) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: selectedId, mode: "live" }),
      });
      const inv = (await res.json()) as Investigation & { error?: string };
      if (!res.ok) throw new Error(inv.error || "Evaluation failed");
      setResult({
        claimId: claim.id,
        scenario: claim.scenario,
        groundTruth: claim.groundTruth,
        verdict: inv.verdict,
        correct: inv.verdict === claim.groundTruth,
        confidence: inv.confidence,
        ruleResults: inv.ruleResults,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-[13px] leading-relaxed text-slate-600">
          Pick a labeled claim and run it through the live agent to compare its verdict against the
          expected (ground-truth) label.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Select value={selectedId} onValueChange={(v) => v && setSelectedId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a claim" />
              </SelectTrigger>
              <SelectContent>
                {CLAIMS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.id}, {c.scenario}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button
            onClick={runEvaluation}
            disabled={running}
            className="flex items-center justify-center gap-2 rounded-lg bg-[#5a2d8c] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#6b3ba0] disabled:opacity-60"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {running ? "Evaluating…" : "Run evaluation"}
          </button>
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
            {error}
          </p>
        )}
      </div>

      {result && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="font-mono text-sm font-semibold text-slate-700">{result.claimId}</div>
              <div className="text-[12px] text-slate-500">{result.scenario}</div>
            </div>
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                result.correct ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}
            >
              {result.correct ? <Check size={14} /> : <X size={14} />}
              {result.correct ? "Match" : "Mismatch"}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 py-4">
            <Stat label="Expected">
              <Pill verdict={result.groundTruth} />
            </Stat>
            <Stat label="Agent verdict">
              <Pill verdict={result.verdict} />
            </Stat>
            <Stat label="Confidence">
              <span className="text-[15px] font-semibold text-slate-700">
                {Math.round(result.confidence * 100)}%
              </span>
            </Stat>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Per-concern findings
            </div>
            <div className="space-y-1.5">
              {result.ruleResults.map((r) => (
                <div key={r.ruleId} className="flex items-start gap-2 text-[12.5px]">
                  <span
                    className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                    style={{ background: `${STATUS_COLOR[r.status]}1a`, color: STATUS_COLOR[r.status] }}
                  >
                    {r.status}
                  </span>
                  <span className="text-slate-600">
                    <span className="font-medium text-slate-700">{r.ruleName}:</span> {r.finding}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="text-[12px] leading-relaxed text-slate-500">
        This compares one claim&apos;s live verdict against a hand-labeled answer. Because the agent
        reasons with an LLM, results can vary between runs; it is a sanity check, not a
        generalization claim. A real accuracy measure needs a large, naturally-distributed labeled
        set scored on precision/recall per disposition.
      </p>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  );
}

function Pill({ verdict }: { verdict: Verdict }) {
  const c = VERDICT_COLOR[verdict];
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[13px] font-semibold"
      style={{ background: `${c}14`, color: c }}
    >
      {verdict}
    </span>
  );
}
