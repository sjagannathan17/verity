"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Download, Flag, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import type { Investigation, Verdict } from "@/lib/types";

const VERDICT_META: Record<Verdict, { color: string; bg: string; icon: typeof Flag; label: string }> = {
  PAY: { color: "#16a34a", bg: "#f0fdf4", icon: CheckCircle2, label: "PAY" },
  FLAG: { color: "#d97706", bg: "#fffbeb", icon: Flag, label: "FLAG" },
  DENY: { color: "#dc2626", bg: "#fef2f2", icon: XCircle, label: "DENY" },
};

function RadialMeter({ value, color }: { value: number; color: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const size = 132;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - shown);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f6" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-slate-800">{Math.round(shown * 100)}%</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Confidence</span>
      </div>
    </div>
  );
}

export default function VerdictPanel({
  investigation,
  visible,
}: {
  investigation: Investigation | null;
  visible: boolean;
}) {
  if (!investigation || !visible) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
        <Flag className="mb-3 text-slate-300" size={28} />
        <p className="text-sm text-slate-400">The verdict and audit trail appear here once a review completes.</p>
      </div>
    );
  }

  const meta = VERDICT_META[investigation.verdict];
  const Icon = meta.icon;

  const downloadAudit = () => {
    const blob = new Blob([JSON.stringify(investigation, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `verity-audit-${investigation.claimId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: meta.bg }}>
        <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${meta.color}1a`, color: meta.color }}>
          <Icon size={24} />
        </span>
        <div>
          <div className="text-2xl font-bold tracking-tight" style={{ color: meta.color }}>
            {meta.label}
          </div>
          <div className="text-[12px] text-slate-500">Claim {investigation.claimId}</div>
        </div>
      </div>

      <div className="flex items-center justify-center border-b border-slate-100 py-5">
        <RadialMeter value={investigation.confidence} color={meta.color} />
      </div>

      <div className="space-y-4 p-5">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rationale</div>
          <p className="text-[13px] leading-relaxed text-slate-700">{investigation.rationale}</p>
        </div>

        {investigation.verdict !== "PAY" && investigation.remediation && (
          <div className="rounded-lg border p-3" style={{ borderColor: `${meta.color}40`, background: `${meta.color}0a` }}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: meta.color }}>
              Recommended remediation
            </div>
            <p className="text-[13px] leading-relaxed text-slate-700">{investigation.remediation}</p>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Cited rules
          </div>
          {investigation.citedRules.length ? (
            <div className="flex flex-wrap gap-1.5">
              {investigation.citedRules.map((r) => (
                <span
                  key={r}
                  className="rounded-md border px-2 py-0.5 text-[11px] font-medium"
                  style={{ borderColor: `${meta.color}55`, color: meta.color, background: `${meta.color}0d` }}
                >
                  {r}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[12px] text-slate-400">All checks passed, no rule triggered.</span>
          )}
        </div>

        <button
          onClick={downloadAudit}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#5a2d8c] bg-[#5a2d8c] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#6b3ba0]"
        >
          <Download size={15} /> Download audit trail (JSON)
        </button>
        <p className="text-center text-[10.5px] text-slate-400">
          Mode: {investigation.mode === "live" ? "Live (Claude)" : "Sample (offline)"}
        </p>
      </div>
    </motion.div>
  );
}
