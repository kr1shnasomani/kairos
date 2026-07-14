"use client";

import type { AuthorityLevel, AuditLogEntry, BriefSource } from "@/lib/types";
import { authorityLabel, cn } from "@/lib/utils";
import { useEffect, useId, useRef, useState } from "react";

type Tone = "danger" | "caution" | "verified" | "info" | "neutral";

const TONE_STYLE: Record<Tone, string> = {
  danger: "text-danger bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]",
  caution: "text-caution bg-[color-mix(in_srgb,var(--caution)_16%,transparent)]",
  verified: "text-verified bg-[color-mix(in_srgb,var(--verified)_15%,transparent)]",
  info: "text-info bg-[color-mix(in_srgb,var(--info)_14%,transparent)]",
  neutral: "text-muted bg-surface-2 border border-line",
};

/** Status pill — verification / severity. Dot encodes state in form, not just color. */
export function StatusBadge({
  tone,
  children,
  dot = true,
}: {
  tone: Tone;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-label font-semibold",
        TONE_STYLE[tone],
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Neutral mono chip carrying the authority level of a source. */
export function AuthorityBadge({ level }: { level: AuthorityLevel }) {
  return (
    <span className="tabular inline-flex h-[22px] items-center rounded-md border border-line bg-surface-2 px-2 text-label font-medium text-ink">
      {authorityLabel(level)}
    </span>
  );
}

/** Source reference chip — links to the vault document (accent-tinted). */
export function SourceChip({
  children,
  quarantine = false,
}: {
  children: React.ReactNode;
  quarantine?: boolean;
}) {
  return (
    <span
      className={cn(
        "tabular inline-flex h-[22px] items-center gap-1.5 rounded-md border px-2 text-label font-medium",
        quarantine
          ? "border-[color-mix(in_srgb,var(--caution)_35%,var(--line))] text-caution"
          : "border-[color-mix(in_srgb,var(--accent)_28%,var(--line))] text-accent",
      )}
    >
      {children}
    </span>
  );
}

/** Centered confirm dialog over a dimmed backdrop — refero: Medium/Clipchamp/Mercury confirms.
 *  Used for consequential writes (promote/dispute). Backdrop + Esc dismiss; focus trap; actions in children. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) return;

    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);

    const first = focusables()[0];
    (first ?? panel).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 animate-[overlay-in_150ms_ease-out] bg-black/40" aria-label="Close dialog" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-md animate-[panel-in_150ms_ease-out] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-5 shadow-xl outline-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-sm font-semibold">{title}</h2>
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
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

type ButtonVariant = "primary" | "ghost" | "danger";

export function Button({
  variant = "ghost",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-body font-semibold transition duration-100 active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
        variant === "primary"
          ? "bg-accent text-on-accent hover:brightness-105 active:brightness-95"
          : variant === "danger"
            ? "bg-danger text-white hover:brightness-105 active:brightness-95"
            : "border border-line text-ink hover:bg-surface-2 active:brightness-95",
        className,
      )}
      {...props}
    />
  );
}

// ─── Phase badge (Task 3) ────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  "1": "Phase 1 · Retrieval",
  "2": "Phase 2 · Assisted",
  "3": "Phase 3 · Proactive",
};

/** Deployment phase pill — reads NEXT_PUBLIC_KAIROS_PHASE (default 3). */
export function PhaseBadge() {
  const phase = process.env.NEXT_PUBLIC_KAIROS_PHASE ?? "3";
  const label = PHASE_LABELS[phase] ?? `Phase ${phase}`;
  return (
    <span className="inline-flex h-[20px] items-center rounded-full bg-[color-mix(in_srgb,var(--info)_14%,transparent)] px-2 text-micro font-semibold text-info">
      {label}
    </span>
  );
}

/** Honest data-source chip — shown when a page is rendering fixture/demo data. */
export function DemoChip({ detail }: { detail?: string } = {}) {
  return (
    <span className="inline-flex h-[20px] items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--caution)_14%,transparent)] px-2 text-micro font-semibold text-caution">
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {detail ? `Demo data — ${detail}` : "Demo data"}
    </span>
  );
}

// ─── KpiCard (Task 4) ────────────────────────────────────────────────────────

/** Executive KPI tile — mono numeral, label, optional threshold colour.
 *  Pure CSS, no chart library. */
export function KpiCard({
  label,
  value,
  tone,
  sub,
  onClick,
}: {
  label: string;
  value: string | number;
  tone?: "danger" | "caution" | "verified" | "neutral";
  sub?: string;
  onClick?: () => void;
}) {
  const valueColor =
    tone === "danger" ? "text-danger" :
    tone === "caution" ? "text-caution" :
    tone === "verified" ? "text-verified" :
    "text-ink";

  const inner = (
    <>
      <span className="text-label font-medium uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className={cn("tabular text-display font-semibold leading-none", valueColor)}>{value}</span>
      {sub && <span className="text-label text-muted">{sub}</span>}
    </>
  );
  const base = "group flex w-full flex-col gap-1 rounded-xl border border-line bg-surface p-4 text-left transition-colors";

  // Static stat tiles must not be announced as interactive controls.
  if (!onClick) return <div className={base}>{inner}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, "cursor-pointer hover:border-accent/40 hover:bg-surface-2")}
    >
      {inner}
    </button>
  );
}

