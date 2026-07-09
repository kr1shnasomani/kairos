"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuditLogEntry } from "@/lib/types";
import { getAuditLog, type DataSource } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import { FilterTabs, StatusBadge } from "@/components/ui";

// ── Static fixture for demo mode ──────────────────────────────────────────────

const FIXTURE_ENTRIES: AuditLogEntry[] = [
  {
    log_id: "AL-001",
    entity_type: "brief",
    entity_id: "BRIEF-2024-001",
    action: "brief_acknowledged",
    performed_by: "field_worker_01",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    metadata: { delivery_mode: "field_bottom_tabs" },
  },
  {
    log_id: "AL-002",
    entity_type: "document",
    entity_id: "DOC-OEM-001",
    action: "quarantine_promoted",
    performed_by: "engineer_kiran",
    timestamp: new Date(Date.now() - 14400000).toISOString(),
    metadata: { authority_level: 2, relationship_type: "DOCUMENTED_BY" },
  },
  {
    log_id: "AL-003",
    entity_type: "asset",
    entity_id: "P-101",
    action: "sla_escalated",
    performed_by: "system",
    timestamp: new Date(Date.now() - 28800000).toISOString(),
    metadata: { conflict_id: "CONF-0041", hours_overdue: 3 },
  },
  {
    log_id: "AL-004",
    entity_type: "brief",
    entity_id: "BRIEF-2024-002",
    action: "rca_pack_generated",
    performed_by: "engineer_meera",
    timestamp: new Date(Date.now() - 43200000).toISOString(),
    metadata: { failure_code: "SEAL-FAIL", confidence: 0.84 },
  },
  {
    log_id: "AL-005",
    entity_type: "asset",
    entity_id: "V-247",
    action: "timestamp_drift_detected",
    performed_by: "system",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    metadata: { drift_seconds: 312, source: "historian" },
  },
  {
    log_id: "AL-006",
    entity_type: "document",
    entity_id: "DOC-INSP-007",
    action: "quarantine_disputed",
    performed_by: "admin_priya",
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    metadata: { reason: "Conflicting measurement unit" },
  },
  {
    log_id: "AL-007",
    entity_type: "brief",
    entity_id: "BRIEF-2024-003",
    action: "model_gate_result",
    performed_by: "system",
    timestamp: new Date(Date.now() - 259200000).toISOString(),
    metadata: { gate: "f1_threshold", result: "passed", f1: 0.91 },
  },
  {
    log_id: "AL-008",
    entity_type: "asset",
    entity_id: "P-101",
    action: "moc_resolved",
    performed_by: "engineer_kiran",
    timestamp: new Date(Date.now() - 345600000).toISOString(),
    metadata: { moc_id: "MOC-2024-003", decision: "approved" },
  },
];

// ── Action tone map ───────────────────────────────────────────────────────────

const ACTION_TONE: Record<string, "danger" | "caution" | "verified" | "info" | "neutral"> = {
  sla_escalated: "danger",
  quarantine_disputed: "danger",
  timestamp_drift_detected: "caution",
  attribution_flag: "caution",
  circuit_breaker_override: "caution",
  brief_acknowledged: "verified",
  quarantine_promoted: "verified",
  moc_resolved: "verified",
  rca_pack_generated: "info",
  model_gate_result: "info",
  offboarding_programme_created: "info",
  recurring_failure_detected: "caution",
};

const ENTITY_TYPES = ["document", "brief", "asset"];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [source, setSource] = useState<DataSource>("demo");
  const [loaded, setLoaded] = useState(false);

  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [entityId, setEntityId] = useState("");
  const [entityIdInput, setEntityIdInput] = useState("");

  useEffect(() => {
    let alive = true;
    getAuditLog({ limit: 100 }).then(({ data, source }) => {
      if (!alive) return;
      const raw = data.items.length > 0 ? data.items : FIXTURE_ENTRIES;
      setEntries(raw);
      setSource(data.items.length > 0 ? source : "demo");
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  // Re-fetch when entity_id filter changes
  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    getAuditLog({ entity_id: entityId || undefined, limit: 100 }).then(({ data, source }) => {
      if (!alive) return;
      const raw = data.items.length > 0 ? data.items : FIXTURE_ENTRIES.filter(
        (e) => !entityId || e.entity_id.toLowerCase().includes(entityId.toLowerCase())
      );
      setEntries(raw);
      setSource(data.items.length > 0 ? source : "demo");
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  const visible = useMemo(() => {
    if (entityTypeFilter === "all") return entries;
    return entries.filter((e) => e.entity_type === entityTypeFilter);
  }, [entries, entityTypeFilter]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      counts[e.entity_type] = (counts[e.entity_type] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
          Layer 7–8 · Immutable record
        </p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Audit trail</h1>
        <p className="mt-1.5 max-w-xl text-[13.5px] text-muted text-pretty">
          Every governance decision, delivery, and model gate result — in chronological order. Immutable by design.
        </p>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="tabular text-[12px] font-medium text-ink">{visible.length} entries</span>
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data
          </span>
        )}
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); setEntityId(entityIdInput.trim()); }}
        >
          <input
            value={entityIdInput}
            onChange={(e) => setEntityIdInput(e.target.value)}
            placeholder="Filter by entity ID…"
            aria-label="Filter by entity ID"
            className="tabular h-8 w-44 rounded-lg border border-line bg-surface px-3 text-[12.5px] outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Search
          </button>
          {entityId && (
            <button
              type="button"
              onClick={() => { setEntityId(""); setEntityIdInput(""); }}
              className="text-[12px] text-muted hover:text-ink"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </form>
      </div>

      <div className="mt-3">
        <FilterTabs
          tabs={[
            { key: "all", label: "All", count: entries.length },
            ...ENTITY_TYPES.map((t) => ({
              key: t,
              label: t.charAt(0).toUpperCase() + t.slice(1),
              count: typeCounts[t],
            })),
          ]}
          active={entityTypeFilter}
          onChange={setEntityTypeFilter}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {loaded && visible.length === 0 && (
          <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-[13px] text-muted">
            No audit entries match the current filters.
          </div>
        )}
        {visible.map((entry) => (
          <AuditRow key={entry.log_id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

// ── Audit row ─────────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const tone = ACTION_TONE[entry.action] ?? "neutral";
  const hasMeta = entry.metadata && Object.keys(entry.metadata).length > 0;

  return (
    <article className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <StatusBadge tone={tone} dot={false}>{entry.action.replace(/_/g, " ")}</StatusBadge>
        <span className="tabular text-[12px] text-muted">
          <span className="font-semibold text-ink">{entry.entity_type}</span>
          {" · "}
          <span className="text-accent">{entry.entity_id}</span>
        </span>
        <span className="tabular ml-auto shrink-0 text-[11px] text-muted">{relativeTime(entry.timestamp)}</span>
      </div>

      <div className="mt-1.5 flex items-center gap-2 text-[11.5px] text-muted">
        <span>by <span className="font-medium text-ink">{entry.performed_by}</span></span>
        <span className="text-[10px]">·</span>
        <span className="tabular">{entry.log_id}</span>
        {hasMeta && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="ml-auto text-[11px] text-muted hover:text-ink"
          >
            {expanded ? "Hide metadata" : "Show metadata"}
          </button>
        )}
      </div>

      {expanded && hasMeta && (
        <div className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
          <pre className="overflow-x-auto text-[11px] text-muted">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
      )}
    </article>
  );
}
