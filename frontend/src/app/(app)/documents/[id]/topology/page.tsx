"use client";

// Interactive P&ID topology canvas for a vault document (React Flow).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getDocumentTopology } from "@/lib/api";
import type { TopologyGraph, TopologyNode } from "@/lib/types";
import { useCanvasTokens } from "@/lib/graph-theme";
import { EmptyState, PageHeader } from "@/components/ui";
import { nodeTypes, nodeVar } from "./_components/topo-node";
import { NodeDetail, TopoLegend } from "./_components/topo-panels";
import { FIXTURE, buildLayout } from "./_components/topo-data";

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
  // topology data or the resolved theme tokens change. (Not merged with the
  // fetch effect: a theme toggle must rebuild the layout without refetching.)
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
    <div data-testid="topology-workspace" className="mx-auto max-w-[1400px]">
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

      <PageHeader
        compact
        className="mt-4 mb-5"
        eyebrow="Layer 3 · P&ID topology"
        title={id}
        lede="Equipment, valves, instruments, and flow connections extracted from the P&ID drawing. Unverified elements are highlighted; confirm via the quarantine queue."
      />

      <div data-testid="topology-layout" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div data-testid="topology-canvas" className="relative min-h-[420px] h-[min(62dvh,680px)] overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <span className="inline-flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            </div>
          ) : topo && topo.nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4"><EmptyState message="No topology extracted from this document yet." /></div>
          ) : (
            <>
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
            </>
          )}
        </div>

        <aside data-testid="topology-context" className="rounded-xl border border-line bg-surface p-4 shadow-sm lg:sticky lg:top-20">
          <h2 className="text-label font-bold uppercase tracking-[0.1em] text-muted">Verification key</h2>
          <div className="mt-3"><TopoLegend /></div>
          {topo && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-caption">
              <div><p className="text-muted">Elements</p><p className="tabular mt-1 text-title font-semibold">{topo.nodes.length}</p></div>
              <div><p className="text-muted">Connections</p><p className="tabular mt-1 text-title font-semibold">{topo.edges.length}</p></div>
            </div>
          )}
        </aside>
      </div>

      {topo && (
        <section data-testid="topology-register" className="mt-6">
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
