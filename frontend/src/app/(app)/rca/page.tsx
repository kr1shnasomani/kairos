"use client";

import { useState } from "react";
import type { RcaPack, BriefSource, RcaHypothesis } from "@/lib/types";
import { RCA_PRESETS } from "@/lib/rca";
import { getRcaPack } from "@/lib/api";
import {
  AuthorityBadge,
  Button,
  SourceChip,
  StatusBadge,
  Timeline,
  ConfidenceMeter,
  RefusalCard,
  type TimelineEvent,
} from "@/components/ui";

const SOURCE_TONE: Record<string, TimelineEvent["tone"]> = {
  neo4j: "verified",
  historian: "info",
  supabase: "neutral",
  quarantine: "caution",
};

const SOURCE_LABEL: Record<string, string> = {
  neo4j: "graph",
  historian: "telemetry",
  supabase: "events",
  quarantine: "unverified",
};

function toTimelineEvents(pack: RcaPack): TimelineEvent[] {
  return pack.timeline.map((e, i) => ({
    id: `${e.event_type}-${i}`,
    timestamp: new Date(e.occurred_at).toLocaleString("en-GB", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    }),
    label: e.event_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: e.description,
    tone: SOURCE_TONE[e.source] ?? "neutral",
    meta: SOURCE_LABEL[e.source] ?? e.source,
  }));
}

function docsToBriefSources(pack: RcaPack): BriefSource[] {
  return pack.supporting_documents.map((d) => ({
    document_id: d.document_id,
    document_type: "document",
    title: d.title,
    authority_level: d.authority_level,
    relevant_excerpt: "",
    vault_url: null,
    is_quarantine: false,
  }));
}

export default function RcaPage() {
  const [asset, setAsset] = useState("P-101");
  const [code, setCode] = useState("SEAL-FAIL");
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().split("T")[0]);
  const [includeQuarantine, setIncludeQuarantine] = useState(false);
  const [pack, setPack] = useState<RcaPack | null>(null);
  const [loading, setLoading] = useState(false);

  function assemble(a = asset, c = code, d = incidentDate, q = includeQuarantine) {
    setAsset(a);
    setCode(c);
    setLoading(true);
    setPack(null);
    getRcaPack(a, c, `${d}T00:00:00Z`, q).then((p) => {
      setPack(p);
      setLoading(false);
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
          Layer 11 · Root cause
        </p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight text-balance">
          RCA workspace
        </h1>
        <p className="mt-1.5 max-w-xl text-[13.5px] text-muted text-pretty">
          Failure timeline, evidence-weighted hypotheses, and supporting documents — fused from the graph, telemetry, and event history.
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); assemble(); }}
        className="mt-6 space-y-4 rounded-xl border border-line bg-surface p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Asset</span>
            <input
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              className="tabular h-9 w-32 rounded-lg border border-line bg-surface-2 px-3 text-[13px] outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Failure code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="tabular h-9 w-40 rounded-lg border border-line bg-surface-2 px-3 text-[13px] outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Incident date</span>
            <input
              type="date"
              required
              value={incidentDate}
              onChange={(e) => setIncidentDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-[12px] outline-none focus:border-accent"
            />
          </label>
          <Button variant="primary" type="submit" className="mt-auto">
            Assemble
          </Button>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted">
          <input
            type="checkbox"
            checked={includeQuarantine}
            onChange={(e) => setIncludeQuarantine(e.target.checked)}
            className="size-3.5 rounded accent-accent"
          />
          Include unverified quarantine data (field observations, voice notes)
        </label>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {RCA_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => assemble(p.asset_id, p.failure_code)}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:text-accent"
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="mt-8 flex items-center gap-2 text-[13px] text-muted">
          <span className="inline-flex gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
          Assembling timeline, hypotheses, and evidence…
        </p>
      )}

      {pack && <RcaResult pack={pack} />}
    </div>
  );
}

function RcaResult({ pack }: { pack: RcaPack }) {
  const timelineEvents = toTimelineEvents(pack);
  const briefSources = docsToBriefSources(pack);

  return (
    <div className="mt-8 space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-4">
        <span className="tabular text-[15px] font-semibold text-accent">{pack.asset_id}</span>
        <span className="tabular rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[12px]">
          {pack.failure_code}
        </span>
        <span className="tabular text-[12px] text-muted">
          {new Date(pack.incident_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {pack.synthesis_available
            ? <StatusBadge tone="verified">Synthesis</StatusBadge>
            : <StatusBadge tone="caution">Timeline only</StatusBadge>}
          <ConfidenceMeter value={pack.confidence} />
        </div>
      </div>

      {/* Pack-level refusal */}
      {pack.refused ? (
        <RefusalCard
          reason="This failure code is safety-critical. KAIROS does not synthesize hypotheses — source documents are returned directly for engineer review."
          sources={briefSources}
          escalateTo="Reliability Engineer or Plant Safety Officer"
        />
      ) : null}

      {/* Synthesis unavailable — not a safety refusal, just no synthesis */}
      {!pack.refused && !pack.synthesis_available && (
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--caution)_35%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_8%,var(--surface))] px-4 py-3">
          <p className="text-[12.5px] text-ink">
            <span className="font-semibold">Synthesis unavailable</span> — raw event timeline shown.
            The graph may lack sufficient history for this failure code.
          </p>
        </div>
      )}

      {/* Timeline */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-muted">Timeline</h2>
        <Timeline events={timelineEvents} />
      </section>

      {/* Hypotheses */}
      {pack.hypotheses.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Ranked hypotheses
          </h2>
          <div className="space-y-2.5">
            {pack.hypotheses.map((h, i) => (
              <HypothesisCard key={h.hypothesis.slice(0, 60)} h={h} rank={i + 1} />
            ))}
          </div>
        </section>
      )}

      {/* Supporting documents */}
      {pack.supporting_documents.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Supporting documents
          </h2>
          <div className="space-y-2">
            {pack.supporting_documents.map((d) => (
              <div
                key={d.document_id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-3"
              >
                <span className="text-[13px] font-semibold">{d.title}</span>
                <AuthorityBadge level={d.authority_level} />
                <span className="tabular ml-auto text-[11px] text-muted">
                  conf {d.confidence.toFixed(2)}
                </span>
                <SourceChip>{d.document_id}</SourceChip>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function HypothesisCard({ h, rank }: { h: RcaHypothesis; rank: number }) {
  if (h.refused) {
    return (
      <RefusalCard
        reason={`Hypothesis #${rank}: ${h.hypothesis}`}
        escalateTo="Reliability Engineer"
      />
    );
  }

  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="tabular text-[11px] font-bold text-muted">#{rank}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.round(h.evidence_weight * 100)}%` }}
          />
        </div>
        <span className="tabular text-[12px] font-semibold">{h.evidence_weight.toFixed(2)}</span>
      </div>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink">{h.hypothesis}</p>
      {h.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {h.sources.map((s) => <SourceChip key={s}>{s}</SourceChip>)}
        </div>
      )}
    </article>
  );
}
