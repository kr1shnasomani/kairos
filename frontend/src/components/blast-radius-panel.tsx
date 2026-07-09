"use client";

import { memo, useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getBlastRadius } from "@/lib/api";
import type { BlastRadiusReport, BlastRadiusItem } from "@/lib/types";
import { StatusBadge } from "@/components/ui";
import Link from "next/link";

// ── Mini diagram ─────────────────────────────────────────────────────────────

const ITEM_TYPE_COLORS: Record<string, string> = {
  procedure: "#3b82f6",
  inspection: "#e79d13",
  fact: "#8b8d98",
  document: "#5e6ad2",
  compliance: "#e5484d",
};
const DEFAULT_ITEM_COLOR = "#8b8d98";

const BlastNode = memo(function BlastNode({ data }: NodeProps) {
  const d = data as { label: string; itemType: string; isCenter: boolean; flagged: boolean };
  const color = d.isCenter ? "#5e6ad2" : (ITEM_TYPE_COLORS[d.itemType] ?? DEFAULT_ITEM_COLOR);
  return (
    <div
      style={{ borderColor: color }}
      className={`min-w-[80px] max-w-[130px] rounded-xl border-2 px-2.5 py-1.5 text-center shadow-sm ${d.isCenter ? "bg-[#eef0fb]" : "bg-white"}`}
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color }}>{d.itemType}</p>
      <p className="mt-0.5 truncate text-[10.5px] font-semibold leading-snug text-gray-800">{d.label}</p>
      {d.flagged && <p className="mt-0.5 text-[8.5px] text-[#e5484d] font-semibold">FLAGGED</p>}
    </div>
  );
});

const blastNodeTypes = { blast: BlastNode };

function buildBlastDiagram(report: BlastRadiusReport): { nodes: Node[]; edges: Edge[] } {
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

  const rfEdges: Edge[] = shown.map((item) => ({
    id: `e-${item.item_id}`,
    source: "__doc__",
    target: item.item_id,
    style: { stroke: item.flagged_for_review ? "#e5484d" : "#c1c5d0", strokeWidth: 1.2 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: item.flagged_for_review ? "#e5484d" : "#c1c5d0" },
  }));

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

export function BlastRadiusPanel({ documentId }: { documentId: string }) {
  const [report, setReport] = useState<BlastRadiusReport | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [open, setOpen] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    getBlastRadius(documentId).then(({ data, source }) => {
      const resolved = data ?? fixtureReport(documentId);
      setReport(resolved);
      setIsDemo(source === "demo" || !data);
      if (resolved.items.length > 0) {
        const { nodes: n, edges: e } = buildBlastDiagram(resolved);
        setNodes(n);
        setEdges(e);
      }
    });
  }, [documentId]);

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
            <span className="ml-2 inline-flex items-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
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
          {isDemo && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
              <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
              Demo data
            </span>
          )}

          {report.items.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface px-4 py-5 text-center text-[13px] text-muted">
              No downstream items affected.
            </p>
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
                  <Background gap={20} size={1} color="#e2e4e9" />
                </ReactFlow>
              </div>

              {/* Item list */}
              <div className="divide-y divide-line rounded-xl border border-line overflow-hidden">
                {report.items.map((item) => (
                  <div key={item.item_id} className="flex items-start gap-3 bg-surface px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-ink leading-snug">{item.description}</p>
                      <p className="mt-0.5 text-[11px] text-muted capitalize">{item.item_type}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {item.asset_id && (
                        <Link href={`/assets/${item.asset_id}`} className="text-[11px] text-accent hover:underline">
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
                <p className="text-center text-[11.5px] text-muted">
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
