"use client";

// Custom React Flow node + color mapping for P&ID topology elements.
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TopologyNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCanvasTokens, type CanvasTokens } from "@/lib/graph-theme";

// Canvas: resolved Paper design tokens (lib/graph-theme.tsx) — React Flow cannot
// resolve CSS custom properties at paint time, so these are concrete color
// strings re-resolved on theme toggle, not hardcoded hex.
const NODE_TOKENS: Record<string, keyof CanvasTokens> = {
  Pump: "--info", Vessel: "--accent", Equipment: "--accent",
  Valve: "--verified", Instrument: "--caution", Separator: "--accent",
};
export function nodeColor(type: string, status: TopologyNode["verification_status"], tokens: CanvasTokens): string {
  if (status === "disputed") return tokens["--danger"];
  if (status === "unverified") return tokens["--caution"];
  return tokens[NODE_TOKENS[type] ?? "--muted"];
}

// DOM vars: outside canvas, must use CSS variables
const NODE_VARS: Record<string, string> = {
  Pump: "var(--info)", Vessel: "var(--accent)", Equipment: "var(--accent)",
  Valve: "var(--verified)", Instrument: "var(--caution)", Separator: "var(--accent)",
};
export function nodeVar(type: string, status: TopologyNode["verification_status"]): string {
  if (status === "disputed") return "var(--danger)";
  if (status === "unverified") return "var(--caution)";
  return NODE_VARS[type] ?? "var(--muted)";
}

const TopoNode = memo(function TopoNode({ data, selected }: NodeProps) {
  const n = data as unknown as TopologyNode;
  const tokens = useCanvasTokens();
  const color = nodeColor(n.node_type, n.verification_status, tokens);
  const dashed = n.verification_status === "unverified";
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
      <div
        style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}
        className={cn(
          "min-w-[90px] max-w-[150px] rounded-xl border-2 px-3 py-2 text-center shadow-sm",
          n.verification_status === "unverified" && "bg-[color-mix(in_srgb,var(--caution)_8%,var(--surface))]",
          n.verification_status === "disputed"   && "bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))]",
          n.verification_status === "verified"   && "bg-surface",
          selected && "ring-2 ring-offset-1"
        )}
      >
        <p className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color }}>
          {n.node_type}
        </p>
        <p className="mt-0.5 truncate text-label font-semibold leading-snug text-ink">
          {n.label}
        </p>
        {n.verification_status !== "verified" && (
          <p className="mt-0.5 text-[9px] capitalize" style={{ color }}>
            {n.verification_status}
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
    </>
  );
});

export const nodeTypes = { topo: TopoNode };
