"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MocItem } from "@/lib/types";
import { getMocList, type DataSource } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import { FilterTabs, StatusBadge, DemoChip } from "@/components/ui";

// ── Demo fixture ──────────────────────────────────────────────────────────────

const FIXTURE: MocItem[] = [
  {
    moc_id: "MOC-2024-001",
    asset_id: "P-101",
    parameter: "operating_pressure",
    source_a: { value: "12.5 bar", document_id: "DOC-OEM-001" },
    source_b: { value: "14.0 bar", document_id: "DOC-INSP-007" },
    blast_radius_count: 7,
    status: "pending",
    created_at: new Date(Date.now() - 86400000).toISOString(),
    draft_content: "EWR Draft: Operating pressure discrepancy on P-101. Source OEM-001 records 12.5 bar; recent inspection DOC-INSP-007 records 14.0 bar. Recommend engineering review of seal ratings before next scheduled maintenance window.",
  },
  {
    moc_id: "MOC-2024-002",
    asset_id: "V-247",
    parameter: "relief_valve_setpoint",
    source_a: { value: "16 bar", document_id: "DOC-PROC-003" },
    source_b: { value: "18 bar", document_id: "DOC-OEM-008" },
    blast_radius_count: 3,
    status: "pending",
    created_at: new Date(Date.now() - 172800000).toISOString(),
    draft_content: null,
  },
  {
    moc_id: "MOC-2024-003",
    asset_id: "EQ-101",
    parameter: "maintenance_interval_days",
    source_a: { value: "90", document_id: "DOC-PROC-011" },
    source_b: { value: "120", document_id: "DOC-OEM-002" },
    blast_radius_count: 2,
    status: "approved",
    created_at: new Date(Date.now() - 432000000).toISOString(),
    draft_content: null,
  },
];

const STATUS_TONE: Record<string, "caution" | "verified" | "danger"> = {
  pending: "caution",
  approved: "verified",
  rejected: "danger",
};

export default function MocListPage() {
  const [items, setItems] = useState<MocItem[]>([]);
  const [source, setSource] = useState<DataSource>("demo");
  const [loaded, setLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");

  useEffect(() => {
    let alive = true;
    getMocList().then(({ data, source }) => {
      if (!alive) return;
      setItems(data.items.length > 0 ? data.items : FIXTURE);
      setSource(data.items.length > 0 ? source : "demo");
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const pendingCount = items.filter((m) => m.status === "pending").length;

  const visible = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((m) => m.status === statusFilter);
  }, [items, statusFilter]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/governance" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Governance
      </Link>

      <header className="mt-4">
        <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">Layer 7 · Engineering governance</p>
        <h1 className="mt-1 text-display font-semibold leading-tight">Management of Change</h1>
        <p className="mt-1.5 max-w-xl text-body text-muted text-pretty">
          Auto-drafted EWR items for engineering-track conflicts. Approval here closes the validity window
          of the superseded edge and clears any affected downstream facts.
        </p>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-caption text-muted">
        <span className="tabular font-medium text-ink">{pendingCount} pending</span>
        {source === "demo" && <DemoChip />}
      </div>

      <div className="mt-3">
        <FilterTabs
          tabs={[
            { key: "all", label: "All" },
            { key: "pending", label: "Pending", count: pendingCount },
            { key: "approved", label: "Approved" },
            { key: "rejected", label: "Rejected" },
          ]}
          active={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {loaded && visible.length === 0 && (
          <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-body text-muted">
            No MoC items match the current filter.
          </div>
        )}
        {visible.map((m) => (
          <Link key={m.moc_id} href={`/governance/moc/${m.moc_id}`} className="group block">
            <article className="rounded-xl border border-line bg-surface p-4 transition-colors group-hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--line))]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular text-body font-semibold text-accent">{m.moc_id}</span>
                <StatusBadge tone={STATUS_TONE[m.status] ?? "neutral"}>{m.status}</StatusBadge>
                <span className="tabular text-label text-muted">{m.asset_id}</span>
                <span className="tabular ml-auto text-label text-muted">{relativeTime(m.created_at)}</span>
              </div>
              <p className="mt-2 text-body">
                Discrepancy on <span className="font-semibold">{m.parameter.replace(/_/g, " ")}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-label text-muted">
                <span>
                  <span className="font-medium text-ink">{String(m.source_a?.value ?? "—")}</span>
                  {" vs "}
                  <span className="font-medium text-ink">{String(m.source_b?.value ?? "—")}</span>
                </span>
                {m.blast_radius_count > 0 && (
                  <span className="text-danger">
                    {m.blast_radius_count} downstream item{m.blast_radius_count !== 1 ? "s" : ""} flagged
                  </span>
                )}
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
