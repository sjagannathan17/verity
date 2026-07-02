"use client";

import "@xyflow/react/dist/style.css";

import { Background, Handle, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import {
  Cpu,
  Copy,
  FileText,
  Gavel,
  Layers,
  Repeat,
  Stethoscope,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";

import { RULES } from "@/lib/rules";
import type { NodeState } from "@/lib/useInvestigation";
import type { RuleResult, Verdict } from "@/lib/types";

const RULE_ICON: Record<string, LucideIcon> = {
  ncci_bundling: Layers,
  medical_necessity: Stethoscope,
  frequency_units: Repeat,
  modifier_validation: Tag,
  duplicate_claim: Copy,
  documentation_validation: FileText,
};

const STATUS_COLOR: Record<string, string> = {
  pass: "#16a34a",
  flag: "#d97706",
  fail: "#dc2626",
};
const VERDICT_COLOR: Record<Verdict, string> = {
  PAY: "#16a34a",
  FLAG: "#d97706",
  DENY: "#dc2626",
};

interface NodeData {
  kind: "orchestrator" | "rule" | "verdict";
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  state?: NodeState;
  result?: RuleResult;
  verdict?: Verdict | null;
  onClick?: () => void;
  [key: string]: unknown;
}

function VerityNode({ data }: { data: NodeData }) {
  const Icon = data.icon;

  let border = "#cbd5e1";
  let bg = "#ffffff";
  let tint = "#64748b";
  let extra = "";

  if (data.kind === "rule") {
    if (data.state === "active") {
      border = "#e8453c";
      tint = "#e8453c";
      extra = "node-active";
    } else if (data.state === "resolved" && data.result) {
      border = STATUS_COLOR[data.result.status];
      tint = STATUS_COLOR[data.result.status];
      bg = `${STATUS_COLOR[data.result.status]}0f`;
    }
  } else if (data.kind === "orchestrator") {
    border = "#5a2d8c";
    tint = "#5a2d8c";
    bg = "#f4f0fa";
  } else if (data.kind === "verdict") {
    if (data.verdict) {
      border = VERDICT_COLOR[data.verdict];
      tint = VERDICT_COLOR[data.verdict];
      bg = `${VERDICT_COLOR[data.verdict]}12`;
    } else {
      border = "#5a2d8c";
      tint = "#5a2d8c";
    }
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border-2 bg-white px-3 py-2 shadow-sm transition-colors ${extra} ${data.kind === "rule" ? "cursor-pointer" : ""}`}
      style={{ borderColor: border, background: bg, width: data.kind === "rule" ? 184 : 150 }}
      onClick={data.onClick}
    >
      {data.kind !== "orchestrator" && <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />}
      {data.kind !== "verdict" && <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />}
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
        style={{ background: `${tint}1a`, color: tint }}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-slate-800">{data.label}</div>
        {data.sublabel && (
          <div className="truncate text-[11px]" style={{ color: tint }}>
            {data.sublabel}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { verity: VerityNode };

interface Props {
  nodeStateById: Record<string, NodeState>;
  resultById: Record<string, RuleResult | undefined>;
  verdict: Verdict | null;
  onRuleClick: (ruleId: string) => void;
}

export default function AgentGraph({ nodeStateById, resultById, verdict, onRuleClick }: Props) {
  const { nodes, edges } = useMemo(() => {
    const ruleY = [10, 68, 126, 184, 242, 300];
    const midY = (ruleY[0] + ruleY[ruleY.length - 1]) / 2;
    const nodes: Node<NodeData>[] = [
      {
        id: "orchestrator",
        type: "verity",
        position: { x: 0, y: midY },
        data: { kind: "orchestrator", label: "Orchestrator", sublabel: "LLM agent", icon: Cpu },
        draggable: false,
      },
      {
        id: "verdict",
        type: "verity",
        position: { x: 470, y: midY },
        data: {
          kind: "verdict",
          label: verdict ?? "Verdict",
          sublabel: verdict ? "decision" : "pending",
          icon: Gavel,
          verdict,
        },
        draggable: false,
      },
    ];
    const edges: Edge[] = [];

    RULES.forEach((meta, i) => {
      const state = nodeStateById[meta.ruleId] ?? "pending";
      const result = resultById[meta.ruleId];
      nodes.push({
        id: meta.ruleId,
        type: "verity",
        position: { x: 220, y: ruleY[i] },
        data: {
          kind: "rule",
          label: meta.shortName,
          sublabel:
            state === "resolved" && result
              ? result.status.toUpperCase()
              : state === "active"
                ? "checking…"
                : "pending",
          icon: RULE_ICON[meta.ruleId] ?? Layers,
          state,
          result,
          onClick: () => onRuleClick(meta.ruleId),
        },
        draggable: false,
      });

      edges.push({
        id: `e-orch-${meta.ruleId}`,
        source: "orchestrator",
        target: meta.ruleId,
        animated: state === "active",
        style: { stroke: state === "active" ? "#e8453c" : "#e2e8f0", strokeWidth: state === "active" ? 2 : 1.5 },
      });

      const color = result ? STATUS_COLOR[result.status] : "#e2e8f0";
      edges.push({
        id: `e-${meta.ruleId}-verdict`,
        source: meta.ruleId,
        target: "verdict",
        animated: state === "resolved",
        style: { stroke: state === "resolved" ? color : "#eef2f6", strokeWidth: state === "resolved" ? 2 : 1 },
      });
    });

    return { nodes, edges };
  }, [nodeStateById, resultById, verdict, onRuleClick]);

  return (
    <div className="h-[360px] w-full rounded-xl border border-slate-200 bg-slate-50/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
      >
        <Background color="#e2e8f0" gap={20} />
      </ReactFlow>
    </div>
  );
}
