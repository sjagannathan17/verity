"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import AgentGraph from "@/components/AgentGraph";
import ClaimPanel from "@/components/ClaimPanel";
import EvaluationTab from "@/components/EvaluationTab";
import Header from "@/components/Header";
import ReasoningTimeline from "@/components/ReasoningTimeline";
import VerdictPanel from "@/components/VerdictPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import claimsData from "@/data/claims.json";
import { RULE_BY_ID } from "@/lib/rules";
import { useInvestigation } from "@/lib/useInvestigation";
import type { Claim, RunMode } from "@/lib/types";

const CLAIMS = claimsData as Claim[];

export default function Page() {
  const [selectedId, setSelectedId] = useState(CLAIMS[0].id);
  const [openRule, setOpenRule] = useState<string | null>(null);
  const [mode, setMode] = useState<RunMode>("sample");
  const [keyAvailable, setKeyAvailable] = useState(false);
  const [model, setModel] = useState("");
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const inv = useInvestigation();

  useEffect(() => {
    fetch("/api/mode")
      .then((r) => r.json())
      .then((d) => {
        const hasKey = Boolean(d.keyAvailable);
        setKeyAvailable(hasKey);
        setModel(typeof d.model === "string" ? d.model : "");
        if (hasKey) setMode("live"); // default to live when a key is configured
      })
      .catch(() => setKeyAvailable(false));
  }, []);

  const chooseMode = useCallback(
    (next: RunMode) => {
      if (next === "live" && !keyAvailable) {
        setKeyDialogOpen(true);
        return;
      }
      setMode(next);
    },
    [keyAvailable],
  );

  const selectClaim = useCallback(
    (id: string) => {
      setSelectedId(id);
      setOpenRule(null);
      inv.reset();
    },
    [inv],
  );

  const verdict = inv.status === "done" && inv.investigation ? inv.investigation.verdict : null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/60">
      <Header mode={mode} model={model} onModeChange={chooseMode} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <Tabs defaultValue="review">
          <TabsList className="mb-6">
            <TabsTrigger value="review">Review</TabsTrigger>
            <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
          </TabsList>

          <TabsContent value="review">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <ClaimPanel
                  claims={CLAIMS}
                  selectedId={selectedId}
                  onSelect={selectClaim}
                  onRun={() => inv.run(selectedId, mode)}
                  running={inv.status === "running"}
                />
                {inv.error && (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
                    {inv.error}
                  </p>
                )}
              </div>

              <div className="space-y-5 lg:col-span-6">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">Agent flow</h3>
                    <span className="text-[11px] text-slate-400">LLM orchestrator → fact tools → decision</span>
                  </div>
                  <AgentGraph
                    nodeStateById={inv.nodeStateById}
                    resultById={inv.resultById}
                    verdict={verdict}
                    onRuleClick={setOpenRule}
                  />
                  <AnimatePresence>
                    {openRule && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <RuleInfo
                          ruleId={openRule}
                          result={inv.resultById[openRule]}
                          onClose={() => setOpenRule(null)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <ReasoningTimeline
                  audit={inv.investigation?.audit ?? []}
                  revealed={inv.revealed}
                  running={inv.status === "running"}
                />
              </div>

              <div className="lg:col-span-3">
                <VerdictPanel investigation={inv.investigation} visible={inv.status === "done"} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="evaluation">
            <EvaluationTab />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-center text-[11px] text-slate-400">
        Verity: Payment Integrity Reasoning Copilot · Built for Cotiviti · Synthetic demo data
      </footer>

      <AnimatePresence>
        {keyDialogOpen && <KeyDialog onClose={() => setKeyDialogOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

function KeyDialog({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-[15px] font-semibold text-slate-800">Live mode needs an API key</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
          Live mode calls Claude and requires an Anthropic API key. Add it to{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-700">
            .env.local
          </code>{" "}
          and restart the dev server:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-[11.5px] leading-relaxed text-slate-600">
          ANTHROPIC_API_KEY=sk-ant-...
        </pre>
        <p className="mt-2 text-[12px] text-slate-400">
          Until then, Verity shows a pre-generated offline sample (claim C-1010).
        </p>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-[#5a2d8c] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#6b3ba0]"
        >
          Got it
        </button>
      </motion.div>
    </motion.div>
  );
}

function RuleInfo({
  ruleId,
  result,
  onClose,
}: {
  ruleId: string;
  result: ReturnType<typeof useInvestigation>["resultById"][string];
  onClose: () => void;
}) {
  const meta = RULE_BY_ID[ruleId];
  const color =
    result?.status === "fail" ? "#dc2626" : result?.status === "flag" ? "#d97706" : result?.status === "pass" ? "#16a34a" : "#5a2d8c";
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between">
        <div className="text-[13px] font-semibold text-slate-800">{meta.ruleName}</div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X size={15} />
        </button>
      </div>
      <p className="mt-1 text-[12px] text-slate-600">{meta.checks}</p>
      {result ? (
        <div className="mt-2 rounded-md border bg-white p-2.5" style={{ borderColor: `${color}40` }}>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
            style={{ background: `${color}1a`, color }}
          >
            {result.status}
          </span>
          <p className="mt-1.5 text-[12px] text-slate-700">{result.finding}</p>
          <p className="mt-1 text-[11px] text-slate-400">Citation: {result.citation}</p>
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-slate-400">Run a review to see this rule&apos;s result for the selected claim.</p>
      )}
    </div>
  );
}
