"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SlaReport, OverdueConflict, OverdueQuarantineItem } from "@/lib/types";
import { getSlaReport, type DataSource } from "@/lib/api";
import { triggerLabel } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";

// ── Demo fixture ──────────────────────────────────────────────────────────────

const FIXTURE: SlaReport = {
  total_conflicts: 12,
  on_time_conflicts: 8,
  overdue_conflicts: [
    {
      conflict_id: "CONF-0041",
      asset_id: "P-101",
      parameter: "operating_pressure",
      track: "engineering",
      severity: "critical",
      overdue_by_hours: 18,
      escalated: true,
    },
    {
      conflict_id: "CONF-0042",
      asset_id: "V-247",
      parameter: "relief_valve_setpoint",
      track: "administrative",
      severity: "major",
      overdue_by_hours: 5,
      escalated: false,
    },
    {
      conflict_id: "CONF-0043",
      asset_id: "EQ-101",
      parameter: "maintenance_interval_days",
      track: "administrative",
      severity: "minor",
      overdue_by_hours: 2,
      escalated: false,
    },
  ],
  total_quarantine: 19,
  on_time_quarantine: 14,
  overdue_quarantine: [
    {
      item_id: "QI-001",
      asset_id: "P-101",
      input_type: "field_observation",
      submitted_at: new Date(Date.now() - 172800000).toISOString(),
      overdue_by_hours: 36,
    },
    {
      item_id: "QI-002",
      asset_id: null,
      input_type: "voice_note",
      submitted_at: new Date(Date.now() - 86400000).toISOString(),
      overdue_by_hours: 8,
    },
    {
      item_id: "QI-003",
      asset_id: "V-248",
      input_type: "deviation_flag",
      submitted_at: new Date(Date.now() - 259200000).toISOString(),
      overdue_by_hours: 72,
    },
    {
      item_id: "QI-004",
      asset_id: "EQ-101",
      input_type: "elicitation_response",
      submitted_at: new Date(Date.now() - 43200000).toISOString(),
      overdue_by_hours: 4,
    },
    {
      item_id: "QI-005",
      asset_id: null,
      input_type: "offboarding_response",
      submitted_at: new Date(Date.now() - 518400000).toISOString(),
      overdue_by_hours: 144,
    },
  ],
  generated_at: new Date().toISOString(),
};

// ── SLA countdown chip ────────────────────────────────────────────────────────

function OverdueChip({ hours }: { hours: number }) {
  const tone = hours > 24 ? "text-danger" : hours > 4 ? "text-caution" : "text-muted";
  const label = hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h overdue` : `${hours}h overdue`;
  return <span className={`tabular text-[11.5px] font-semibold ${tone}`}>{label}</span>;
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, color }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
      <p className="tabular mt-1.5 text-[26px] font-semibold leading-none" style={{ color: color ?? "var(--ink)" }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SlaPage() {
  const [report, setReport] = useState<SlaReport | null>(null);
  const [source, setSource] = useState<DataSource>("demo");

  useEffect(() => {
    let alive = true;
    getSlaReport().then(({ data, source }) => {
      if (!alive) return;
      setReport(data ?? FIXTURE);
      setSource(data ? source : "demo");
    });
    return () => { alive = false; };
  }, []);

  const r = report ?? FIXTURE;
  const overdueConflicts = r.overdue_conflicts.length;
  const overdueQuarantine = r.overdue_quarantine.length;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/governance" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Governance
      </Link>

      <header className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Layer 7 · Case management</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">SLA report</h1>
        <p className="mt-1.5 max-w-xl text-[13.5px] text-muted text-pretty">
          Governance SLA state across conflicts and quarantine review. Overdue items are escalated for immediate attention.
        </p>
      </header>

      <div className="mt-2 flex items-center gap-3 text-[12px] text-muted">
        <span>
          Generated {new Date(r.generated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data
          </span>
        )}
      </div>

      {/* KPI grid */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Conflicts on time"
          value={r.on_time_conflicts}
          sub={`of ${r.total_conflicts} total`}
          color="var(--verified)"
        />
        <KpiTile
          label="Overdue conflicts"
          value={overdueConflicts}
          color={overdueConflicts > 0 ? "var(--danger)" : "var(--muted)"}
        />
        <KpiTile
          label="Quarantine on time"
          value={r.on_time_quarantine}
          sub={`of ${r.total_quarantine} total`}
          color="var(--verified)"
        />
        <KpiTile
          label="Overdue quarantine"
          value={overdueQuarantine}
          color={overdueQuarantine > 0 ? "var(--danger)" : "var(--muted)"}
        />
      </div>

      {/* Overdue conflicts table */}
      {r.overdue_conflicts.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Overdue conflicts — {r.overdue_conflicts.length}
          </h2>
          <div className="overflow-hidden rounded-xl border border-line">
            {r.overdue_conflicts.map((c: OverdueConflict, i) => (
              <div
                key={c.conflict_id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <Link
                  href={`/governance/conflicts`}
                  className="tabular text-[12.5px] font-semibold text-accent hover:underline"
                >
                  {c.conflict_id}
                </Link>
                <StatusBadge tone={c.track === "engineering" ? "danger" : "info"} dot={false}>
                  {c.track}
                </StatusBadge>
                <span className="tabular text-[11.5px] text-muted">{c.asset_id}</span>
                <span className="text-[12px] text-muted">{c.parameter.replace(/_/g, " ")}</span>
                <div className="ml-auto flex items-center gap-2">
                  {c.escalated && (
                    <StatusBadge tone="danger" dot={false}>escalated</StatusBadge>
                  )}
                  <OverdueChip hours={c.overdue_by_hours} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Overdue quarantine table */}
      {r.overdue_quarantine.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Overdue quarantine — {r.overdue_quarantine.length}
          </h2>
          <div className="overflow-hidden rounded-xl border border-line">
            {r.overdue_quarantine.map((q: OverdueQuarantineItem, i) => (
              <div
                key={q.item_id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <Link
                  href="/governance/quarantine"
                  className="tabular text-[12.5px] font-semibold text-accent hover:underline"
                >
                  {q.item_id}
                </Link>
                <span className="text-[12px] text-muted">{triggerLabel(q.input_type)}</span>
                {q.asset_id && (
                  <Link
                    href={`/assets/${q.asset_id}`}
                    className="tabular text-[11.5px] text-muted hover:text-accent"
                  >
                    {q.asset_id}
                  </Link>
                )}
                <div className="ml-auto">
                  <OverdueChip hours={q.overdue_by_hours} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {r.overdue_conflicts.length === 0 && r.overdue_quarantine.length === 0 && (
        <div className="mt-8 rounded-xl border border-line bg-surface px-4 py-8 text-center text-[13px] text-muted">
          All conflicts and quarantine items are within SLA.
        </div>
      )}
    </div>
  );
}
