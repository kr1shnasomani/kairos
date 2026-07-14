"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getDocumentTopology } from "@/lib/api";
import type { TopologyGraph, TopologyNode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCanvasTokens, arrowMarker, type CanvasTokens } from "@/lib/graph-theme";
import { EmptyState } from "@/components/ui";

// ── Colors ────────────────────────────────────────────────────────────────────

// Canvas: resolved Paper design tokens (lib/graph-theme.tsx) — React Flow cannot
// resolve CSS custom properties at paint time, so these are concrete color
// strings re-resolved on theme toggle, not hardcoded hex.
const NODE_TOKENS: Record<string, keyof CanvasTokens> = {
  Pump: "--info", Vessel: "--accent", Equipment: "--accent",
  Valve: "--verified", Instrument: "--caution", Separator: "--accent",
};
function nodeColor(type: string, status: TopologyNode["verification_status"], tokens: CanvasTokens): string {
  if (status === "disputed") return tokens["--danger"];
  if (status === "unverified") return tokens["--caution"];
  return tokens[NODE_TOKENS[type] ?? "--muted"];
}

// DOM vars: outside canvas, must use CSS variables
const NODE_VARS: Record<string, string> = {
  Pump: "var(--info)", Vessel: "var(--accent)", Equipment: "var(--accent)",
  Valve: "var(--verified)", Instrument: "var(--caution)", Separator: "var(--accent)",
};
function nodeVar(type: string, status: TopologyNode["verification_status"]): string {
  if (status === "disputed") return "var(--danger)";
  if (status === "unverified") return "var(--caution)";
  return NODE_VARS[type] ?? "var(--muted)";
}

// ── Custom node ───────────────────────────────────────────────────────────────

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

const nodeTypes = { topo: TopoNode };

// ── Fixture ───────────────────────────────────────────────────────────────────

const FIXTURE: TopologyGraph = {
  document_id: "TOPO-PL3-S2",
  generated_at: new Date().toISOString(),
  nodes: [
    { node_id: "P-101",   node_type: "Pump",       label: "P-101",   verification_status: "verified",   properties: { duty: "Crude transfer", design_pressure: "15 bar" } },
    { node_id: "V-247",   node_type: "Valve",      label: "V-247",   verification_status: "verified",   properties: { type: "Gate valve", size: "DN200" } },
    { node_id: "V-248",   node_type: "Valve",      label: "V-248",   verification_status: "unverified", properties: { type: "Check valve", size: "DN200" } },
    { node_id: "FT-1001", node_type: "Instrument", label: "FT-1001", verification_status: "verified",   properties: { measurement: "Flow", range: "0–500 m³/h" } },
    { node_id: "PS-1001", node_type: "Instrument", label: "PS-1001", verification_status: "disputed",   properties: { measurement: "Pressure", range: "0–20 bar" } },
    { node_id: "EQ-101",  node_type: "Vessel",     label: "EQ-101",  verification_status: "verified",   properties: { type: "Separator", volume: "12 m³" } },
  ],
  edges: [
    { edge_id: "e1", source_id: "V-247",   target_id: "P-101",  edge_type: "flow_connection",    label: "Suction" },
    { edge_id: "e2", source_id: "P-101",   target_id: "V-248",  edge_type: "flow_connection",    label: "Discharge" },
    { edge_id: "e3", source_id: "V-248",   target_id: "EQ-101", edge_type: "flow_connection",    label: "→ Separator" },
    { edge_id: "e4", source_id: "FT-1001", target_id: "P-101",  edge_type: "instrumentation_loop", label: "Flow" },
    { edge_id: "e5", source_id: "PS-1001", target_id: "P-101",  edge_type: "instrumentation_loop", label: "Pressure" },
  ],
};

// ── Layout ────────────────────────────────────────────────────────────────────

const CENTER_TYPES = new Set(["Pump", "Vessel", "Separator", "Equipment"]);
const EDGE_TYPE_TOKENS: Record<string, keyof CanvasTokens> = {
  flow_connection: "--accent",
  instrumentation_loop: "--caution",
};

function buildLayout(topo: TopologyGraph, tokens: CanvasTokens): { nodes: Node[]; edges: Edge[] } {
  const center = topo.nodes.find((n) => CENTER_TYPES.has(n.node_type)) ?? topo.nodes[0];
  const others = topo.nodes.filter((n) => n.node_id !== center.node_id);

  const rfNodes: Node[] = [
    { id: center.node_id, type: "topo", position: { x: 0, y: 0 }, data: center as unknown as Record<string, unknown>, draggable: true },
    ...others.map((n, i) => {
      const angle = (i / (others.length || 1)) * 2 * Math.PI - Math.PI / 2;
      const r = 280;
      return {
        id: n.node_id,
        type: "topo",
        position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
        data: n as unknown as Record<string, unknown>,
        draggable: true,
      };
    }),
  ];

  const rfEdges: Edge[] = topo.edges.map((e) => {
    const color = tokens[EDGE_TYPE_TOKENS[e.edge_type] ?? "--muted"];
    const isLoop = e.edge_type === "instrumentation_loop";
    return {
      id: e.edge_id,
      source: e.source_id,
      target: e.target_id,
      label: e.label,
      style: { stroke: color, strokeWidth: isLoop ? 1.2 : 1.8, strokeDasharray: isLoop ? "4,3" : undefined },
      markerEnd: arrowMarker(color, 12),
    };
  });

  return { nodes: rfNodes, edges: rfEdges };
}

