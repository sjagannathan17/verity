"use client";

import { ShieldCheck } from "lucide-react";

import type { RunMode } from "@/lib/types";

export default function Header({
  mode,
  model,
  onModeChange,
}: {
  mode: RunMode;
  model: string;
  onModeChange: (mode: RunMode) => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#5a2d8c] text-white">
          <ShieldCheck size={18} />
        </span>
        <div className="leading-tight">
          <div className="text-[17px] font-bold tracking-tight text-[#5a2d8c]">Verity</div>
          <div className="text-[11px] text-slate-500">Payment Integrity Reasoning Copilot</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {mode === "live" && model && (
          <span className="hidden text-[11px] text-slate-500 md:inline">
            Results powered by <span className="font-medium text-[#5a2d8c]">{model}</span>
          </span>
        )}
        <span className="hidden text-[11px] text-slate-400 sm:inline">Mode</span>
        <div className="flex items-center rounded-full border border-slate-200 p-0.5">
          <ModeButton label="Live (Claude)" active={mode === "live"} onClick={() => onModeChange("live")} />
          <ModeButton label="Sample" active={mode === "sample"} onClick={() => onModeChange("sample")} />
        </div>
      </div>
    </header>
  );
}

function ModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
        active ? "bg-[#5a2d8c] text-white" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}
