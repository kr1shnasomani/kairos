"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SlaReport, OverdueConflict, OverdueQuarantineItem } from "@/lib/types";
import { getSlaReport, type DataSource } from "@/lib/api";
import { triggerLabel, overdueHours } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";

// ── Demo fixture ──────────────────────────────────────────────────────────────

const FIXTURE: SlaReport = {
  checked_at: new Date().toISOString(),
  escalated_this_run: { conflicts: 1, quarantine_items: 2 },
  overdue_conflicts: [
    {
      conflict_id: "CONF-0041",
      track: "engineering",
      asset_id: "P-101",
      sla_deadline: new Date(Date.now() - 18 * 3600000).toISOString(),
      escalated_at: new Date(Date.now() - 2 * 3600000).toISOString(),
      status: "open",
    },
    {
      conflict_id: "CONF-0042",
      track: "administrative",
      asset_id: "V-247",
      sla_deadline: new Date(Date.now() - 5 * 3600000).toISOString(),
      escalated_at: null,
      status: "open",
    },
  ],
  overdue_conflicts_total: 2,
  overdue_quarantine_items: [
    {
      item_id: "QI-001",
      asset_id: "P-101",
      input_type: "field_observation",
      sla_due_at: new Date(Date.now() - 36 * 3600000).toISOString(),
      escalated_at: new Date(Date.now() - 12 * 3600000).toISOString(),
    },
    {
      item_id: "QI-002",
      asset_id: null,
      input_type: "voice_note",
      sla_due_at: new Date(Date.now() - 8 * 3600000).toISOString(),
      escalated_at: null,
    },
  ],
  overdue_quarantine_total: 2,
};

// ── SLA overdue chip ──────────────────────────────────────────────────────────

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
  // Defensive: a partial/absent response must never crash the render.
  const conflicts = r.overdue_conflicts ?? [];
  const quarantine = r.overdue_quarantine_items ?? [];
  const conflictsTotal = r.overdue_conflicts_total ?? conflicts.length;
  const quarantineTotal = r.overdue_quarantine_total ?? quarantine.length;
  const escalated = r.escalated_this_run ?? { conflicts: 0, quarantine_items: 0 };

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
          Checked {new Date(r.checked_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
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
          label="Overdue conflicts"
          value={conflictsTotal}
          color={conflictsTotal > 0 ? "var(--danger)" : "var(--verified)"}
        />
        <KpiTile
          label="Overdue quarantine"
          value={quarantineTotal}
          color={quarantineTotal > 0 ? "var(--danger)" : "var(--verified)"}
        />
        <KpiTile
          label="Escalated conflicts"
          value={escalated.conflicts}
          sub="this run"
          color={escalated.conflicts > 0 ? "var(--caution)" : "var(--muted)"}
        />
        <KpiTile
          label="Escalated quarantine"
          value={escalated.quarantine_items}
          sub="this run"
          color={escalated.quarantine_items > 0 ? "var(--caution)" : "var(--muted)"}
        />
      </div>

      {/* Overdue conflicts table */}
      {conflicts.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Overdue conflicts — {conflictsTotal}
          </h2>
          <div className="overflow-hidden rounded-xl border border-line">
            {conflicts.map((c: OverdueConflict, i) => (
              <div
                key={c.conflict_id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <Link
                  href="/governance/conflicts"
                  className="tabular text-[12.5px] font-semibold text-accent hover:underline"
                >
                  {c.conflict_id}
                </Link>
                <StatusBadge tone={c.track === "engineering" ? "danger" : "info"} dot={false}>
                  {c.track}
                </StatusBadge>
                {c.asset_id && <span className="tabular text-[11.5px] text-muted">{c.asset_id}</span>}
                <span className="text-[12px] text-muted">{c.status}</span>
                <div className="ml-auto flex items-center gap-2">
                  {c.escalated_at && (
                    <StatusBadge tone="danger" dot={false}>escalated</StatusBadge>
                  )}
                  <OverdueChip hours={overdueHours(c.sla_deadline)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Overdue quarantine table */}
      {quarantine.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Overdue quarantine — {quarantineTotal}
          </h2>
          <div className="overflow-hidden rounded-xl border border-line">
            {quarantine.map((q: OverdueQuarantineItem, i) => (
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
                <div className="ml-auto flex items-center gap-2">
                  {q.escalated_at && (
                    <StatusBadge tone="danger" dot={false}>escalated</StatusBadge>
                  )}
                  <OverdueChip hours={overdueHours(q.sla_due_at)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {conflicts.length === 0 && quarantine.length === 0 && (
        <div className="mt-8 rounded-xl border border-line bg-surface px-4 py-8 text-center text-[13px] text-muted">
          All conflicts and quarantine items are within SLA.
        </div>
      )}
    </div>
  );
}
