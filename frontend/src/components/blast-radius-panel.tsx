"use client";

import { memo, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getBlastRadius } from "@/lib/api";
import type { BlastRadiusReport } from "@/lib/types";
import { StatusBadge, DemoChip, EmptyState } from "@/components/ui";
import Link from "next/link";
import { useCanvasTokens, arrowMarker, type CanvasTokens } from "@/lib/graph-theme";

// ── Mini diagram ─────────────────────────────────────────────────────────────
// Colors are resolved Paper design tokens (lib/graph-theme.tsx), not hardcoded hex.

const ITEM_TYPE_TOKENS: Record<string, keyof CanvasTokens> = {
  procedure: "--info",
  inspection: "--caution",
  fact: "--muted",
  document: "--accent",
  compliance: "--danger",
};

const BlastNode = memo(function BlastNode({ data }: NodeProps) {
  const d = data as { label: string; itemType: string; isCenter: boolean; flagged: boolean };
  const tokens = useCanvasTokens();
  const color = d.isCenter ? tokens["--accent"] : tokens[ITEM_TYPE_TOKENS[d.itemType] ?? "--muted"];
  return (
    <div
      style={{ borderColor: color }}
      className={`min-w-[80px] max-w-[130px] rounded-xl border-2 px-2.5 py-1.5 text-center shadow-sm ${d.isCenter ? "bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]" : "bg-surface"}`}
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color }}>{d.itemType}</p>
      <p className="mt-0.5 truncate text-micro font-semibold leading-snug text-ink">{d.label}</p>
      {d.flagged && <p className="mt-0.5 text-label font-bold text-danger">FLAGGED</p>}
    </div>
  );
});

const blastNodeTypes = { blast: BlastNode };

function buildBlastDiagram(report: BlastRadiusReport, tokens: CanvasTokens): { nodes: Node[]; edges: Edge[] } {
  const center: Node = {
    id: "__doc__",
    type: "blast",
    position: { x: 0, y: 0 },
    data: { label: report.document_id, itemType: "document", isCenter: true, flagged: false },
    draggable: false,
  };

  const shown = report.items.slice(0, 12);
  const rfNodes: Node[] = [
    center,
    ...shown.map((item, i) => {
      const angle = (i / (shown.length || 1)) * 2 * Math.PI - Math.PI / 2;
      const r = 200;
      return {
        id: item.item_id,
        type: "blast",
        position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
        data: { label: item.description.slice(0, 28), itemType: item.item_type, isCenter: false, flagged: item.flagged_for_review },
        draggable: false,
      };
    }),
  ];

  const rfEdges: Edge[] = shown.map((item) => {
    const color = item.flagged_for_review ? tokens["--danger"] : tokens["--line"];
    return {
      id: `e-${item.item_id}`,
      source: "__doc__",
      target: item.item_id,
      style: { stroke: color, strokeWidth: 1.2 },
      markerEnd: arrowMarker(color, 10),
    };
  });

  return { nodes: rfNodes, edges: rfEdges };
}

// ── Fixture ───────────────────────────────────────────────────────────────────

function fixtureReport(documentId: string): BlastRadiusReport {
  return {
    document_id: documentId,
    affected_count: 4,
    generated_at: new Date().toISOString(),
    items: [
      { item_id: "br-1", item_type: "procedure", description: "Isolation procedure SOP-IS-07", asset_id: "P-101", flagged_for_review: true },
      { item_id: "br-2", item_type: "inspection", description: "Annual inspection schedule A-2024", asset_id: "EQ-101", flagged_for_review: true },
      { item_id: "br-3", item_type: "fact", description: "Design pressure rating 15 bar", asset_id: "P-101", flagged_for_review: false },
      { item_id: "br-4", item_type: "compliance", description: "OISD-118 §4.2 compliance mapping", asset_id: undefined, flagged_for_review: true },
    ],
  };
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function BlastRadiusPanel(props: { documentId: string }) {
  return <BlastRadiusPanelInner {...props} />;
}

function BlastRadiusPanelInner({ documentId }: { documentId: string }) {
  const tokens = useCanvasTokens();
  const [report, setReport] = useState<BlastRadiusReport | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [open, setOpen] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    let alive = true;
    getBlastRadius(documentId).then(({ data, source }) => {
      if (!alive) return;
      const resolved = data ?? fixtureReport(documentId);
      setReport(resolved);
      setIsDemo(source === "demo" || !data);
    });
    return () => { alive = false; };
  }, [documentId]);

  // Edge/node colors are baked-in token strings, so rebuild whenever the report
  // or the resolved theme tokens change.
  useEffect(() => {
    if (report && report.items.length > 0) {
      const { nodes: n, edges: e } = buildBlastDiagram(report, tokens);
      setNodes(n);
      setEdges(e);
    }
  }, [report, tokens, setNodes, setEdges]);

  if (!report) return null;

  return (
    <section className="mt-8">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-[0.1em] text-muted hover:text-ink"
        aria-expanded={open}
      >
        <span>
          Blast radius
          {report.affected_count > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-danger px-1.5 py-0.5 text-micro font-semibold text-white">
              {report.affected_count}
            </span>
          )}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 150ms" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {isDemo && <DemoChip />}

          {report.items.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState message="No downstream items affected." />
            </div>
          ) : (
            <>
              {/* Mini React Flow diagram */}
              <div className="overflow-hidden rounded-xl border border-line" style={{ height: 300 }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={blastNodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  fitView
                  fitViewOptions={{ padding: 0.3 }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  attributionPosition="bottom-left"
                  zoomOnScroll={false}
                  panOnScroll={false}
                  panOnDrag={false}
                >
                  <Background gap={20} size={1} color={tokens["--line"]} />
                </ReactFlow>
              </div>

              {/* Item list */}
              <div className="divide-y divide-line rounded-xl border border-line overflow-hidden">
                {report.items.map((item) => (
                  <div key={item.item_id} className="flex items-start gap-3 bg-surface px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-caption text-ink leading-snug">{item.description}</p>
                      <p className="mt-0.5 text-label text-muted capitalize">{item.item_type}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {item.asset_id && (
                        <Link href={`/assets/${item.asset_id}`} className="text-label text-accent hover:underline">
                          {item.asset_id}
                        </Link>
                      )}
                      {item.flagged_for_review && (
                        <StatusBadge tone="danger">Flagged</StatusBadge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {report.affected_count > report.items.length && (
                <p className="text-center text-label text-muted">
                  + {report.affected_count - report.items.length} more items
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