// ── Side panel ────────────────────────────────────────────────────────────────

function NodeDetail({ node, onClose }: { node: TopologyNode; onClose: () => void }) {
  const color = nodeVar(node.node_type, node.verification_status);
  return (
    <div className="absolute right-3 top-3 z-10 w-64 rounded-xl border border-line bg-surface shadow-lg">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="truncate text-body font-semibold text-ink">{node.label}</p>
        <button
          onClick={onClose}
          aria-label="Close"
          className="nodrag grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-4 space-y-2 text-label">
        <div className="flex gap-2">
          <span className="w-24 shrink-0 font-medium text-muted">Type</span>
          <span style={{ color }} className="font-semibold">{node.node_type}</span>
        </div>
        <div className="flex gap-2">
          <span className="w-24 shrink-0 font-medium text-muted">Verification</span>
          <span style={{ color }} className="capitalize">{node.verification_status}</span>
        </div>
        {Object.entries(node.properties ?? {}).slice(0, 5).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="w-24 shrink-0 truncate font-medium text-muted capitalize">{k.replace(/_/g, " ")}</span>
            <span className="min-w-0 truncate text-ink">{String(v ?? "—")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

const TOPO_LEGEND = [
  { cssVar: "var(--verified)", label: "Verified" },
  { cssVar: "var(--caution)", dashed: true, label: "Unverified" },
  { cssVar: "var(--danger)", label: "Disputed" },
  { cssVar: "var(--info)", label: "Flow connection" },
  { cssVar: "var(--caution)", dashed: true, label: "Instrumentation loop" },
] satisfies { cssVar: string; dashed?: boolean; label: string }[];

function TopoLegend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-label text-muted">
      {TOPO_LEGEND.map(({ cssVar, dashed, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          {dashed
            ? <span className="inline-block h-2 w-6 border-t-2 border-dashed" style={{ borderColor: cssVar }} />
            : <span className="inline-block h-2 w-6 rounded-full" style={{ backgroundColor: cssVar }} />}
          {label}
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TopologyPage() {
  return <TopologyPageInner />;
}

function TopologyPageInner() {
  const { id } = useParams<{ id: string }>();
  const tokens = useCanvasTokens();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [topo, setTopo] = useState<TopologyGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    getDocumentTopology(id).then(({ data, source }) => {
      const resolved = data ?? FIXTURE;
      setTopo(resolved);
      setIsDemo(source === "demo" || !data);
      setLoading(false);
    });
  }, [id]);

  // Node/edge colors are baked-in token strings, so rebuild whenever the
  // topology data or the resolved theme tokens change.
  useEffect(() => {
    if (!topo) return;
    const { nodes: n, edges: e } = buildLayout(topo, tokens);
    setNodes(n);
    setEdges(e);
  }, [topo, tokens, setNodes, setEdges]);

  const onNodeClick = useCallback<NodeMouseHandler>((_evt, node) => {
    setSelectedNode(node.data as unknown as TopologyNode);
  }, []);

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex items-center justify-between">
        <Link
          href={`/documents/${id}`}
          className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Document
        </Link>
        {isDemo && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-label text-muted">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo topology
          </span>
        )}
      </div>

      <header className="mt-4 mb-5">
        <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">
          Layer 3 · P&ID topology
        </p>
        <h1 className="mt-1 text-display font-semibold leading-tight text-balance">
          {id}
        </h1>
        <p className="mt-1 text-body text-muted text-pretty">
          Equipment, valves, instruments, and flow connections extracted from the P&ID drawing.
          Unverified elements are highlighted — confirm via the quarantine queue.
        </p>
      </header>

      {loading ? (
        <div className="flex h-[520px] items-center justify-center rounded-xl border border-line bg-surface">
          <span className="inline-flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        </div>
      ) : topo && topo.nodes.length === 0 ? (
        <EmptyState message="No topology extracted from this document yet." />
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-line" style={{ height: 520 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={{ padding: 0.35 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} color={tokens["--line"]} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {selectedNode && (
            <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
          )}
        </div>
      )}

      <div className="mt-3">
        <TopoLegend />
      </div>

      {topo && (
        <section className="mt-6">
          <h2 className="mb-3 text-label font-bold uppercase tracking-[0.1em] text-muted">
            Elements ({topo.nodes.length})
          </h2>
          <div className="divide-y divide-line rounded-xl border border-line overflow-hidden">
            {topo.nodes.map((n) => {
              const color = nodeVar(n.node_type, n.verification_status);
              return (
                <div key={n.node_id} className="flex items-center gap-3 px-4 py-3 bg-surface">
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
                  <span className="text-caption font-semibold w-24 shrink-0">{n.label}</span>
                  <span className="text-label text-muted">{n.node_type}</span>
                  <span className="ml-auto text-label capitalize" style={{ color }}>{n.verification_status}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
