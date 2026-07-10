"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CircuitBreakerState, CircuitBreakerEntry } from "@/lib/types";
import { getCircuitBreaker } from "@/lib/api";
import { StatusBadge } from "@/components/ui";

const FIXTURE: CircuitBreakerState = {
  halted_count: 2,
  states: [
    { asset_class: "Pump",       halted: false, z_score: 1.2, override_count_7d: 0, reason: "within_normal_range" },
    { asset_class: "Valve",      halted: true,  z_score: 3.8, override_count_7d: 4, reason: "z_score_exceeded" },
    { asset_class: "Instrument", halted: false, z_score: 0.6, override_count_7d: 1, reason: "within_normal_range" },
    { asset_class: "Vessel",     halted: false, z_score: 1.9, override_count_7d: 2, reason: "within_normal_range" },
    { asset_class: "Separator",  halted: true,  z_score: 4.1, override_count_7d: 7, reason: "z_score_exceeded" },
  ],
};

function ZScoreBar({ z }: { z: number }) {
  const MAX = 5;
  const pct = Math.min((z / MAX) * 100, 100);
  const color = z >= 3.5 ? "var(--danger)" : z >= 2.5 ? "var(--caution)" : "var(--verified)";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-surface-2">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="tabular text-[11.5px]" style={{ color }}>{z.toFixed(1)}σ</span>
    </div>
  );
}

function CircuitRow({ e }: { e: CircuitBreakerEntry }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${e.halted ? "bg-[color-mix(in_srgb,var(--danger)_5%,var(--surface))]" : "bg-surface"}`}>
      <span className="tabular w-28 shrink-0 text-[13px] font-semibold text-ink">{e.asset_class}</span>
      <StatusBadge tone={e.halted ? "danger" : "verified"}>{e.halted ? "halted" : "ok"}</StatusBadge>
      <ZScoreBar z={e.z_score} />
      <span className="tabular text-[11.5px] text-muted">{e.override_count_7d} override{e.override_count_7d !== 1 ? "s" : ""}/7d</span>
    </div>
  );
}

export default function CircuitBreakerPage() {
  const [state, setState] = useState<CircuitBreakerState | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    let alive = true;
    getCircuitBreaker().then(({ data, source }) => {
      if (!alive) return;
      setState(data ?? FIXTURE);
      setIsDemo(source === "demo" || !data);
    });
    return () => { alive = false; };
  }, []);

  // Defensive: `states` may be absent on a partial response — never crash the render.
  const states = state?.states ?? [];
  const halted = states.filter((e) => e.halted);
  const ok = states.filter((e) => !e.halted);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/governance" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Governance
      </Link>

      <header className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Layer 11 · SPC governor</p>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight">Circuit breaker</h1>
        <p className="mt-1 text-[13.5px] text-muted text-pretty">
          Statistical process control gates that halt ingestion for an asset class when z-score anomalies
          exceed threshold. Halted classes require admin override or human-verified resolution.
        </p>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isDemo && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data
          </span>
        )}
      </div>

      {/* KPI row */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">Total classes</p>
          <p className="tabular mt-1.5 text-[26px] font-semibold leading-none text-ink">{state ? states.length : "—"}</p>
        </div>
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_5%,var(--surface))] p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">Halted</p>
          <p className="tabular mt-1.5 text-[26px] font-semibold leading-none text-danger">{halted.length}</p>
        </div>
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--verified)_30%,var(--line))] bg-[color-mix(in_srgb,var(--verified)_5%,var(--surface))] p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">Operating</p>
          <p className="tabular mt-1.5 text-[26px] font-semibold leading-none text-verified">{ok.length}</p>
        </div>
      </div>

      {/* Halted first */}
      {!state ? (
        <div className="mt-5 flex justify-center py-8">
          <span className="inline-flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        </div>
      ) : states.length === 0 ? (
        <div className="mt-5 rounded-xl border border-line bg-surface px-4 py-8 text-center text-[13px] text-muted">
          No asset class has recorded extraction overrides — all ingestion paths are open.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-line divide-y divide-line">
          {[...halted, ...ok].map((e) => (
            <CircuitRow key={e.asset_class} e={e} />
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-dashed border-line bg-surface p-4 text-[12.5px] text-muted">
        <span className="font-semibold text-ink">What triggers a halt?</span>{" "}
        A z-score ≥ 2.0σ on ingested values for an asset class. Overrides by field workers increment the counter; ≥ 5 overrides/7d
        auto-escalates to admin review. Only admins can manually clear a halt.
      </div>
    </div>
  );
}
