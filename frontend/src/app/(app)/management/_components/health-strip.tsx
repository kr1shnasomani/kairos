import { Skeleton } from "@/components/skeleton";
import { StatusBadge } from "@/components/ui";
import type { HealthDetailed, ServiceHealth } from "@/lib/types";
import { capitalize } from "@/lib/utils";

const STATUS_RANK: Record<ServiceHealth["status"], number> = { down: 0, degraded: 1, healthy: 2 };
const OVERALL_TONE = { healthy: "verified", degraded: "caution", down: "danger" } as const;

/** Per-service health chips from GET /health/detailed — degraded/down first. */
export function HealthStrip({ health, loading = false }: { health: HealthDetailed | null; loading?: boolean }) {
  const services = [...(health?.services ?? [])].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  return (
    <section data-testid="overview-health" className="mt-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">System health</h2>
        {health?.overall && (
          <StatusBadge tone={OVERALL_TONE[health.overall]}>
            {capitalize(health.overall)}
          </StatusBadge>
        )}
      </div>
      {loading ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-32 rounded-md" />)}
        </div>
      ) : services.length === 0 ? (
        <p className="mt-3 text-caption text-muted">Live service status is unavailable.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {services.map((s) => (
            <span
              key={s.name}
              title={s.details ?? undefined}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 text-caption capitalize"
            >
              <span
                className={`size-1.5 rounded-full ${s.status === "healthy" ? "bg-verified" : s.status === "degraded" ? "bg-caution" : "bg-danger"}`}
                aria-hidden="true"
              />
              {s.name} · {s.status}
              {s.latency_ms != null && <span className="tabular text-label text-muted">{Math.round(s.latency_ms)} ms</span>}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
