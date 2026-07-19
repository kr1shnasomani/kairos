import Link from "next/link";
import { ListSkeleton } from "@/components/skeleton";
import { Sparkline, StatusBadge } from "@/components/ui";
import { fmtRelTime } from "@/lib/format";
import { staggerDelay } from "@/lib/motion";
import type { EventPriority, OperationalEvent } from "@/lib/types";
import { triggerLabel } from "@/lib/utils";

const SHOWN = 30;

const PRIORITY_TONE: Record<EventPriority, "danger" | "caution" | "info" | "neutral"> = {
  critical: "danger",
  high: "caution",
  normal: "info",
  low: "neutral",
};

/** Live event feed — priority badge, event label, asset, relative time.
 *  Header carries the events-per-day sparkline (the page's only real series). */
export function SignalsFeed({
  events,
  spark,
  loading = false,
}: {
  events: OperationalEvent[];
  /** Events-per-day buckets; hidden when absent or <2 points. */
  spark?: number[];
  loading?: boolean;
}) {
  const rows = events.slice(0, SHOWN);
  return (
    <section data-testid="overview-recent-signals" className="flex h-full min-w-0 flex-col rounded-xl border border-line bg-surface p-5">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Recent signals</h2>
        <span className="flex items-center gap-3">
          {spark && <Sparkline data={spark} className="text-accent opacity-70" />}
          <Link href="/events" className="text-label font-medium text-accent hover:underline">View all</Link>
        </span>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="mt-1"><ListSkeleton rows={5} /></div>
        ) : rows.length === 0 ? (
          <p className="mt-1 text-caption text-muted">No recent events.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {rows.map((e, i) => (
              <li key={e.event_id} className="animate-[rise-in_250ms_ease-out]" style={staggerDelay(i)}>
                <Link
                  href={`/events/${e.event_id}`}
                  className="group -mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-canvas"
                >
                  <StatusBadge tone={PRIORITY_TONE[e.priority] ?? "neutral"} dot={false}>{e.priority}</StatusBadge>
                  <span className="min-w-0 flex-1 truncate text-caption text-ink" title={triggerLabel(e.event_type)}>
                    {triggerLabel(e.event_type)}
                  </span>
                  {e.asset_id && <span className="shrink-0 text-label text-muted">{e.asset_id}</span>}
                  <time className="tabular shrink-0 text-label text-muted">{fmtRelTime(e.occurred_at)}</time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
