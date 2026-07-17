"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getHealthDetailed } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { ADMIN_ROLES } from "@/components/use-role";
import { PageHeader, StatusBadge, DemoChip } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { capitalize } from "@/lib/utils";
import { fmtRelTime } from "@/lib/format";
import type { HealthDetailed, ServiceHealth } from "@/lib/types";

const POLL_MS = 5000;
const STATUS_RANK: Record<ServiceHealth["status"], number> = { down: 0, degraded: 1, healthy: 2 };
const OVERALL_TONE = { healthy: "verified", degraded: "caution", down: "danger" } as const;
const DOT = { healthy: "bg-verified", degraded: "bg-caution", down: "bg-danger" } as const;

export default function SystemHealthPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [health, setHealth] = useState<HealthDetailed | null>(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Admin-only: non-admins are bounced to their workspace.
  useEffect(() => {
    let alive = true;
    getMe().then((u) => {
      if (!alive) return;
      const ok = !!u && ADMIN_ROLES.includes(u.role);
      setAuthorized(ok);
      if (!ok) router.replace(u?.role === "field_worker" ? "/briefs" : "/management");
    });
    return () => { alive = false; };
  }, [router]);

  // Live poll while authorized.
  useEffect(() => {
    if (!authorized) return;
    let alive = true;
    const load = async () => {
      const { data, source } = await getHealthDetailed();
      if (!alive) return;
      setHealth(data);
      setDemo(source === "demo" || !data);
      setLoading(false);
    };
    void load();
    timer.current = setInterval(load, POLL_MS);
    return () => { alive = false; if (timer.current) clearInterval(timer.current); };
  }, [authorized]);

  if (authorized === null || authorized === false) return null;

  const services = [...(health?.services ?? [])].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
  );
  const upCount = services.filter((s) => s.status === "healthy").length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Infrastructure"
        title="System health"
        lede="Live status of every core service and datastore. Auto-refreshes every 5 seconds."
        actions={
          health?.overall ? (
            <StatusBadge tone={OVERALL_TONE[health.overall]} pulse={health.overall !== "healthy"}>
              {capitalize(health.overall)}
            </StatusBadge>
          ) : undefined
        }
      />

      {demo && <div className="mt-4"><DemoChip detail="Live health probe unavailable — showing last known state." /></div>}

      <div className="mt-5 flex items-center justify-between text-caption text-muted">
        <span className="tabular font-medium">{upCount}/{services.length} services healthy</span>
        {health?.checked_at && <span>Checked {fmtRelTime(health.checked_at)}</span>}
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : services.length === 0 ? (
        <p className="mt-6 text-body text-muted">Live service status is unavailable.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {services.map((s) => (
            <li
              key={s.name}
              className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={`size-2.5 shrink-0 rounded-full ${DOT[s.status]} ${s.status !== "healthy" ? "animate-pulse" : ""}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink">{s.name}</p>
                  {s.details && <p className="truncate text-caption text-danger" title={s.details}>{s.details}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {s.latency_ms != null && <span className="tabular text-caption text-muted">{Math.round(s.latency_ms)} ms</span>}
                <StatusBadge tone={OVERALL_TONE[s.status]}>{capitalize(s.status)}</StatusBadge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
