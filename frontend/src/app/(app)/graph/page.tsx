"use client";

import { useEffect, useState } from "react";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import type { KnowledgeGraphData, GraphEdgeData } from "@/lib/types";
import { getKnowledgeGraph } from "@/lib/api";
import { cn } from "@/lib/utils";

const EXAMPLE_ASSETS = ["P-101", "EQ-101", "V-247"];

function authorityColor(level: number): string {
  if (level <= 2) return "var(--verified)";
  if (level === 3) return "var(--info)";
  return "var(--caution)";
}

// ── Validity timeline bars (Task 16) ─────────────────────────────────────────

function ValidityTimeline({ edges }: { edges: GraphEdgeData[] }) {
  if (edges.length === 0) return null;

  const SENTINEL_YEAR = 9999;
  const futureMs = Date.now() + 365 * 24 * 60 * 60 * 1000;

  const starts = edges.map((e) => new Date(e.valid_from).getTime());
  const ends = edges.map((e) => {
    const d = new Date(e.valid_to);
    return d.getFullYear() >= SENTINEL_YEAR ? futureMs : d.getTime();
  });

  const minMs = Math.min(...starts);
  const maxMs = Math.max(...ends);
  const span = maxMs - minMs || 1;

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
        Validity windows
      </h2>
      <div className="space-y-2">
        {edges.map((e, i) => {
          const startMs = new Date(e.valid_from).getTime();
          const endD = new Date(e.valid_to);
          const isOpen = endD.getFullYear() >= SENTINEL_YEAR;
          const endMs = isOpen ? futureMs : endD.getTime();
          const left = ((startMs - minMs) / span) * 100;
          const width = ((endMs - startMs) / span) * 100;

          return (
            <div key={e.id ?? i} className="flex items-center gap-3">
              <span
                className="w-40 shrink-0 truncate text-[11px] text-muted"
                title={e.label}
              >
                {e.label}
              </span>
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: authorityColor(e.authority_level),
                    opacity: e.verification_status === "superseded" ? 0.3 : 1,
                  }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-[10px] text-muted">
                {isOpen
                  ? "Current"
                  : endD.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted">
        <span>
          {new Date(minMs).toLocaleDateString("en-IN", {
            month: "short",
            year: "numeric",
          })}
        </span>
        <span>Current</span>
      </div>
    </section>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { var: "var(--verified)", label: "L1–L2 verified" },
  { var: "var(--info)",     label: "L3 standard" },
  { var: "var(--caution)",  label: "L4–L5 field" },
  { var: "var(--muted)",    label: "Unverified", dashed: true },
  { var: "var(--danger)",   label: "Disputed" },
] satisfies { var: string; label: string; dashed?: boolean }[];

function GraphLegend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted">
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GraphPage() {
  const [assetId, setAssetId] = useState("P-101");
  const [inputValue, setInputValue] = useState("P-101");
  const [asOf, setAsOf] = useState("");
  const [graphData, setGraphData] = useState<KnowledgeGraphData | null>(null);

  useEffect(() => {
    let alive = true;
    getKnowledgeGraph(assetId, asOf || undefined).then(({ data }) => { if (alive) setGraphData(data); });
    return () => { alive = false; };
  }, [assetId, asOf]);

  function handleLoadGraph(id: string) {
    const trimmed = id.trim().toUpperCase();
    if (!trimmed) return;
    setAssetId(trimmed);
    setInputValue(trimmed);
  }

  function handleAsOfChange(val: string) {
    setAsOf(val);
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
          Layer 4 · Knowledge graph
        </p>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight text-balance">
          Temporal asset graph
        </h1>
        <p className="mt-1 text-[13.5px] text-muted text-pretty">
          1–2 hop neighborhood around the selected asset. Edges colored by authority level and styled
          by verification status. Click a node or edge to inspect its properties.
        </p>
      </header>

      {/* Controls: asset selector + as_of */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        {/* Asset search */}
        <div className="flex flex-col gap-1">
          <label htmlFor="asset-id" className="text-[11px] font-medium text-muted">
            Asset ID
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLoadGraph(inputValue);
            }}
            className="flex items-center gap-2"
          >
            <input
              id="asset-id"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="e.g. P-101"
              className="h-9 w-40 rounded-lg border border-line bg-surface px-3 text-[13px] outline-none focus-visible:border-accent"
            />
            <button
              type="submit"
              className="h-9 rounded-lg border border-accent bg-accent-soft px-3 text-[13px] font-medium text-accent transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]"
            >
              View
            </button>
          </form>
        </div>

        {/* Quick picks */}
        <div className="flex items-end gap-2">
          {EXAMPLE_ASSETS.map((id) => (
            <button
              key={id}
              onClick={() => handleLoadGraph(id)}
              className={cn(
                "h-9 rounded-lg border px-3 text-[12px] font-medium transition-colors",
                assetId === id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-surface text-muted hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:text-ink"
              )}
            >
              {id}
            </button>
          ))}
        </div>

        {/* Time-travel (Task 16) */}
        <div className="ml-auto flex flex-col gap-1">
          <label htmlFor="graph-asof" className="text-[11px] font-medium text-muted">
            As of (time travel)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="graph-asof"
              type="date"
              value={asOf}
              onChange={(e) => handleAsOfChange(e.target.value)}
              max={today}
              className="h-9 rounded-lg border border-line bg-surface px-2 text-[12px] outline-none focus-visible:border-accent"
            />
            {asOf && (
              <button
                onClick={() => handleAsOfChange("")}
                className="text-[11px] text-muted hover:text-ink"
                aria-label="Clear time travel date"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Graph canvas */}
      <KnowledgeGraph
        assetId={assetId}
        asOf={asOf || undefined}
        height={520}
      />

      {/* Legend */}
      <div className="mt-3">
        <GraphLegend />
      </div>

      {/* Validity timeline */}
      {graphData && graphData.edges.length > 0 && (
        <ValidityTimeline edges={graphData.edges} />
      )}
    </div>
  );
}
