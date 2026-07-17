"use client";

import { useMemo, useState } from "react";
import type { AuditLogEntry } from "@/lib/types";
import { getAuditLog } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { relativeTime } from "@/lib/utils";
import { Button, DataTable, DemoChip, EmptyState, FilterTabs, PageHeader, StatusBadge, type TableColumn } from "@/components/ui";
import { StatPills } from "@/components/stat-pills";

/** AuditLogEntry re-mapped so it satisfies DataTable's Record constraint. */
type AuditRow = Pick<AuditLogEntry, keyof AuditLogEntry>;

// Built lazily (mount-once useState initializer) — no Date.now() at module scope.
function buildFixture(): AuditLogEntry[] {
  const now = Date.now();
  return [
    { log_id: "AL-001", entity_type: "brief", entity_id: "BRIEF-2024-001", action: "brief_acknowledged", performed_by: "field_worker_01", timestamp: new Date(now - 7200000).toISOString(), metadata: { delivery_mode: "field_bottom_tabs" } },
    { log_id: "AL-002", entity_type: "document", entity_id: "DOC-OEM-001", action: "quarantine_promoted", performed_by: "engineer_kiran", timestamp: new Date(now - 14400000).toISOString(), metadata: { authority_level: 2, relationship_type: "DOCUMENTED_BY" } },
    { log_id: "AL-003", entity_type: "asset", entity_id: "P-101", action: "sla_escalated", performed_by: "system", timestamp: new Date(now - 28800000).toISOString(), metadata: { conflict_id: "CONF-0041", hours_overdue: 3 } },
    { log_id: "AL-004", entity_type: "document", entity_id: "DOC-INSP-007", action: "quarantine_disputed", performed_by: "admin_priya", timestamp: new Date(now - 172800000).toISOString(), metadata: { reason: "Conflicting measurement unit" } },
    { log_id: "AL-005", entity_type: "asset", entity_id: "V-247", action: "moc_resolved", performed_by: "engineer_kiran", timestamp: new Date(now - 345600000).toISOString(), metadata: { moc_id: "MOC-2024-003", decision: "approved" } },
  ];
}

const ACTION_TONE: Record<string, "danger" | "caution" | "verified" | "info" | "neutral"> = {
  sla_escalated: "danger",
  quarantine_disputed: "danger",
  timestamp_drift_detected: "caution",
  attribution_flag: "caution",
  circuit_breaker_override: "caution",
  recurring_failure_detected: "caution",
  brief_acknowledged: "verified",
  quarantine_promoted: "verified",
  moc_resolved: "verified",
  rca_pack_generated: "info",
  model_gate_result: "info",
  offboarding_programme_created: "info",
};

const ENTITY_TYPES = ["document", "brief", "asset"];

const COLUMNS: TableColumn<AuditRow>[] = [
  {
    key: "timestamp", label: "Recorded", sortValue: (r) => Date.parse(r.timestamp),
    render: (r) => <span className="tabular whitespace-nowrap text-caption text-muted" title={r.timestamp}>{relativeTime(r.timestamp)}</span>,
  },
  {
    key: "action", label: "Action", sortable: true,
    render: (r) => <StatusBadge tone={ACTION_TONE[r.action] ?? "neutral"} dot={false}>{r.action.replace(/_/g, " ")}</StatusBadge>,
  },
  {
    key: "entity_id", label: "Entity", sortable: true,
    render: (r) => (
      <span className="block min-w-0">
        <span className="tabular block truncate font-semibold text-accent">{r.entity_id}</span>
        <span className="block text-label capitalize text-muted">{r.entity_type}</span>
      </span>
    ),
  },
  {
    key: "performed_by", label: "Performed by", sortable: true,
    render: (r) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-ink">{r.performed_by}</span>
        <span className="tabular block truncate text-label text-muted">{r.log_id}</span>
      </span>
    ),
  },
  {
    key: "metadata", label: "Details", className: "w-full",
    render: (r) => {
      const meta = r.metadata ?? null;
      if (!meta || Object.keys(meta).length === 0) return <span className="text-muted">—</span>;
      return (
        // Native disclosure keeps the immutable record inspectable without row state.
        <details onClick={(e) => e.stopPropagation()}>
          <summary className="cursor-pointer text-label font-medium text-muted hover:text-ink">metadata</summary>
          <pre className="mt-1 max-w-[320px] overflow-x-auto rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-label text-muted">{JSON.stringify(meta, null, 2)}</pre>
        </details>
      );
    },
  },
];

