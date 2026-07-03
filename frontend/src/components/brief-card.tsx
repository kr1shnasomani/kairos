import Link from "next/link";
import type { Brief } from "@/lib/types";
import { cn, priorityMeta, relativeTime, triggerLabel } from "@/lib/utils";
import { AuthorityBadge, StatusBadge } from "./ui";

/** A single brief in the inbox — priority encoded as a left stripe, headline in serif. */
export function BriefCard({ brief }: { brief: Brief }) {
  const p = priorityMeta(brief.priority);
  const topAuthority = brief.sources.reduce<number>(
    (min, s) => Math.min(min, s.authority_level),
    5,
  ) as 1 | 2 | 3 | 4 | 5;
  const quarantineCount = brief.sources.filter((s) => s.is_quarantine).length;

  return (
    <Link
      href={`/briefs/${brief.brief_id}`}
      className="group grid grid-cols-[4px_1fr] overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]"
    >
      <span aria-hidden="true" style={{ background: p.color }} />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em]"
              style={{ color: p.color }}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {p.label}
            </span>
            <span className="text-[11px] text-muted">· {triggerLabel(brief.trigger_event_type)}</span>
          </div>
          <span className="tabular shrink-0 text-[11px] text-muted">
            {relativeTime(brief.delivered_at)}
          </span>
        </div>

        <h3 className={cn("text-[16px] font-semibold leading-snug", "text-ink")}>
          {brief.headline}
        </h3>

        <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">{brief.body}</p>

        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted">
            {brief.sources.length} source{brief.sources.length === 1 ? "" : "s"}
          </span>
          <AuthorityBadge level={topAuthority} />
          {brief.requires_countersignature && (
            <StatusBadge tone="danger">Countersignature</StatusBadge>
          )}
          {quarantineCount > 0 && (
            <StatusBadge tone="caution">{quarantineCount} unverified</StatusBadge>
          )}
          {brief.delivery_frozen && <StatusBadge tone="info">Frozen</StatusBadge>}
        </div>
      </div>
    </Link>
  );
}
