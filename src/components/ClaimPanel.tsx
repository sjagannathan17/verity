"use client";

import { Check, Copy, Loader2, Play } from "lucide-react";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Claim } from "@/lib/types";

export default function ClaimPanel({
  claims,
  selectedId,
  onSelect,
  onRun,
  running,
}: {
  claims: Claim[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRun: () => void;
  running: boolean;
}) {
  const claim = claims.find((c) => c.id === selectedId) ?? claims[0];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Select a claim
        </label>
        <Select value={selectedId} onValueChange={(v) => v && onSelect(v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a claim" />
          </SelectTrigger>
          <SelectContent>
            {claims.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.id}, {c.scenario}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={onRun}
          disabled={running}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#5a2d8c] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#6b3ba0] disabled:opacity-60"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          {running ? "Reviewing…" : "Run review"}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-sm font-semibold text-[#5a2d8c]">{claim.id}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
            {claim.scenario}
          </span>
        </div>

        <dl className="space-y-2.5 text-[12.5px]">
          <Row label="Member" value={claim.memberId} />
          <Row label="Provider" value={`${claim.provider} · ${claim.providerSpecialty}`} />
          <Row label="Date of service" value={claim.dateOfService} />
          <Row label="Diagnoses" value={claim.diagnosisCodes.join(", ")} mono />
        </dl>

        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Lines
          </div>
          <div className="space-y-1.5">
            {claim.lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5">
                <span className="font-mono text-[12px] font-medium text-slate-700">{l.cptCode}</span>
                <span className="flex-1 truncate px-2 text-[11.5px] text-slate-500">{l.description}</span>
                <span className="flex items-center gap-2 text-[11.5px] text-slate-500">
                  {l.modifiers.length > 0 && (
                    <span className="rounded bg-[#5a2d8c]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#5a2d8c]">
                      {l.modifiers.join(",")}
                    </span>
                  )}
                  <span>×{l.units}</span>
                  <span className="font-medium text-slate-700">${l.chargeAmount.toFixed(2)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Clinical note
          </div>
          <p className="text-[12.5px] leading-relaxed text-slate-600">{claim.clinicalNote}</p>
        </div>
      </div>

      <JsonPreview claim={claim} />
    </div>
  );
}

function JsonPreview({ claim }: { claim: Claim }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(claim, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Claim JSON
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 transition hover:text-[#5a2d8c]"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-600">
        {json}
      </pre>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-right text-slate-700 ${mono ? "font-mono text-[12px]" : ""}`}>{value}</dd>
    </div>
  );
}
