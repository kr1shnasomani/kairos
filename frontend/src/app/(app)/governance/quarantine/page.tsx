"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuthorityLevel, QuarantineItem } from "@/lib/types";
import { getQuarantine, promoteQuarantine, disputeQuarantine, type DataSource } from "@/lib/api";
import { relativeTime, triggerLabel } from "@/lib/utils";
import { Modal, StatusBadge } from "@/components/ui";
import { useRole, PROMOTE_ROLES } from "@/components/use-role";

const AUTH_LEVELS: AuthorityLevel[] = [1, 2, 3, 4, 5];

export default function QuarantinePage() {
  const role = useRole();
  const canPromote = PROMOTE_ROLES.includes(role);

  const [items, setItems] = useState<QuarantineItem[]>([]);
  const [source, setSource] = useState<DataSource>("demo");
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState<{ id: string; mode: "promote" | "dispute" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getQuarantine().then(({ data, source }) => {
      if (!alive) return;
      setItems(data.items);
      setSource(source);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  function setStatus(id: string, review_status: QuarantineItem["review_status"]) {
    setItems((xs) => xs.map((x) => (x.item_id === id ? { ...x, review_status } : x)));
  }

  async function promote(item: QuarantineItem, authority_level: AuthorityLevel, relationship_type: string, notes: string) {
    setBusy(item.item_id);
    setError(null);
    const prev = items;
    setStatus(item.item_id, "promoted");
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
    setStatus(item.item_id, "disputed");
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

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/governance" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Governance
      </Link>

      <header className="mt-4">
        <h1 className="text-[28px] font-semibold leading-tight">Quarantine</h1>
        <p className="mt-1.5 max-w-xl text-[13.5px] text-muted">
          Unverified field inputs. Promotion to the canonical graph is a one-way gate requiring human
          authority — nothing here is auto-promoted, ever.
        </p>
      </header>

      <div className="mt-3 flex items-center gap-3 text-[12px] text-muted">
        <span className="tabular font-medium text-ink">{items.filter((i) => i.review_status === "pending").length} pending</span>
        {!canPromote && <span>· read-only ({role})</span>}
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data — backend offline
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {loaded && items.length === 0 && (
          <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-[13px] text-muted">
            No items in quarantine.
          </div>
        )}
        {items.map((it) => {
          const pending = it.review_status === "pending";
          return (
            <article key={it.item_id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="caution">Unverified</StatusBadge>
                <span className="text-[11px] text-muted">{triggerLabel(it.input_type)}</span>
                {it.asset_id && <span className="tabular text-[11px] text-accent">{it.asset_id}</span>}
                {it.work_order_id && <span className="tabular text-[11px] text-muted">{it.work_order_id}</span>}
                {it.is_overdue && pending && (
                  <span className="tabular text-[11px] font-semibold text-danger">SLA overdue</span>
                )}
                <span className="tabular ml-auto text-[11px] text-muted">{relativeTime(it.submitted_at)}</span>
              </div>

              <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink">{it.content}</p>
              <p className="mt-1.5 text-[11px] text-muted">submitted by {it.submitted_by}</p>

              <div className="mt-3 border-t border-line pt-3">
                {!pending ? (
                  <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${it.review_status === "promoted" ? "text-verified" : "text-danger"}`}>
                    <span className={`size-1.5 rounded-full ${it.review_status === "promoted" ? "bg-verified" : "bg-danger"}`} aria-hidden="true" />
                    {it.review_status === "promoted" ? "Promoted to canonical graph" : "Disputed"}
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {canPromote && (
                      <button
                        onClick={() => setPanel({ id: it.item_id, mode: "promote" })}
                        className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-on-accent transition-opacity hover:opacity-90"
                      >
                        Promote
                      </button>
                    )}
                    <button
                      onClick={() => setPanel({ id: it.item_id, mode: "dispute" })}
                      className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] font-semibold text-ink transition-colors hover:bg-surface-2"
                    >
                      Dispute
                    </button>
                    {!canPromote && (
                      <span className="text-[11px] text-muted">Promotion requires reliability, engineer, or admin.</span>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {panel && (() => {
        const item = items.find((i) => i.item_id === panel.id);
        if (!item) return null;
        return panel.mode === "promote" ? (
          <Modal title={`Promote ${item.item_id} to canonical graph`} onClose={() => setPanel(null)}>
            <PromoteForm
              busy={busy === item.item_id}
              onCancel={() => setPanel(null)}
              onSubmit={(lvl, rel, notes) => promote(item, lvl, rel, notes)}
            />
          </Modal>
        ) : (
          <Modal title={`Dispute ${item.item_id}`} onClose={() => setPanel(null)}>
            <DisputeForm
              busy={busy === item.item_id}
              onCancel={() => setPanel(null)}
              onSubmit={(reason) => dispute(item, reason)}
            />
          </Modal>
        );
      })()}
    </div>
  );
}

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
      <p className="text-[12px] text-muted">Promotion is a one-way gate — this becomes human-verified canonical truth (confidence 1.0).</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">Authority level</span>
          <select value={authority} onChange={(e) => setAuthority(Number(e.target.value) as AuthorityLevel)}
            className="tabular h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent">
            {AUTH_LEVELS.map((l) => <option key={l} value={l}>L{l}</option>)}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] text-muted">Relationship type</span>
          <input value={relationship} onChange={(e) => setRelationship(e.target.value)}
            className="tabular h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent" />
        </label>
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)"
        className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent" />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy}
          className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-on-accent disabled:opacity-50">
          {busy ? "Promoting…" : "Confirm promote"}
        </button>
        <button type="button" onClick={onCancel} className="text-[12.5px] text-muted hover:text-ink">Cancel</button>
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
      <p className="text-[12px] text-muted">Flags the input as incorrect — it is kept for the record, not deleted.</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for dispute"
        className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none focus:border-accent" />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy}
          className="inline-flex h-8 items-center rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] px-3 text-[12.5px] font-semibold text-danger disabled:opacity-50">
          {busy ? "Submitting…" : "Confirm dispute"}
        </button>
        <button type="button" onClick={onCancel} className="text-[12.5px] text-muted hover:text-ink">Cancel</button>
      </div>
    </form>
  );
}