export default function AuditPage() {
  const [fixture] = useState(buildFixture);
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [entityId, setEntityId] = useState("");
  const [entityIdInput, setEntityIdInput] = useState("");

  // Spec §5: params unchanged — { entity_id?, limit: 100 }, refetch on entity search.
  const state = useFetch(() => getAuditLog({ entity_id: entityId || undefined, limit: 100 }), [entityId]);
  const loading = state.status === "loading";
  const hasData = state.status === "live" || state.status === "demo";

  const entries = useMemo<AuditRow[]>(() => {
    if (!hasData) return [];
    const fetched = state.data.items ?? [];
    if (fetched.length > 0) return fetched;
    return fixture.filter((e) => !entityId || e.entity_id.toLowerCase().includes(entityId.toLowerCase()));
  }, [state, hasData, fixture, entityId]);
  const isDemo = state.status === "demo" || (hasData && (state.data.items ?? []).length === 0);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.entity_type] = (counts[e.entity_type] ?? 0) + 1;
    return counts;
  }, [entries]);

  const rows = useMemo(
    () => (entityTypeFilter === "all" ? entries : entries.filter((e) => e.entity_type === entityTypeFilter)),
    [entries, entityTypeFilter],
  );

  const exportHref = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(rows, null, 2))}`;

  return (
    <div data-testid="audit-workspace" className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Layer 7–8 · Immutable record"
        title="Audit trail"
        lede="Every governance decision, delivery, and model gate result — in chronological order. Immutable by design."
        actions={
          <>
            {isDemo && <DemoChip />}
            <a
              href={exportHref}
              download="kairos-audit-log.json"
              className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-caption font-semibold text-ink transition-colors hover:bg-surface-2"
            >
              Export JSON
            </a>
          </>
        }
      />

      <section data-testid="audit-summary" className="mt-5">
        <StatPills
          loading={loading}
          pills={[
            { key: "records", label: "Records", value: entries.length },
            { key: "document", label: "Documents", value: typeCounts.document ?? 0 },
            { key: "brief", label: "Briefs", value: typeCounts.brief ?? 0 },
            { key: "asset", label: "Assets", value: typeCounts.asset ?? 0 },
          ]}
        />
      </section>

      <section data-testid="audit-filters" className="mt-4 flex flex-wrap items-center gap-3">
        <FilterTabs
          tabs={[
            { key: "all", label: "All", count: entries.length },
            ...ENTITY_TYPES.map((t) => ({ key: t, label: `${t.charAt(0).toUpperCase() + t.slice(1)}s`, count: typeCounts[t] })),
          ]}
          active={entityTypeFilter}
          onChange={setEntityTypeFilter}
        />
        <form
          className="flex min-w-0 flex-1 items-center gap-2 sm:justify-end"
          onSubmit={(e) => { e.preventDefault(); setEntityId(entityIdInput.trim()); }}
        >
          <input
            value={entityIdInput}
            onChange={(e) => setEntityIdInput(e.target.value)}
            placeholder="Filter by entity ID…"
            aria-label="Filter by entity ID"
            className="tabular h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-caption outline-none transition-colors focus:border-accent sm:max-w-64"
          />
          <button type="submit" className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-caption font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink">
            Search
          </button>
          {entityId && (
            <button type="button" onClick={() => { setEntityId(""); setEntityIdInput(""); }} className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-caption text-muted hover:bg-surface-2 hover:text-ink" aria-label="Clear search">✕</button>
          )}
        </form>
      </section>

      <section data-testid="audit-entries" className="mt-4">
        {state.status === "error" ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-4 py-10 text-center">
            <p className="text-body text-muted">Could not load the audit trail.</p>
            <Button variant="primary" onClick={state.retry}>Retry</Button>
          </div>
        ) : (
          <DataTable<AuditRow>
            key={entityTypeFilter}
            columns={COLUMNS}
            rows={rows}
            keyFn={(r) => r.log_id}
            pageSize={25}
            loading={loading}
            emptyState={<EmptyState message="No audit activity" />}
          />
        )}
      </section>
    </div>
  );
}