// ─── DataTable (Task 4) ──────────────────────────────────────────────────────

export interface TableColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

/** Dense data table with an optional empty state. */
export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  keyFn,
  emptyState,
}: {
  columns: TableColumn<T>[];
  rows: T[];
  keyFn: (row: T) => string;
  emptyState?: React.ReactNode;
}) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-body">
        <thead>
          <tr className="border-b border-line bg-surface-2">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn("px-3 py-2.5 text-left font-semibold text-muted", col.className)}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={keyFn(row)}
              className="border-b border-line/60 bg-surface last:border-0"
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("px-3 py-2.5 align-middle", col.className)}>
                  {col.render ? col.render(row) : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── FilterTabs (Task 4) ─────────────────────────────────────────────────────

/** Segmented control for list filtering. */
export function FilterTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: string; label: string; count?: number }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div role="group" aria-label="Filters" className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface-2 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          aria-pressed={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-3 text-caption font-semibold transition-colors",
            active === tab.key
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-ink",
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="tabular rounded-full bg-surface-2 px-1.5 text-label text-muted">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Timeline (Task 4) ───────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  timestamp: string;
  label: string;
  description?: string;
  tone?: "danger" | "caution" | "verified" | "info" | "neutral";
  meta?: string;
}

/** Vertical event spine with a time gutter. Pure CSS, no library. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <EmptyState message="No events to show." />;
  return (
    <ol className="relative space-y-4 pl-6">
      {/* spine */}
      <div className="absolute inset-y-0 left-2 w-px bg-line" aria-hidden="true" />
      {events.map((ev) => {
        const dotColor =
          ev.tone === "danger" ? "bg-danger" :
          ev.tone === "caution" ? "bg-caution" :
          ev.tone === "verified" ? "bg-verified" :
          ev.tone === "info" ? "bg-info" :
          "bg-muted";
        return (
          <li key={ev.id} className="relative">
            <span
              className={cn("absolute -left-[22px] top-[5px] size-2 rounded-full ring-2 ring-surface", dotColor)}
              aria-hidden="true"
            />
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-body font-semibold text-ink">{ev.label}</span>
                <time className="tabular text-label text-muted">{ev.timestamp}</time>
                {ev.meta && (
                  <span className="text-label text-muted">{ev.meta}</span>
                )}
              </div>
              {ev.description && (
                <p className="mt-0.5 text-caption leading-snug text-muted">{ev.description}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── EvidenceLineage (Task 4) ────────────────────────────────────────────────

/** Collapsible source + audit trail — shown under every AI answer and brief. */
export function EvidenceLineage({
  sources,
  auditEntries,
}: {
  sources?: BriefSource[];
  auditEntries?: AuditLogEntry[];
}) {
  const [open, setOpen] = useState(false);
  const total = (sources?.length ?? 0) + (auditEntries?.length ?? 0);
  if (total === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-surface-2 text-caption">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 font-semibold text-muted hover:text-ink"
      >
        <span>Evidence lineage · {total} item{total !== 1 ? "s" : ""}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("transition-transform", open && "rotate-180")}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-line px-3 py-3 space-y-3">
          {sources && sources.length > 0 && (
            <div>
              <p className="mb-1.5 text-label font-bold uppercase tracking-[0.1em] text-muted">Sources</p>
              <ul className="space-y-2">
                {sources.map((s) => (
                  <li key={s.document_id} className="flex flex-wrap items-center gap-1.5">
                    <SourceChip quarantine={s.is_quarantine}>{s.title || s.document_id}</SourceChip>
                    <AuthorityBadge level={s.authority_level} />
                    {s.is_quarantine && (
                      <StatusBadge tone="caution" dot={false}>Unverified</StatusBadge>
                    )}
                    {s.vault_url && (
                      <a
                        href={s.vault_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-label text-accent underline hover:no-underline"
                      >
                        Vault ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {auditEntries && auditEntries.length > 0 && (
            <div>
              <p className="mb-1.5 text-label font-bold uppercase tracking-[0.1em] text-muted">Audit trail</p>
              <ul className="space-y-1">
                {auditEntries.map((e) => (
                  <li key={e.log_id} className="flex flex-wrap gap-2 text-label text-muted">
                    <time className="tabular shrink-0">{new Date(e.timestamp).toLocaleString()}</time>
                    <span className="font-medium text-ink">{e.action}</span>
                    <span>by {e.performed_by}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ConfidenceMeter (Task 4) ────────────────────────────────────────────────

/** 0–1 confidence bar with verified / caution / danger banding. */
export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
  const tone =
    value >= 0.85 ? "bg-verified" :
    value >= 0.7 ? "bg-caution" :
    "bg-danger";
  const label =
    value >= 0.85 ? "verified" :
    value >= 0.7 ? "caution" :
    "danger";

  return (
    <div className="flex items-center gap-2">
      <div
        className="relative h-1.5 flex-1 rounded-full bg-surface-2"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confidence ${pct}%`}
      >
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular text-label font-semibold text-muted">{pct}%</span>
      <StatusBadge tone={label} dot={false}>{label}</StatusBadge>
    </div>
  );
}

// ─── RefusalCard (Task 4) ────────────────────────────────────────────────────

/** Safety-critical explicit refusal — never a hedged answer. */
export function RefusalCard({
  reason,
  sources,
  escalateTo,
}: {
  reason?: string;
  sources?: BriefSource[];
  escalateTo?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger/30 bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-4 space-y-3"
    >
      <div className="flex items-start gap-2.5">
        <svg
          className="mt-0.5 size-4 shrink-0 text-danger"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div>
          <p className="text-body font-semibold text-danger">Safety-critical query — sources returned directly</p>
          {reason && <p className="mt-0.5 text-caption text-muted">{reason}</p>}
        </div>
      </div>

      {sources && sources.length > 0 && (
        <div>
          <p className="mb-1.5 text-label font-bold uppercase tracking-[0.1em] text-muted">Relevant sources</p>
          <ul className="space-y-1.5">
            {sources.map((s) => (
              <li key={s.document_id} className="flex flex-wrap items-center gap-1.5">
                <SourceChip quarantine={s.is_quarantine}>{s.title || s.document_id}</SourceChip>
                <AuthorityBadge level={s.authority_level} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {escalateTo && (
        <p className="text-caption text-muted">
          Escalate to: <span className="font-semibold text-ink">{escalateTo}</span>
        </p>
      )}
    </div>
  );
}

// ─── EmptyState (Task 4) ─────────────────────────────────────────────────────

/** Icon + message + optional CTA for empty list / no results states. */
/** Standard page header — eyebrow · title · lede · right-aligned actions.
 *  One h1 voice across the app: display (28px) for workspaces, title (20px)
 *  via `compact` for detail views. Use this instead of hand-rolled headers
 *  so typography can't drift page-to-page. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  compact,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">{eyebrow}</p>}
        <h1 className={cn("mt-1 font-semibold leading-tight text-balance", compact ? "text-title" : "text-display")}>
          {title}
        </h1>
        {lede && <p className="mt-1.5 max-w-prose text-body text-muted text-pretty">{lede}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line py-12 text-center">
      <svg
        className="size-8 text-muted/40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <p className="text-body text-muted">{message}</p>
      {action && (
        <Button variant="ghost" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
