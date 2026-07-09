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
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  type OnNodeClick,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getDocumentTopology } from "@/lib/api";
import type { TopologyGraph, TopologyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Colors ────────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  Pump: "#3b82f6",
  Vessel: "#5e6ad2",
  Equipment: "#5e6ad2",
  Valve: "#30a46c",
  Instrument: "#e79d13",
  Separator: "#5e6ad2",
};
const DEFAULT_COLOR = "#8b8d98";

function nodeColor(type: string, status: TopologyNode["verification_status"]): string {
  if (status === "disputed") return "#e5484d";
  if (status === "unverified") return "#e79d13";
  return NODE_COLORS[type] ?? DEFAULT_COLOR;
}

// ── Custom node ───────────────────────────────────────────────────────────────

const TopoNode = memo(function TopoNode({ data, selected }: NodeProps) {
  const n = data as TopologyNode;
  const color = nodeColor(n.node_type, n.verification_status);
  const dashed = n.verification_status === "unverified";
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
      <div
        style={{
          borderColor: color,
          borderStyle: dashed ? "dashed" : "solid",
          backgroundColor: n.verification_status === "unverified"
            ? "#fefce8"
            : n.verification_status === "disputed"
            ? "#fff1f2"
            : "#ffffff",
        }}
        className={cn(
          "min-w-[90px] max-w-[150px] rounded-xl border-2 px-3 py-2 text-center shadow-sm",
          selected && "ring-2 ring-offset-1"
        )}
      >
        <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color }}>
          {n.node_type}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] font-semibold leading-snug text-gray-800">
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
const EDGE_TYPE_COLOR: Record<string, string> = {
  flow_connection: "#5e6ad2",
  instrumentation_loop: "#e79d13",
};

function buildLayout(topo: TopologyGraph): { nodes: Node[]; edges: Edge[] } {
  const center = topo.nodes.find((n) => CENTER_TYPES.has(n.node_type)) ?? topo.nodes[0];
  const others = topo.nodes.filter((n) => n.node_id !== center.node_id);

  const rfNodes: Node[] = [
    { id: center.node_id, type: "topo", position: { x: 0, y: 0 }, data: center, draggable: true },
    ...others.map((n, i) => {
      const angle = (i / (others.length || 1)) * 2 * Math.PI - Math.PI / 2;
      const r = 280;
      return {
        id: n.node_id,
        type: "topo",
        position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
        data: n,
        draggable: true,
      };
    }),
  ];

  const rfEdges: Edge[] = topo.edges.map((e) => {
    const color = EDGE_TYPE_COLOR[e.edge_type] ?? DEFAULT_COLOR;
    const isLoop = e.edge_type === "instrumentation_loop";
    return {
      id: e.edge_id,
      source: e.source_id,
      target: e.target_id,
      label: e.label,
      style: { stroke: color, strokeWidth: isLoop ? 1.2 : 1.8, strokeDasharray: isLoop ? "4,3" : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color },
    };
  });

  return { nodes: rfNodes, edges: rfEdges };
}

// ── Side panel ────────────────────────────────────────────────────────────────

function NodeDetail({ node, onClose }: { node: TopologyNode; onClose: () => void }) {
  const color = nodeColor(node.node_type, node.verification_status);
  return (
    <div className="absolute right-3 top-3 z-10 w-64 rounded-xl border border-line bg-surface shadow-lg">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="truncate text-[13px] font-semibold text-ink">{node.label}</p>
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
      <div className="p-4 space-y-2 text-[11.5px]">
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

function TopoLegend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted">
      {[
        { color: "#30a46c", label: "Verified" },
        { color: "#e79d13", dashed: true, label: "Unverified" },
        { color: "#e5484d", label: "Disputed" },
        { color: "#5e6ad2", label: "Flow connection" },
        { color: "#e79d13", dashed: true, label: "Instrumentation loop" },
      ].map(({ color, dashed, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-6 rounded-full"
            style={{ backgroundColor: color, opacity: dashed ? 0.6 : 1, ...(dashed ? { borderTop: `2px dashed ${color}`, backgroundColor: "transparent" } : {}) }}
          />
          {label}
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TopologyPage() {
  const { id } = useParams<{ id: string }>();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [topo, setTopo] = useState<TopologyGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    getDocumentTopology(id).then(({ data, source }) => {
      const resolved = data ?? FIXTURE;
      setTopo(resolved);
      setIsDemo(source === "demo" || !data);
      const { nodes: n, edges: e } = buildLayout(resolved);
      setNodes(n);
      setEdges(e);
      setLoading(false);
    });
  }, [id]);

  const onNodeClick = useCallback<OnNodeClick>((_evt, node) => {
    setSelectedNode(node.data as TopologyNode);
  }, []);

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex items-center justify-between">
        <Link
          href={`/documents/${id}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Document
        </Link>
        {isDemo && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo topology
          </span>
        )}
      </div>

      <header className="mt-4 mb-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
          Layer 3 · P&ID topology
        </p>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight text-balance">
          {id}
        </h1>
        <p className="mt-1 text-[13.5px] text-muted text-pretty">
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
            attributionPosition="bottom-left"
          >
            <Background gap={24} size={1} color="#e2e4e9" />
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
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Elements ({topo.nodes.length})
          </h2>
          <div className="divide-y divide-line rounded-xl border border-line overflow-hidden">
            {topo.nodes.map((n) => {
              const color = nodeColor(n.node_type, n.verification_status);
              return (
                <div key={n.node_id} className="flex items-center gap-3 px-4 py-3 bg-surface">
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
                  <span className="text-[12.5px] font-semibold w-24 shrink-0">{n.label}</span>
                  <span className="text-[11.5px] text-muted">{n.node_type}</span>
                  <span className="ml-auto text-[11px] capitalize" style={{ color }}>{n.verification_status}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
