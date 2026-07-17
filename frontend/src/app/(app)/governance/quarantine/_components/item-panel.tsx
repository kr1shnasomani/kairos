"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { QuarantineItem } from "@/lib/types";
import { relativeTime, triggerLabel } from "@/lib/utils";
import { Button, StatusBadge } from "@/components/ui";
import { SlaChip } from "./columns";
import type { ActionMode } from "./actions";

const SESSION_TYPES = new Set(["elicitation_response", "offboarding_response", "voice_note"]);

const Meta = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-micro font-semibold uppercase tracking-[0.1em] text-muted">{label}</dt>
    <dd className="mt-0.5 text-caption text-ink">{children}</dd>
  </div>
);

function SessionContext({ ctx, inputType }: { ctx: Record<string, unknown>; inputType: string }) {
  const [open, setOpen] = useState(false);
  if (!SESSION_TYPES.has(inputType)) return null;
  const entries = Object.entries(ctx);
  if (entries.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 text-caption">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between px-3 py-2 font-semibold text-muted hover:text-ink"
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

/** Right slide-in detail panel. Esc + backdrop close, focus returns to the
 *  trigger. Action buttons hand off to the existing Modal flows via onAction. */
export function ItemPanel({
  item,
  nowMs,
  canPromote,
  busy,
  escDisabled = false,
  onClose,
  onAction,
}: {
  item: QuarantineItem;
  nowMs: number;
  canPromote: boolean;
  busy: boolean;
  /** Suspends the Esc handler while an action Modal is stacked on top. */
  escDisabled?: boolean;
  onClose: () => void;
  onAction: (mode: ActionMode) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (escDisabled) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [escDisabled, onClose]);

  const pending = item.review_status === "pending";

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`Quarantine item ${item.item_id}`}>
      <button
        type="button"
        className="absolute inset-0 animate-[overlay-in_150ms_ease-out] bg-black/40"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        data-testid="quarantine-panel"
        className="absolute inset-y-0 right-0 w-full max-w-md animate-[panel-in_250ms_ease-out] overflow-y-auto overscroll-contain border-l border-line bg-surface p-5 shadow-xl outline-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="tabular text-sm font-semibold">{item.item_id}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge tone={pending ? "caution" : item.review_status === "promoted" ? "verified" : "danger"}>
            {pending ? "Unverified" : item.review_status === "promoted" ? "Promoted" : "Disputed"}
          </StatusBadge>
          <span className="text-label text-muted">{triggerLabel(item.input_type)}</span>
          <SlaChip item={item} nowMs={nowMs} />
        </div>

        <p className="mt-3 text-body leading-relaxed text-ink">{item.content}</p>

        <dl className="mt-4 grid grid-cols-2 gap-3">
          <Meta label="Asset">
            {item.asset_id ? (
              <Link href={`/assets/${item.asset_id}`} className="tabular text-accent hover:underline">
                {item.asset_id}
              </Link>
            ) : "—"}
          </Meta>
          <Meta label="Work order"><span className="tabular">{item.work_order_id ?? "—"}</span></Meta>
          <Meta label="Submitted by">{item.submitted_by}</Meta>
          <Meta label="Submitted"><span className="tabular">{relativeTime(item.submitted_at)}</span></Meta>
          <Meta label="Reviewer">{item.reviewer_id ?? "—"}</Meta>
        </dl>

        {item.session_context && <SessionContext ctx={item.session_context} inputType={item.input_type} />}

        {item.input_type === "deviation_flag" && pending && (
          <div className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_7%,var(--surface))] px-3 py-2">
            <p className="text-caption text-danger">
              Deviation flag —{" "}
              <Link href="/governance/conflicts" className="font-semibold underline hover:opacity-80">
                resolve via conflicts queue
              </Link>
            </p>
          </div>
        )}

        <div className="mt-4 border-t border-line pt-4">
          {pending ? (
            <div className="flex flex-wrap items-center gap-2">
              {canPromote && (
                <Button className="min-h-11" variant="primary" onClick={() => onAction("promote")} disabled={busy}>
                  Promote
                </Button>
              )}
              <Button className="min-h-11" variant="ghost" onClick={() => onAction("dispute")} disabled={busy}>
                Dispute
              </Button>
              <Button className="min-h-11" variant="ghost" onClick={() => onAction("request-info")} disabled={busy}>
                Request info
              </Button>
              {!canPromote && (
                <span className="text-label text-muted">Promotion requires reliability, engineer, or admin.</span>
              )}
            </div>
          ) : (
            <span className={`inline-flex items-center gap-1.5 text-caption font-semibold ${item.review_status === "promoted" ? "text-verified" : "text-danger"}`}>
              <span className={`size-1.5 rounded-full ${item.review_status === "promoted" ? "bg-verified" : "bg-danger"}`} aria-hidden="true" />
              {item.review_status === "promoted" ? "Promoted to canonical graph" : "Disputed"}
            </span>
          )}
        </div>
      </aside>
    </div>
  );
}
