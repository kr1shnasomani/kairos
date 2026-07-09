"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AuthorityLevel, QuarantineItem } from "@/lib/types";
import { getQuarantine, promoteQuarantine, disputeQuarantine, type DataSource } from "@/lib/api";
import { relativeTime, triggerLabel } from "@/lib/utils";
import { FilterTabs, Modal, StatusBadge } from "@/components/ui";
import { useRole, PROMOTE_ROLES } from "@/components/use-role";

const AUTH_LEVELS: AuthorityLevel[] = [1, 2, 3, 4, 5];
const SESSION_TYPES = new Set(["elicitation_response", "offboarding_response", "voice_note"]);

// ── SLA countdown ─────────────────────────────────────────────────────────────

function SlaChip({ sla_due_at, is_overdue, resolved }: { sla_due_at: string | null; is_overdue: boolean; resolved: boolean }) {
  if (!sla_due_at || resolved) return null;
  if (is_overdue) return <span className="tabular text-[11px] font-semibold text-danger">SLA overdue</span>;
  const msLeft = new Date(sla_due_at).getTime() - Date.now();
  const hoursLeft = Math.floor(msLeft / 3600000);
  const tone = hoursLeft < 4 ? "text-danger" : hoursLeft < 24 ? "text-caution" : "text-muted";
  const label = hoursLeft < 24 ? `${hoursLeft}h left` : `${Math.floor(hoursLeft / 24)}d left`;
  return <span className={`tabular text-[11px] font-semibold ${tone}`}>{label}</span>;
}

// ── Session context collapsible ───────────────────────────────────────────────

