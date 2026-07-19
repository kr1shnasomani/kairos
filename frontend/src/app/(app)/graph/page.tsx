"use client";

import { useEffect, useState } from "react";
import { PageHeader, Timeline } from "@/components/ui";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import type { KnowledgeGraphData } from "@/lib/types";
import { getKnowledgeGraph } from "@/lib/api";
import { cn, nowMs } from "@/lib/utils";
import { GraphLegend, validityEvents } from "./_components/legend";

// EQ-101 first — it's a canonical asset with live knowledge edges. P-101 is a
// tag alias that the /assets/{id}/knowledge endpoint does not resolve (404), so
// it only renders the demo graph; kept as a pick, not the default.
const EXAMPLE_ASSETS = ["EQ-101", "V-247", "P-101"];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GraphPage() {
  const [assetId, setAssetId] = useState("EQ-101");
  const [inputValue, setInputValue] = useState("EQ-101");
  const [asOf, setAsOf] = useState("");
  const [graphData, setGraphData] = useState<KnowledgeGraphData | null>(null);
  const [graphSource, setGraphSource] = useState<"live" | "demo" | null>(null);

  useEffect(() => {
    let alive = true;
    getKnowledgeGraph(assetId, asOf || undefined).then(({ data, source }) => {
      if (!alive) return;
      setGraphData(data);
      setGraphSource(source);
    });
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

  const today = new Date(nowMs()).toISOString().split("T")[0];

  return (
    <div data-testid="graph-workspace" className="mx-auto max-w-[1400px]">
      <PageHeader className="mb-6" eyebrow="Layer 4 · Knowledge graph" title="Temporal asset graph" lede="Investigate the evidence, events, and governed relationships surrounding an asset at any point in time." />

      <section data-testid="graph-summary" className="grid overflow-hidden rounded-xl border border-line bg-surface shadow-sm sm:grid-cols-3">
        <div className="border-b border-line p-4 sm:border-b-0 sm:border-r">
          <p className="text-micro font-bold uppercase tracking-[0.1em] text-muted">Selected asset</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-title font-semibold text-ink">{assetId}</p>
            {graphSource && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-micro font-semibold text-accent">
                {graphSource === "live" ? "Live" : "Demo"}
              </span>
            )}
          </div>
          <p className="mt-1 text-label text-muted">{asOf ? `Snapshot · ${asOf}` : "Current knowledge state"}</p>
        </div>
        <div className="border-b border-line p-4 sm:border-b-0 sm:border-r">
          <p className="text-micro font-bold uppercase tracking-[0.1em] text-muted">Connected knowledge</p>
          <p className="mt-1 text-title font-semibold text-ink">
            {graphData ? `${graphData.nodes.length} nodes` : "Loading nodes"}
          </p>
          <p className="mt-1 text-label text-muted">Assets, evidence, events, and people</p>
        </div>
        <div className="p-4">
          <p className="text-micro font-bold uppercase tracking-[0.1em] text-muted">Relationships</p>
          <p className="mt-1 text-title font-semibold text-ink">
            {graphData ? `${graphData.edges.length} relationships` : "Loading relationships"}
          </p>
          <p className="mt-1 text-label text-muted">Authority and validity remain visible</p>
        </div>
      </section>

      {/* Controls: asset selector + as_of */}
      <section data-testid="graph-controls" className="mt-4 grid gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-end">
        {/* Asset search */}
        <div className="min-w-0">
          <label htmlFor="asset-id" className="text-label font-medium text-muted">
            Asset ID
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLoadGraph(inputValue);
            }}
            className="mt-1.5 flex min-w-0 items-center gap-2"
          >
            <input
              id="asset-id"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="e.g. P-101"
              className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-body outline-none focus-visible:border-accent sm:max-w-xs"
            />
            <button
              type="submit"
              className="h-11 rounded-lg border border-accent bg-accent-soft px-4 text-body font-medium text-accent transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]"
            >
              View
            </button>
          </form>
        </div>

        {/* Quick picks */}
        <div>
          <p className="text-label font-medium text-muted">Quick views</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
          {EXAMPLE_ASSETS.map((id) => (
            <button
              key={id}
              onClick={() => handleLoadGraph(id)}
              className={cn(
                "min-h-11 rounded-lg border px-3 text-caption font-medium transition-colors",
                assetId === id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-surface text-muted hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:text-ink"
              )}
            >
              {id}
            </button>
          ))}
          </div>
        </div>

        {/* Time-travel */}
        <div className="md:col-span-2 xl:col-span-1">
          <label htmlFor="graph-asof" className="text-label font-medium text-muted">
            As of (time travel)
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="graph-asof"
              type="date"
              value={asOf}
              onChange={(e) => handleAsOfChange(e.target.value)}
              max={today}
              className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-caption outline-none focus-visible:border-accent xl:w-44"
            />
            {asOf && (
              <button
                onClick={() => handleAsOfChange("")}
                className="min-h-11 rounded-lg px-2 text-label text-muted hover:bg-surface-2 hover:text-ink"
                aria-label="Clear time travel date"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      <div data-testid="graph-layout" className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <KnowledgeGraph assetId={assetId} asOf={asOf || undefined} height={560} />
          <p className="mt-2 text-label text-muted">Select a node or relationship to inspect its properties and evidence.</p>
        </div>

        {/* Height-matched to the 560px graph canvas; validity list scrolls internally
            so the panel never grows taller than the graph. */}
        <aside data-testid="graph-context" className="flex flex-col gap-4 lg:sticky lg:top-20 lg:h-[560px] lg:self-start">
          <section className="shrink-0 rounded-xl border border-line bg-surface p-4 shadow-sm">
            <p className="text-micro font-bold uppercase tracking-[0.1em] text-muted">Authority &amp; verification</p>
            <div className="mt-3"><GraphLegend /></div>
          </section>
          <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex shrink-0 items-center justify-between">
              <p className="text-micro font-bold uppercase tracking-[0.1em] text-muted">Validity windows</p>
              {graphData?.edges.length ? <span className="tabular text-label text-muted">{graphData.edges.length}</span> : null}
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {graphData?.edges.length
                ? <Timeline events={validityEvents(graphData.edges, (id) => graphData.nodes.find((n) => n.id === id)?.label)} />
                : <p className="text-label text-muted">Relationship windows appear when graph data is available.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
