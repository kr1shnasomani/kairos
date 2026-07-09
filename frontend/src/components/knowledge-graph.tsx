"use client";

import { memo, useCallback, useEffect, useState } from "react";
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
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getKnowledgeGraph, getOtCoverage } from "@/lib/api";
import type { GraphNodeData, GraphEdgeData, KnowledgeGraphData, OtCoverage, AuthorityLevel } from "@/lib/types";
import { AuthorityBadge, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/utils";

// ── Color helpers ─────────────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  Asset: "#5e6ad2",       // accent
  Event: "#e5484d",       // danger
  Document: "#e79d13",    // caution
  Concept: "#8b8d98",     // muted
  Person: "#3b82f6",      // blue
  Organization: "#30a46c",// verified
  Valve: "#5e6ad2",
  Instrument: "#e79d13",
  Procedure: "#3b82f6",
};

const DEFAULT_COLOR = "#8b8d98";

function kindColor(kind: string) {
  return KIND_COLORS[kind] ?? DEFAULT_COLOR;
}

function authorityStrokeColor(level: number): string {
  if (level <= 2) return "#30a46c";  // verified green
  if (level === 3) return "#3b82f6"; // blue
  return "#e79d13";                   // caution orange
}

function edgeStyle(e: GraphEdgeData): React.CSSProperties {
  const color = e.verification_status === "disputed" ? "#e5484d" : authorityStrokeColor(e.authority_level);
  return {
    stroke: color,
    strokeWidth: 1.8,
    strokeDasharray: e.verification_status === "unverified" ? "5,4" : e.verification_status === "superseded" ? "2,8" : undefined,
    opacity: e.verification_status === "superseded" ? 0.3 : 1,
  };
}

// ── Custom node — MUST be at module scope + wrapped in memo ──────────────────

const KairosNode = memo(function KairosNode({ data, selected }: NodeProps) {
  const nd = data as unknown as GraphNodeData;
  const color = kindColor(nd.kind);
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
      <div
        style={{ borderColor: color }}
        className={cn(
          "min-w-[90px] max-w-[150px] rounded-xl border-2 bg-surface px-3 py-2 text-center shadow-sm",
          selected && "ring-2 ring-offset-1"
        )}
      >
        <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color }}>
          {nd.kind}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] font-semibold leading-snug text-ink">
          {nd.label}
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
    </>
  );
});

// nodeTypes MUST be module-scope — never define inside a component (causes remount).
const nodeTypes = { kairos: KairosNode };

// ── Layout — radial around the center asset ──────────────────────────────────

function buildRFNodes(graph: KnowledgeGraphData): Node[] {
  const others = graph.nodes.filter((n) => n.id !== graph.asset_id);
  const count = others.length || 1;
  const nodes: Node[] = [];
  // Center node
  const center = graph.nodes.find((n) => n.id === graph.asset_id) ?? graph.nodes[0];
  nodes.push({ id: center.id, type: "kairos", position: { x: 0, y: 0 }, data: center as unknown as Record<string, unknown>, draggable: true });
  // Satellite nodes
  others.forEach((n, i) => {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    const r = 280;
    nodes.push({
      id: n.id,
      type: "kairos",
      position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
      data: n as unknown as Record<string, unknown>,
      draggable: true,
    });
  });
  return nodes;
}

function buildRFEdges(graph: KnowledgeGraphData): Edge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    style: edgeStyle(e),
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: e.verification_status === "disputed" ? "#e5484d" : authorityStrokeColor(e.authority_level),
    },
    data: e as unknown as Record<string, unknown>,
  }));
}

// ── Selection panels ─────────────────────────────────────────────────────────

const VERIF_TONE: Record<string, "verified" | "caution" | "danger" | "neutral"> = {
  verified: "verified",
  unverified: "caution",
  disputed: "danger",
  superseded: "neutral",
};

