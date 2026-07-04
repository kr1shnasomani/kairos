import type { AuthorityLevel } from "@/lib/types";
import { authorityLabel, cn } from "@/lib/utils";

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
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold",
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
    <span className="tabular inline-flex h-[22px] items-center rounded-md border border-line bg-surface-2 px-2 text-[11px] font-medium text-ink">
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
        "tabular inline-flex h-[22px] items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium",
        quarantine
          ? "border-[color-mix(in_srgb,var(--caution)_35%,var(--line))] text-caution"
          : "border-[color-mix(in_srgb,var(--accent)_28%,var(--line))] text-accent",
      )}
    >
      {children}
    </span>
  );
}

/** Centered confirm dialog over a dimmed backdrop — refero: Airtable/Jasper/The Org confirm modals.
 *  Used for consequential writes (promote/dispute). Backdrop + Esc dismiss; actions live in children. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/40" aria-label="Close dialog" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14.5px] font-semibold">{title}</h2>
          <button
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

type ButtonVariant = "primary" | "ghost";

export function Button({
  variant = "ghost",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition duration-100 active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
        variant === "primary"
          ? "bg-accent text-on-accent hover:brightness-105 active:brightness-95"
          : "border border-line text-ink hover:bg-surface-2 active:brightness-95",
        className,
      )}
      {...props}
    />
  );
}
