"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ModelGateHistory, ModelGateResult, ValidationCorpusStats } from "@/lib/types";
import { getModelGateHistory, getValidationCorpusStats, runModelGate } from "@/lib/api";
import { StatusBadge, DemoChip } from "@/components/ui";
import { relativeTime } from "@/lib/utils";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXTURE_HISTORY: ModelGateHistory = {
  history: [
    { run_id: "mg-005", task_id: null, precision: 0.91, recall: 0.88, f1: 0.895, passed: true,  corpus_size: 142, run_at: new Date(Date.now() - 3600000).toISOString() },
    { run_id: "mg-004", task_id: null, precision: 0.87, recall: 0.84, f1: 0.855, passed: true,  corpus_size: 140, run_at: new Date(Date.now() - 86400000).toISOString() },
    { run_id: "mg-003", task_id: null, precision: 0.72, recall: 0.69, f1: 0.705, passed: false, corpus_size: 138, run_at: new Date(Date.now() - 172800000).toISOString() },
    { run_id: "mg-002", task_id: null, precision: 0.84, recall: 0.81, f1: 0.825, passed: true,  corpus_size: 135, run_at: new Date(Date.now() - 259200000).toISOString() },
    { run_id: "mg-001", task_id: null, precision: 0.79, recall: 0.76, f1: 0.775, passed: true,  corpus_size: 130, run_at: new Date(Date.now() - 432000000).toISOString() },
  ],
};

const FIXTURE_CORPUS: ValidationCorpusStats = {
  total_corpus_size: 142,
  by_entity_type: { fact: 68, procedure: 31, asset_spec: 24, regulation_clause: 19 },
  last_updated_at: new Date(Date.now() - 3600000).toISOString(),
};

const F1_THRESHOLD = 0.80;

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? "var(--verified)" : pct >= 75 ? "var(--caution)" : "var(--danger)";
  return (
    <div className="flex items-center gap-2">
      <span className="tabular w-20 shrink-0 text-label text-muted">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="tabular w-10 text-right text-label font-semibold" style={{ color }}>{pct}%</span>
    </div>
  );
}

function GateRow({ r }: { r: ModelGateResult }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 bg-surface">
      <span className="tabular text-caption text-muted w-28 shrink-0">{relativeTime(r.run_at)}</span>
      <StatusBadge tone={r.passed ? "verified" : "danger"}>{r.passed ? "passed" : "failed"}</StatusBadge>
      <div className="flex gap-3 text-caption">
        <span>P <span className="tabular font-semibold">{(r.precision * 100).toFixed(0)}%</span></span>
        <span>R <span className="tabular font-semibold">{(r.recall * 100).toFixed(0)}%</span></span>
        <span>F1 <span className="tabular font-semibold" style={{ color: r.f1 >= F1_THRESHOLD ? "var(--verified)" : "var(--danger)" }}>{(r.f1 * 100).toFixed(0)}%</span></span>
      </div>
      <span className="tabular ml-auto text-label text-muted">{r.corpus_size} items</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ModelGatePage() {
  const [history, setHistory] = useState<ModelGateResult[]>([]);
  const [corpus, setCorpus] = useState<ValidationCorpusStats | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getModelGateHistory(), getValidationCorpusStats()]).then(([histRes, corpRes]) => {
      if (!alive) return;
      const liveHistory = histRes.data?.history ?? [];
      setHistory(liveHistory.length > 0 ? liveHistory : FIXTURE_HISTORY.history);
      setCorpus(corpRes.data ?? FIXTURE_CORPUS);
      setIsDemo(histRes.source === "demo" || liveHistory.length === 0);
    }).catch(() => {
      if (!alive) return;
      setHistory(FIXTURE_HISTORY.history);
      setCorpus(FIXTURE_CORPUS);
      setIsDemo(true);
    });
    return () => { alive = false; };
  }, []);

  async function handleRun() {
    setRunning(true);
    setRunError(null);
    try {
      await runModelGate();
      // ponytail: no polling — Temporal task; user refreshes to see new run
    } catch {
      setRunError("Could not trigger run — backend offline.");
    } finally {
      setRunning(false);
    }
  }

  const latest = history[0] ?? null;
  const passRate = history.length
    ? Math.round((history.filter((r) => r.passed).length / history.length) * 100)
    : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/governance" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Governance
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">Layer 12 · Model gate</p>
          <h1 className="mt-1 text-display font-semibold leading-tight">Model gate</h1>
          <p className="mt-1 text-body text-muted text-pretty">
            Precision / recall gate on the validation corpus. A failed run blocks model promotion. Runs are
            triggered manually or by the nightly Temporal workflow.
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-body font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running ? "Triggering…" : "Run gate now"}
        </button>
      </header>

      {runError && <p className="mt-2 text-caption text-danger">{runError}</p>}

      {isDemo && <DemoChip />}

      {/* KPI row */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-3.5">
          <p className="text-micro font-semibold uppercase tracking-[0.1em] text-muted">Latest F1</p>
          <p className="tabular mt-1.5 text-display font-semibold leading-none" style={{ color: latest ? (latest.f1 >= F1_THRESHOLD ? "var(--verified)" : "var(--danger)") : "var(--muted)" }}>
            {latest ? `${(latest.f1 * 100).toFixed(0)}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3.5">
          <p className="text-micro font-semibold uppercase tracking-[0.1em] text-muted">Pass rate</p>
          <p className="tabular mt-1.5 text-display font-semibold leading-none text-ink">{passRate !== null ? `${passRate}%` : "—"}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3.5">
          <p className="text-micro font-semibold uppercase tracking-[0.1em] text-muted">Corpus size</p>
          <p className="tabular mt-1.5 text-display font-semibold leading-none text-ink">{corpus?.total_corpus_size ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3.5">
          <p className="text-micro font-semibold uppercase tracking-[0.1em] text-muted">Threshold</p>
          <p className="tabular mt-1.5 text-display font-semibold leading-none text-muted">{Math.round(F1_THRESHOLD * 100)}%</p>
        </div>
      </div>

      {/* Latest run metrics */}
      {latest && (
        <section className="mt-5 rounded-xl border border-line bg-surface p-4">
          <p className="text-label font-bold uppercase tracking-[0.1em] text-muted">Latest run · {relativeTime(latest.run_at)}</p>
          <div className="mt-3 space-y-2.5">
            <MetricBar value={latest.precision} label="Precision" />
            <MetricBar value={latest.recall} label="Recall" />
            <MetricBar value={latest.f1} label="F1" />
          </div>
        </section>
      )}

      {/* Run history */}
      {history.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-label font-bold uppercase tracking-[0.1em] text-muted">Run history</h2>
          <div className="overflow-hidden rounded-xl border border-line divide-y divide-line">
            {history.map((r) => <GateRow key={r.run_id} r={r} />)}
          </div>
        </section>
      )}

      {/* Validation corpus */}
      {corpus && (
        <section className="mt-5">
          <h2 className="mb-2 text-label font-bold uppercase tracking-[0.1em] text-muted">
            Validation corpus · {corpus.total_corpus_size} items
            {corpus.last_updated_at && ` · updated ${relativeTime(corpus.last_updated_at)}`}
          </h2>
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="mb-2.5 text-label font-semibold text-muted">By entity type</p>
            {Object.keys(corpus.by_entity_type ?? {}).length === 0 ? (
              <p className="text-caption text-muted">No validation corpus entries yet.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(corpus.by_entity_type).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-caption">
                    <span className="capitalize text-ink">{k.replace(/_/g, " ")}</span>
                    <span className="tabular font-semibold text-muted">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
