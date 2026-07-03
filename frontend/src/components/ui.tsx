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

type ButtonVariant = "primary" | "ghost";

export function Button({
  variant = "ghost",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-50",
        variant === "primary"
          ? "bg-accent text-on-accent hover:brightness-105"
          : "border border-line text-ink hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}
