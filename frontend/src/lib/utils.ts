import type { AuthorityLevel, BriefPriority } from "./types";

/** Tiny classNames joiner — avoids a dependency for simple conditional classes. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Compact relative time, e.g. "2h ago". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export interface PriorityMeta {
  label: string;
  /** CSS var color token name */
  color: string;
}

export function priorityMeta(p: BriefPriority): PriorityMeta {
  switch (p) {
    case "critical":
      return { label: "Critical", color: "var(--danger)" };
    case "high":
      return { label: "High", color: "var(--caution)" };
    case "normal":
      return { label: "Normal", color: "var(--info)" };
    case "medium":
      return { label: "Medium", color: "var(--info)" };
    default:
      return { label: "Low", color: "var(--muted)" };
  }
}

const AUTHORITY_NAMES: Record<AuthorityLevel, string> = {
  1: "Regulation",
  2: "Standard",
  3: "OEM",
  4: "Site SOP",
  5: "Field",
};

export function authorityLabel(level: AuthorityLevel): string {
  return `L${level} · ${AUTHORITY_NAMES[level]}`;
}

/** Human label for a trigger_event_type like "work_order_created". */
export function triggerLabel(t: string): string {
  return t
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
