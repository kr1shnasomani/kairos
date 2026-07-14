"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AuthorityLevel, QuarantineItem } from "@/lib/types";
import { getQuarantine, promoteQuarantine, disputeQuarantine, requestQuarantineInfo, type DataSource } from "@/lib/api";
import { relativeTime, triggerLabel, slaCountdown } from "@/lib/utils";
import { Button, FilterTabs, Modal, StatusBadge, DemoChip, PageHeader } from "@/components/ui";
import { useRole, PROMOTE_ROLES } from "@/components/use-role";

const AUTH_LEVELS: AuthorityLevel[] = [1, 2, 3, 4, 5];
const SESSION_TYPES = new Set(["elicitation_response", "offboarding_response", "voice_note"]);

// ── SLA countdown ─────────────────────────────────────────────────────────────

function SlaChip({ sla_due_at, is_overdue, resolved, nowMs }: { sla_due_at: string | null; is_overdue: boolean; resolved: boolean; nowMs: number }) {
  if (!sla_due_at || resolved) return null;
  if (is_overdue) return <span className="tabular text-label font-semibold text-danger">SLA overdue</span>;
  const { label, tone } = slaCountdown(sla_due_at, nowMs);
  return <span className={`tabular text-label font-semibold ${tone}`}>{label}</span>;
}

// ── Session context collapsible ───────────────────────────────────────────────

