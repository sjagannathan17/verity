"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import type { AuditRecord } from "@/lib/types";

// Reasoning steps are the model thinking; tool steps are deterministic fact lookups.
const KIND_COLOR: Record<AuditRecord["kind"], string> = {
  reasoning: "#5a2d8c",
  tool: "#0f766e",
};
const KIND_LABEL: Record<AuditRecord["kind"], string> = {
  reasoning: "Reasoning",
  tool: "Fact lookup",
};

function StepCard({ record }: { record: AuditRecord }) {
  const [open, setOpen] = useState(false);
  const color = KIND_COLOR[record.kind];
  const hasFacts = record.kind === "tool" && record.output != null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-lg border border-slate-200 bg-white"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
      >
        <span
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: color }}
        >
          {record.step}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-slate-800">
              {record.kind === "tool" ? record.toolCalled : KIND_LABEL.reasoning}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ background: `${color}1a`, color }}
            >
              {KIND_LABEL[record.kind]}
            </span>
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-600">
            {record.reasoning}
          </span>
        </span>
        <ChevronRight
          size={16}
          className="mt-0.5 shrink-0 text-slate-400 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-slate-100 px-3 py-2.5 text-[12px]">
              {hasFacts ? (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Facts returned
                  </div>
                  <pre className="overflow-x-auto rounded-md bg-slate-50 p-2 font-mono text-[10.5px] text-slate-600">
                    {JSON.stringify(record.output, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-slate-600">{record.reasoning}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ReasoningTimeline({
  audit,
  revealed,
  running,
}: {
  audit: AuditRecord[];
  revealed: number;
  running: boolean;
}) {
  const shown = audit.slice(0, revealed);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Reasoning timeline</h3>
        <span className="text-[11px] text-slate-400">
          {shown.length}/{audit.length || 5} steps
        </span>
      </div>
      {shown.length === 0 && !running && (
        <p className="py-6 text-center text-[13px] text-slate-400">
          Run a review to watch the agent reason step by step.
        </p>
      )}
      <div className="space-y-2">
        {shown.map((r) => (
          <StepCard key={r.step} record={r} />
        ))}
        {running && revealed < audit.length && (
          <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-slate-400">
            <span className="flex gap-1">
              {[0, 1, 2].map((d) => (
                <motion.span
                  key={d}
                  className="h-1.5 w-1.5 rounded-full bg-[#e8453c]"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
                />
              ))}
            </span>
            reasoning…
          </div>
        )}
      </div>
    </div>
  );
}
