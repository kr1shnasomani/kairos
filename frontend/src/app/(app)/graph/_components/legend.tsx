// Graph context-panel helpers: authority legend + validity-window mapping.
import type { GraphEdgeData } from "@/lib/types";
import type { TimelineEvent } from "@/components/ui";

const LEGEND_ITEMS = [
  { var: "var(--verified)", label: "L1–L2 verified" },
  { var: "var(--info)",     label: "L3 standard" },
  { var: "var(--caution)",  label: "L4–L5 field" },
  { var: "var(--muted)",    label: "Unverified", dashed: true },
  { var: "var(--danger)",   label: "Disputed" },
] satisfies { var: string; label: string; dashed?: boolean }[];

export function GraphLegend() {
  return (
    <div className="grid gap-2 text-label text-muted">
      {LEGEND_ITEMS.map(({ var: c, label, dashed }) => (
        <div key={label} className="flex items-center gap-1.5">
          {dashed
            ? <span className="inline-block h-2 w-6 border-t-2 border-dashed" style={{ borderColor: c }} />
            : <span className="inline-block h-2 w-6 rounded-full" style={{ backgroundColor: c }} />}
          {label}
        </div>
      ))}
    </div>
  );
}

const SENTINEL_YEAR = 9999;

function edgeTone(e: GraphEdgeData): TimelineEvent["tone"] {
  if (e.verification_status === "disputed") return "danger";
  if (e.verification_status === "superseded") return "neutral";
  if (e.authority_level <= 2) return "verified";
  if (e.authority_level === 3) return "info";
  return "caution";
}

/** Map graph edges to shared Timeline events (validity windows). */
export function validityEvents(edges: GraphEdgeData[]): TimelineEvent[] {
  return edges.map((e) => {
    const end = new Date(e.valid_to);
    const open = end.getFullYear() >= SENTINEL_YEAR;
    return {
      id: e.id,
      label: e.label,
      timestamp: new Date(e.valid_from).toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
      meta: open ? "Current" : `until ${end.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}`,
      tone: edgeTone(e),
    };
  });
}