function SidePanel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute right-3 top-3 z-10 w-64 rounded-xl border border-line bg-surface shadow-lg">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="truncate text-[13px] font-semibold text-ink">{title}</p>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="nodrag grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function NodePanel({ node, onClose }: { node: GraphNodeData; onClose: () => void }) {
  const props = Object.entries(node.properties).slice(0, 8);
  return (
    <SidePanel title={node.label} onClose={onClose}>
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{node.kind}</p>
      {props.length > 0 && (
        <dl className="mt-2.5 space-y-1.5">
          {props.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[11.5px]">
              <dt className="w-24 shrink-0 truncate font-medium text-muted">{k}</dt>
              <dd className="min-w-0 truncate text-ink">{String(v ?? "—")}</dd>
            </div>
          ))}
        </dl>
      )}
    </SidePanel>
  );
}

function EdgePanel({ edge, onClose }: { edge: GraphEdgeData; onClose: () => void }) {
  const isOpen = edge.valid_to.startsWith("9999");
  const validTo = isOpen ? "Current" : edge.valid_to.slice(0, 10);
  return (
    <SidePanel title={edge.label} onClose={onClose}>
      <dl className="space-y-2">
        <div className="flex items-center gap-2 text-[11.5px]">
          <dt className="w-24 shrink-0 font-medium text-muted">Authority</dt>
          <dd><AuthorityBadge level={edge.authority_level as AuthorityLevel} /></dd>
        </div>
        <div className="flex items-center gap-2 text-[11.5px]">
          <dt className="w-24 shrink-0 font-medium text-muted">Verification</dt>
          <dd><StatusBadge tone={VERIF_TONE[edge.verification_status] ?? "neutral"}>{edge.verification_status}</StatusBadge></dd>
        </div>
        {[
          ["Document", edge.document_id || "—"],
          ["Confidence", `${Math.round(edge.confidence * 100)}%`],
          ["Valid from", edge.valid_from.slice(0, 10)],
          ["Valid to", validTo],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-2 text-[11.5px]">
            <dt className="w-24 shrink-0 font-medium text-muted">{label}</dt>
            <dd className="min-w-0 truncate text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </SidePanel>
  );
}

// ── OT coverage indicator ────────────────────────────────────────────────────

function CoverageIndicator({ assetId }: { assetId: string }) {
  const [cov, setCov] = useState<OtCoverage | null>(null);
  useEffect(() => {
    getOtCoverage(assetId).then(({ data }) => setCov(data));
  }, [assetId]);
  if (!cov) return null;

  const tone: "verified" | "caution" | "danger" =
    cov.coverage_type === "direct" ? "verified" : cov.coverage_type === "macro" ? "caution" : "danger";
  const label =
    cov.coverage_type === "direct"
      ? `Direct sensors · ${cov.sensor_tags.slice(0, 2).join(", ")}${cov.sensor_tags.length > 2 ? "…" : ""}`
      : cov.coverage_type === "macro"
      ? "Macro monitoring only"
      : "No sensor coverage";

  return (
    <div className="absolute bottom-12 left-3 z-10">
      <StatusBadge tone={tone}>{label}</StatusBadge>
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────

export function KnowledgeGraph({
  assetId,
  asOf,
  height = 480,
}: {
  assetId: string;
  asOf?: string;
  height?: number;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [graphData, setGraphData] = useState<KnowledgeGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdgeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setSelectedNode(null);
    setSelectedEdge(null);
    getKnowledgeGraph(assetId, asOf).then(({ data }) => {
      setGraphData(data);
      if (data) {
        setNodes(buildRFNodes(data));
        setEdges(buildRFEdges(data));
      }
      setLoading(false);
    });
  }, [assetId, asOf]);

  const onNodeClick = useCallback<NodeMouseHandler>((_evt, node) => {
    setSelectedNode(node.data as unknown as GraphNodeData);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback<EdgeMouseHandler>((_evt, edge) => {
    setSelectedEdge((edge.data as unknown as GraphEdgeData) ?? null);
    setSelectedNode(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-line bg-surface"
        style={{ height }}
      >
        <span className="inline-flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-2 animate-bounce rounded-full bg-muted"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-line bg-surface text-[13px] text-muted"
        style={{ height }}
      >
        No knowledge graph data for this asset.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-line" style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        attributionPosition="bottom-left"
      >
        <Background gap={24} size={1} color="#e2e4e9" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <CoverageIndicator assetId={assetId} />
      {selectedNode && (
        <NodePanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
      {selectedEdge && (
        <EdgePanel edge={selectedEdge} onClose={() => setSelectedEdge(null)} />
      )}
    </div>
  );
}
