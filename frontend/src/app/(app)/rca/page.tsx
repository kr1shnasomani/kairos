"use client";

import { useState } from "react";
import type { RcaPack } from "@/lib/types";
import { RCA_PRESETS } from "@/lib/rca";
import { getRcaPack } from "@/lib/api";
import { AuthorityBadge, Button, SourceChip, StatusBadge } from "@/components/ui";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const SOURCE_LABEL: Record<string, string> = {
  neo4j: "graph",
  historian: "telemetry",
  supabase: "events",
  quarantine: "unverified",
};

export default function RcaPage() {
  const [asset, setAsset] = useState("P-101");
  const [code, setCode] = useState("SEAL-FAIL");
  const [pack, setPack] = useState<RcaPack | null>(null);
  const [loading, setLoading] = useState(false);

  function assemble(a = asset, c = code) {
    setAsset(a);
    setCode(c);
    setLoading(true);
    setPack(null);
    // Live POST /search/rca-pack; falls back to the curated fixture pack when offline.
    getRcaPack(a, c).then((p) => {
      setPack(p);
      setLoading(false);
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Root cause</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">RCA builder</h1>
        <p className="mt-1.5 max-w-xl text-[13.5px] text-muted">
          Assemble a failure timeline, evidence-weighted hypotheses, and supporting documents —
          fused from the graph, telemetry, and event history.
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); assemble(); }}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Asset</span>
          <input value={asset} onChange={(e) => setAsset(e.target.value)}
            className="tabular h-9 w-32 rounded-lg border border-line bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Failure code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)}
            className="tabular h-9 w-40 rounded-lg border border-line bg-surface-2 px-3 text-[13px] outline-none focus:border-accent" />
        </label>
        <Button variant="primary" type="submit">Assemble RCA pack</Button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {RCA_PRESETS.map((p) => (
          <button key={p.label} onClick={() => assemble(p.asset_id, p.failure_code)}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:text-accent">
            {p.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="mt-8 flex items-center gap-2 text-[13px] text-muted">
          <span className="inline-flex gap-1" aria-hidden="true">
            <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted" />
          </span>
          Assembling timeline, hypotheses, and evidence…
        </p>
      )}

      {pack && <RcaResult pack={pack} />}
    </div>
  );
}

function RcaResult({ pack }: { pack: RcaPack }) {
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-4">
        <span className="tabular text-[15px] font-semibold text-accent">{pack.asset_id}</span>
        <span className="tabular rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[12px]">{pack.failure_code}</span>
        <span className="tabular text-[12px] text-muted">{fmtTime(pack.incident_date)}</span>
        <div className="ml-auto flex items-center gap-2">
          {pack.synthesis_available
            ? <StatusBadge tone="verified">Synthesis</StatusBadge>
            : <StatusBadge tone="caution">Timeline only</StatusBadge>}
          <span className="tabular text-[12px] text-muted">conf {pack.confidence.toFixed(2)}</span>
        </div>
      </div>

      {pack.refused && (
        <div className="mt-5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-4">
          <StatusBadge tone="danger">Refused · safety-critical</StatusBadge>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink">
            This failure code is safety-critical. KAIROS does not synthesize hypotheses — the source
            documents are returned directly for engineer review.
          </p>
        </div>
      )}

      {/* Timeline */}
      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Timeline</h2>
        <ol className="mt-3 border-l border-line pl-5">
          {pack.timeline.map((e, i) => (
            <li key={i} className="relative pb-5 last:pb-0">
              <span className="absolute -left-[23px] top-1 size-2.5 rounded-full border-2 border-canvas bg-accent" aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular text-[11px] text-muted">{fmtTime(e.occurred_at)}</span>
                <span className="text-[12.5px] font-semibold capitalize">{e.event_type.replace(/_/g, " ")}</span>
                <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                  {SOURCE_LABEL[e.source] ?? e.source}
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{e.description}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Hypotheses */}
      {pack.hypotheses.length > 0 && (
        <section className="mt-7">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Ranked hypotheses</h2>
          <div className="mt-3 space-y-2.5">
            {pack.hypotheses.map((h, i) => (
              <article key={i} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center gap-3">
                  <span className="tabular text-[11px] font-bold text-muted">#{i + 1}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(h.evidence_weight * 100)}%` }} />
                  </div>
                  <span className="tabular text-[12px] font-semibold">{h.evidence_weight.toFixed(2)}</span>
                </div>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink">{h.hypothesis}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {h.sources.map((s) => <SourceChip key={s}>{s}</SourceChip>)}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Supporting documents */}
      <section className="mt-7">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Supporting documents</h2>
        <div className="mt-3 space-y-2">
          {pack.supporting_documents.map((d) => (
            <div key={d.document_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-3">
              <span className="text-[13px] font-semibold">{d.title}</span>
              <AuthorityBadge level={d.authority_level} />
              <span className="tabular ml-auto text-[11px] text-muted">conf {d.confidence.toFixed(2)}</span>
              <SourceChip>{d.document_id}</SourceChip>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