function SessionContextPanel({ ctx, inputType }: { ctx: Record<string, unknown>; inputType: string }) {
  const [open, setOpen] = useState(false);
  if (!SESSION_TYPES.has(inputType)) return null;
  const entries = Object.entries(ctx);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2.5 rounded-lg border border-line bg-surface-2 text-caption">
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
              <span className="block text-micro font-semibold uppercase tracking-[0.1em] text-muted">
                {k.replace(/_/g, " ")}
              </span>
              <span className="mt-0.5 block break-words text-caption text-ink">
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

type PanelMode = "promote" | "dispute" | "request-info";

export default function QuarantinePage() {
  const role = useRole();
  const canPromote = PROMOTE_ROLES.includes(role);

  const [items, setItems] = useState<QuarantineItem[]>([]);
  const [source, setSource] = useState<DataSource>("demo");
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState<{ id: string; mode: PanelMode } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

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

  async function requestInfo(item: QuarantineItem, note: string) {
    setBusy(item.item_id);
    setError(null);
    setNotice(null);
    try {
      await requestQuarantineInfo(item.item_id, note);
      setPanel(null);
      setNotice(`Request for more information recorded for ${item.item_id}.`);
    } catch {
      setError(`Could not record a request for ${item.item_id} — backend offline or rejected.`);
    } finally {
      setBusy(null);
    }
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
      <Link href="/governance" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Governance
      </Link>

      <PageHeader className="mt-4" eyebrow="Layer 6 · Quarantine" title="Review queue" lede="Unverified field inputs awaiting human review. Promotion to the canonical graph is a one-way gate — nothing is auto-promoted, ever." />

      <div className="mt-3 flex flex-wrap items-center gap-3 text-caption text-muted">
        <span className="tabular font-medium text-ink">{pendingCount} pending</span>
        {!canPromote && <span>· read-only ({role})</span>}
        {source === "demo" && <DemoChip />}
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
        <p className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-2 text-caption text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--verified)_35%,var(--line))] bg-[color-mix(in_srgb,var(--verified)_8%,var(--surface))] px-3 py-2 text-caption text-verified">
          {notice}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {loaded && visible.length === 0 && (
          <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-body text-muted">
            No items match the current filters.
          </div>
        )}
        {visible.map((it) => (
          <QuarantineCard
            key={it.item_id}
            item={it}
            canPromote={canPromote}
            busy={busy}
            nowMs={nowMs}
            onPromote={() => setPanel({ id: it.item_id, mode: "promote" })}
            onDispute={() => setPanel({ id: it.item_id, mode: "dispute" })}
            onRequestInfo={() => setPanel({ id: it.item_id, mode: "request-info" })}
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
          <Modal title={`Request information for ${panelItem.item_id}`} onClose={() => setPanel(null)}>
            <RequestInfoForm
              busy={busy === panelItem.item_id}
              onCancel={() => setPanel(null)}
              onSubmit={(note) => requestInfo(panelItem, note)}
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
  nowMs,
  onPromote,
  onDispute,
  onRequestInfo,
}: {
  item: QuarantineItem;
  canPromote: boolean;
  busy: string | null;
  nowMs: number;
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
        <span className="text-label text-muted">{triggerLabel(item.input_type)}</span>
        {item.asset_id && (
          <Link href={`/assets/${item.asset_id}`} className="tabular text-label text-accent hover:underline">
            {item.asset_id}
          </Link>
        )}
        {item.work_order_id && (
          <span className="tabular text-label text-muted">{item.work_order_id}</span>
        )}
        <SlaChip sla_due_at={item.sla_due_at} is_overdue={item.is_overdue} resolved={!pending} nowMs={nowMs} />
        <span className="tabular ml-auto text-label text-muted">{relativeTime(item.submitted_at)}</span>
      </div>

      <p className="mt-2.5 text-body leading-relaxed text-ink">{item.content}</p>
      <p className="mt-1.5 text-label text-muted">submitted by {item.submitted_by}</p>

      {item.session_context && (
        <SessionContextPanel ctx={item.session_context} inputType={item.input_type} />
      )}

      {isDeviation && pending && (
        <div className="mt-2.5 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_7%,var(--surface))] px-3 py-2">
          <p className="text-caption text-danger">
            Deviation flag —{" "}
            <Link href="/governance/conflicts" className="font-semibold underline hover:opacity-80">
              resolve via conflicts queue
            </Link>
          </p>
        </div>
      )}

      <div className="mt-3 border-t border-line pt-3">
        {!pending ? (
          <span className={`inline-flex items-center gap-1.5 text-caption font-semibold ${item.review_status === "promoted" ? "text-verified" : "text-danger"}`}>
            <span className={`size-1.5 rounded-full ${item.review_status === "promoted" ? "bg-verified" : "bg-danger"}`} aria-hidden="true" />
            {item.review_status === "promoted" ? "Promoted to canonical graph" : "Disputed"}
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {canPromote && (
              <Button variant="primary" onClick={onPromote} disabled={busy === item.item_id}>
                Promote
              </Button>
            )}
            <Button variant="ghost" onClick={onDispute} disabled={busy === item.item_id}>
              Dispute
            </Button>
            <Button variant="ghost" onClick={onRequestInfo} disabled={busy === item.item_id}>
              Request info
            </Button>
            {!canPromote && (
              <span className="text-label text-muted">Promotion requires reliability, engineer, or admin.</span>
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
      <p className="text-caption text-muted">
        Promotion is a one-way gate — this becomes human-verified canonical truth (confidence 1.0).
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-label font-semibold uppercase tracking-[0.1em] text-muted">Authority level</span>
          <select
            value={authority}
            onChange={(e) => setAuthority(Number(e.target.value) as AuthorityLevel)}
            className="tabular h-8 rounded-lg border border-line bg-surface px-2 text-caption outline-none focus:border-accent"
          >
            {AUTH_LEVELS.map((l) => <option key={l} value={l}>L{l}</option>)}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-label font-semibold uppercase tracking-[0.1em] text-muted">Relationship type</span>
          <input
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="tabular h-8 rounded-lg border border-line bg-surface px-2 text-caption outline-none focus:border-accent"
          />
        </label>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        aria-label="Notes"
        className="h-8 rounded-lg border border-line bg-surface px-2 text-caption outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Promoting…" : "Confirm promote"}
        </Button>
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
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
      <p className="text-caption text-muted">
        Flags the input as incorrect — it is kept for the record, not deleted.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for dispute"
        aria-label="Reason for dispute"
        className="h-8 rounded-lg border border-line bg-surface px-2 text-caption outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <Button variant="danger" type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Confirm dispute"}
        </Button>
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RequestInfoForm({ busy, onCancel, onSubmit }: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(note); }} className="flex flex-col gap-2.5">
      <p className="text-caption text-muted">
        This follow-up is recorded in the audit trail and leaves the item pending for review.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What evidence or clarification is needed?"
        aria-label="Requested information"
        required
        rows={4}
        className="resize-y rounded-lg border border-line bg-surface px-2 py-1.5 text-caption outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" type="submit" disabled={busy || !note.trim()}>
          {busy ? "Saving…" : "Record request"}
        </Button>
        <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
