// Topology demo fixture + radial React Flow layout builder.
import type { Node, Edge } from "@xyflow/react";
import type { TopologyGraph } from "@/lib/types";
import { arrowMarker, type CanvasTokens } from "@/lib/graph-theme";

export const FIXTURE: TopologyGraph = {
  document_id: "TOPO-PL3-S2",
  generated_at: "2026-01-01T00:00:00.000Z", // static — fixture timestamp is never rendered
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

const CENTER_TYPES = new Set(["Pump", "Vessel", "Separator", "Equipment"]);
const EDGE_TYPE_TOKENS: Record<string, keyof CanvasTokens> = {
  flow_connection: "--accent",
  instrumentation_loop: "--caution",
};

export function buildLayout(topo: TopologyGraph, tokens: CanvasTokens): { nodes: Node[]; edges: Edge[] } {
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
      type: "floating",
      source: e.source_id,
      target: e.target_id,
      label: e.label,
      style: { stroke: color, strokeWidth: isLoop ? 1.2 : 1.8, strokeDasharray: isLoop ? "4,3" : undefined },
      markerEnd: arrowMarker(color, 12),
    };
  });

  return { nodes: rfNodes, edges: rfEdges };
}