function SessionContextPanel({ ctx, inputType }: { ctx: Record<string, unknown>; inputType: string }) {
  const [open, setOpen] = useState(false);
  if (!SESSION_TYPES.has(inputType)) return null;
  const entries = Object.entries(ctx);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2.5 rounded-lg border border-line bg-surface-2 text-[12px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 font-semibold text-muted hover:text-ink"
      >
        <span>Session context · {entries.length} field{entries.length !== 1 ? "s" : ""}</span>
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 pb-3 pt-2">
          {entries.map(([k, v]) => (
            <div key={k}>
              <span className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                {k.replace(/_/g, " ")}
              </span>
              <span className="mt-0.5 block break-words text-[12px] text-ink">
                {typeof v === "object" ? JSON.stringify(v, null, 2) : String(v ?? "—")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type PanelMode = "promote" | "dispute" | "request_info";

export default function QuarantinePage() {
  const role = useRole();
  const canPromote = PROMOTE_ROLES.includes(role);

  const [items, setItems] = useState<QuarantineItem[]>([]);
  const [source, setSource] = useState<DataSource>("demo");
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState<{ id: string; mode: PanelMode } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending");

  useEffect(() => {
    let alive = true;
    getQuarantine().then(({ data, source }) => {
      if (!alive) return;
      setItems(data.items);
      setSource(source);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  function setItemStatus(id: string, review_status: QuarantineItem["review_status"]) {
    setItems((xs) => xs.map((x) => (x.item_id === id ? { ...x, review_status } : x)));
  }

  async function promote(item: QuarantineItem, authority_level: AuthorityLevel, relationship_type: string, notes: string) {
    setBusy(item.item_id);
    setError(null);
    const prev = items;
    setItemStatus(item.item_id, "promoted");
    setPanel(null);
    try {
      await promoteQuarantine(item.item_id, {
        authority_level,
        relationship_type: relationship_type || "DOCUMENTED_BY",
        document_type: "procedure",
        notes: notes || undefined,
      });
    } catch {
      setItems(prev);
      setError(`Could not promote ${item.item_id} — backend offline or rejected.`);
    } finally {
      setBusy(null);
    }
  }

  async function dispute(item: QuarantineItem, reason: string) {
    setBusy(item.item_id);
    setError(null);
    const prev = items;
    setItemStatus(item.item_id, "disputed");
    setPanel(null);
    try {
      await disputeQuarantine(item.item_id, reason || "Disputed by reviewer");
    } catch {
      setItems(prev);
      setError(`Could not dispute ${item.item_id} — backend offline or rejected.`);
    } finally {
      setBusy(null);
    }
  }

  // ponytail: no dedicated request_info endpoint yet — note captured client-side only
  function requestInfo(_item: QuarantineItem, _note: string, _reTrigger: boolean) {
    setPanel(null);
  }

  const visible = useMemo(() => {
    return items.filter((it) => {
      if (typeFilter !== "all" && it.input_type !== typeFilter) return false;
      if (statusFilter === "pending" && it.review_status !== "pending") return false;
      if (statusFilter === "resolved" && it.review_status === "pending") return false;
      return true;
    });
  }, [items, typeFilter, statusFilter]);

  const pendingCount = items.filter((i) => i.review_status === "pending").length;

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of items.filter((i) => i.review_status === "pending")) {
      counts[it.input_type] = (counts[it.input_type] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const panelItem = panel ? items.find((i) => i.item_id === panel.id) ?? null : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/governance" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Governance
      </Link>

      <header className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Layer 6 · Quarantine</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Review queue</h1>
        <p className="mt-1.5 max-w-xl text-[13.5px] text-muted text-pretty">
          Unverified field inputs awaiting human review. Promotion to the canonical graph is a one-way gate — nothing is auto-promoted, ever.
        </p>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
        <span className="tabular font-medium text-ink">{pendingCount} pending</span>
        {!canPromote && <span>· read-only ({role})</span>}
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <FilterTabs
          tabs={[
            { key: "all", label: "All" },
            { key: "pending", label: "Pending", count: pendingCount },
            { key: "resolved", label: "Resolved" },
          ]}
          active={statusFilter}
          onChange={setStatusFilter}
        />
        <FilterTabs
          tabs={[
            { key: "all", label: "All types" },
            { key: "field_observation", label: "Field obs.", count: typeCounts["field_observation"] },
            { key: "voice_note", label: "Voice", count: typeCounts["voice_note"] },
            { key: "elicitation_response", label: "Elicitation", count: typeCounts["elicitation_response"] },
            { key: "offboarding_response", label: "Offboarding", count: typeCounts["offboarding_response"] },
            { key: "deviation_flag", label: "Deviation", count: typeCounts["deviation_flag"] },
          ]}
          active={typeFilter}
          onChange={setTypeFilter}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {loaded && visible.length === 0 && (
          <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-[13px] text-muted">
            No items match the current filters.
          </div>
        )}
        {visible.map((it) => (
          <QuarantineCard
            key={it.item_id}
            item={it}
            canPromote={canPromote}
            busy={busy}
            onPromote={() => setPanel({ id: it.item_id, mode: "promote" })}
            onDispute={() => setPanel({ id: it.item_id, mode: "dispute" })}
            onRequestInfo={() => setPanel({ id: it.item_id, mode: "request_info" })}
          />
        ))}
      </div>

      {panelItem && panel && (
        panel.mode === "promote" ? (
          <Modal title={`Promote ${panelItem.item_id} to canonical graph`} onClose={() => setPanel(null)}>
            <PromoteForm
              busy={busy === panelItem.item_id}
              onCancel={() => setPanel(null)}
              onSubmit={(lvl, rel, notes) => promote(panelItem, lvl, rel, notes)}
            />
          </Modal>
        ) : panel.mode === "dispute" ? (
          <Modal title={`Dispute ${panelItem.item_id}`} onClose={() => setPanel(null)}>
            <DisputeForm
              busy={busy === panelItem.item_id}
              onCancel={() => setPanel(null)}
              onSubmit={(reason) => dispute(panelItem, reason)}
            />
          </Modal>
        ) : (
          <Modal title={`Request more information — ${panelItem.item_id}`} onClose={() => setPanel(null)}>
            <RequestInfoForm
              onCancel={() => setPanel(null)}
              onSubmit={(note, reTrigger) => requestInfo(panelItem, note, reTrigger)}
              isElicitation={panelItem.input_type === "elicitation_response" || panelItem.input_type === "offboarding_response"}
            />
          </Modal>
        )
      )}
    </div>
  );
}

// ── Quarantine card ───────────────────────────────────────────────────────────

function QuarantineCard({
  item,
  canPromote,
  busy,
  onPromote,
  onDispute,
  onRequestInfo,
}: {
  item: QuarantineItem;
  canPromote: boolean;
  busy: string | null;
  onPromote: () => void;
  onDispute: () => void;
  onRequestInfo: () => void;
}) {
  const pending = item.review_status === "pending";
  const isDeviation = item.input_type === "deviation_flag";

  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="caution">Unverified</StatusBadge>
        <span className="text-[11px] text-muted">{triggerLabel(item.input_type)}</span>
        {item.asset_id && (
          <Link href={`/assets/${item.asset_id}`} className="tabular text-[11px] text-accent hover:underline">
            {item.asset_id}
          </Link>
        )}
        {item.work_order_id && (
          <span className="tabular text-[11px] text-muted">{item.work_order_id}</span>
        )}
        <SlaChip sla_due_at={item.sla_due_at} is_overdue={item.is_overdue} resolved={!pending} />
        <span className="tabular ml-auto text-[11px] text-muted">{relativeTime(item.submitted_at)}</span>
      </div>

      <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink">{item.content}</p>
      <p className="mt-1.5 text-[11px] text-muted">submitted by {item.submitted_by}</p>

      {item.session_context && (
        <SessionContextPanel ctx={item.session_context} inputType={item.input_type} />
      )}

      {isDeviation && pending && (
        <div className="mt-2.5 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_7%,var(--surface))] px-3 py-2">
          <p className="text-[12px] text-danger">
            Deviation flag —{" "}
            <Link href="/governance/conflicts" className="font-semibold underline hover:opacity-80">
              resolve via conflicts queue
            </Link>
          </p>
        </div>
      )}

      <div className="mt-3 border-t border-line pt-3">
        {!pending ? (
          <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${item.review_status === "promoted" ? "text-verified" : "text-danger"}`}>
            <span className={`size-1.5 rounded-full ${item.review_status === "promoted" ? "bg-verified" : "bg-danger"}`} aria-hidden="true" />
            {item.review_status === "promoted" ? "Promoted to canonical graph" : "Disputed"}
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {canPromote && (
              <button
                onClick={onPromote}
                disabled={busy === item.item_id}
                className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Promote
              </button>
            )}
            <button
              onClick={onDispute}
              disabled={busy === item.item_id}
              className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
            >
              Dispute
            </button>
            <button
              onClick={onRequestInfo}
              className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Request info
            </button>
            {!canPromote && (
              <span className="text-[11px] text-muted">Promotion requires reliability, engineer, or admin.</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────

function PromoteForm({ busy, onCancel, onSubmit }: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (authority: AuthorityLevel, relationship: string, notes: string) => void;
}) {
  const [authority, setAuthority] = useState<AuthorityLevel>(4);
  const [relationship, setRelationship] = useState("DOCUMENTED_BY");
  const [notes, setNotes] = useState("");

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(authority, relationship, notes); }}
      className="flex flex-col gap-3"
    >
      <p className="text-[12px] text-muted">
        Promotion is a one-way gate — this becomes human-verified canonical truth (confidence 1.0).
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Authority level</span>
          <select
            value={authority}
            onChange={(e) => setAuthority(Number(e.target.value) as AuthorityLevel)}
            className="tabular h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
          >
            {AUTH_LEVELS.map((l) => <option key={l} value={l}>L{l}</option>)}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Relationship type</span>
          <input
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="tabular h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
          />
        </label>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-on-accent disabled:opacity-50"
        >
          {busy ? "Promoting…" : "Confirm promote"}
        </button>
        <button type="button" onClick={onCancel} className="text-[12.5px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}

function DisputeForm({ busy, onCancel, onSubmit }: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(reason); }}
      className="flex flex-col gap-2.5"
    >
      <p className="text-[12px] text-muted">
        Flags the input as incorrect — it is kept for the record, not deleted.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for dispute"
        className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-8 items-center rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] px-3 text-[12.5px] font-semibold text-danger disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Confirm dispute"}
        </button>
        <button type="button" onClick={onCancel} className="text-[12.5px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RequestInfoForm({ onCancel, onSubmit, isElicitation }: {
  onCancel: () => void;
  onSubmit: (note: string, reTrigger: boolean) => void;
  isElicitation: boolean;
}) {
  const [note, setNote] = useState("");
  const [reTrigger, setReTrigger] = useState(false);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(note, reTrigger); }}
      className="flex flex-col gap-3"
    >
      <p className="text-[12px] text-muted">
        Send this item back for clarification. The reviewer note is saved; a dedicated backend action will relay it when available.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Reviewer note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required
          rows={3}
          placeholder="What clarification is needed?"
          className="resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] outline-none focus:border-accent"
        />
      </label>
      {isElicitation && (
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted">
          <input
            type="checkbox"
            checked={reTrigger}
            onChange={(e) => setReTrigger(e.target.checked)}
            className="size-3 rounded accent-accent"
          />
          Re-trigger targeted elicitation question (backend-gated)
        </label>
      )}
      <p className="text-[11px] text-muted italic">
        Note: dedicated <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[10.5px] not-italic">request_info</code> endpoint not yet live — note captured locally.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] font-semibold text-ink transition-colors hover:bg-surface-2"
        >
          Send request
        </button>
        <button type="button" onClick={onCancel} className="text-[12.5px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
