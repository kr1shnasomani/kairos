"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getHealthDetailed, probeEndpoint, type ProbeResult } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { ADMIN_ROLES } from "@/components/use-role";
import { PageHeader, StatusBadge, DemoChip } from "@/components/ui";
import { Skeleton } from "@/components/skeleton";
import { capitalize } from "@/lib/utils";
import { fmtRelTime } from "@/lib/format";
import type { HealthDetailed, ServiceHealth } from "@/lib/types";

const POLL_MS = 15000;

// Every API surface (docs/API.md), each mapped to a safe read-only GET we probe live.
// The Go OT connector (port 8090) is on the internal network, not browser-reachable, so it is
// covered by the datastore section rather than a direct probe.
const API_GROUPS: { group: string; layer: string; endpoint: string; probe: string }[] = [
  { group: "Health", layer: "Liveness", endpoint: "GET /health", probe: "/health/" },
  { group: "Authentication", layer: "Auth", endpoint: "GET /auth/me", probe: "/auth/me" },
  { group: "Assets", layer: "Layer 1 · MDM", endpoint: "GET /assets", probe: "/assets/?limit=1" },
  { group: "Documents", layer: "Layer 2-3 · Vault", endpoint: "GET /documents", probe: "/documents/?limit=1" },
  { group: "Search", layer: "Layer 11 · Retrieval", endpoint: "GET /search", probe: "/search/?q=status&limit=1" },
  { group: "Events", layer: "Layer 8", endpoint: "GET /events/plant-state", probe: "/events/plant-state/SITE_001" },
  { group: "Briefs", layer: "Layer 8", endpoint: "GET /briefs/governor/status", probe: "/briefs/governor/status" },
  { group: "Governance", layer: "Layer 7", endpoint: "GET /governance/circuit-breaker", probe: "/governance/circuit-breaker" },
  { group: "Compliance", layer: "Compliance", endpoint: "GET /compliance/frameworks", probe: "/compliance/frameworks" },
  { group: "Elicitation", layer: "Layer 6", endpoint: "GET /elicitation/offboarding", probe: "/elicitation/offboarding" },
  { group: "Annotations", layer: "Layer 3", endpoint: "GET /annotations/stats", probe: "/annotations/stats" },
  { group: "Audit Log", layer: "Governance", endpoint: "GET /audit-log", probe: "/audit-log/?limit=1" },
];

const OVERALL_TONE = { healthy: "verified", degraded: "caution", down: "danger" } as const;
const DOT = { healthy: "bg-verified", degraded: "bg-caution", down: "bg-danger" } as const;
const STATUS_RANK: Record<ServiceHealth["status"], number> = { down: 0, degraded: 1, healthy: 2 };

type ProbeRow = (typeof API_GROUPS)[number] & { result?: ProbeResult };

function StatusRow({ dot, title, subtitle, right }: { dot: keyof typeof DOT; title: string; subtitle?: string; right: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`size-2.5 shrink-0 rounded-full ${DOT[dot]} ${dot !== "healthy" ? "animate-pulse" : ""}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-ink">{title}</p>
          {subtitle && <p className="truncate text-caption text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">{right}</div>
    </li>
  );
}

export default function SystemHealthPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stores, setStores] = useState<HealthDetailed | null>(null);
  const [storesDemo, setStoresDemo] = useState(false);
  const [apis, setApis] = useState<ProbeRow[]>(API_GROUPS);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Admin-only.
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

  useEffect(() => {
    if (!authorized) return;
    let alive = true;
    const load = async () => {
      const [{ data, source }, results] = await Promise.all([
        getHealthDetailed(),
        Promise.all(API_GROUPS.map((g) => probeEndpoint(g.probe))),
      ]);
      if (!alive) return;
      setStores(data);
      setStoresDemo(source === "demo" || !data);
      setApis(API_GROUPS.map((g, i) => ({ ...g, result: results[i] })));
      setCheckedAt(new Date().toISOString());
      setLoading(false);
    };
    void load();
    timer.current = setInterval(() => { void load(); }, POLL_MS);
    return () => { alive = false; if (timer.current) clearInterval(timer.current); };
  }, [authorized]);

  if (authorized === null || authorized === false) return null;

  const services = [...(stores?.services ?? [])].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  const apiUp = apis.filter((a) => a.result?.ok).length;
  const storesUp = services.filter((s) => s.status === "healthy").length;
  const allUp = !loading && apiUp === apis.length && stores?.overall === "healthy";
  const overall: keyof typeof OVERALL_TONE = loading ? "degraded" : allUp ? "healthy" : "degraded";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Infrastructure"
        title="System health"
        lede="Live status of every API surface and datastore, grouped by domain. Auto-refreshes every 15 seconds."
        actions={
          <StatusBadge tone={OVERALL_TONE[overall]} pulse={overall !== "healthy"}>
            {loading ? "Checking…" : capitalize(overall)}
          </StatusBadge>
        }
      />

      {storesDemo && <div className="mt-4"><DemoChip detail="Live datastore probe unavailable." /></div>}

      <div className="mt-5 flex items-center justify-between text-caption text-muted">
        <span className="tabular font-medium">{apiUp}/{apis.length} APIs · {storesUp}/{services.length || 5} datastores healthy</span>
        {checkedAt && <span>Checked {fmtRelTime(checkedAt)}</span>}
      </div>

      {/* API surfaces */}
      <h2 className="mt-6 text-label font-bold uppercase tracking-[0.1em] text-muted">API surfaces</h2>
      {loading ? (
        <div className="mt-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {apis.map((a) => {
            const ok = a.result?.ok ?? false;
            return (
              <StatusRow
                key={a.group}
                dot={ok ? "healthy" : "down"}
                title={a.group}
                subtitle={`${a.layer} · ${a.endpoint}`}
                right={
                  <>
                    {a.result && a.result.status !== 0 && <span className="tabular text-caption text-muted">{Math.round(a.result.latencyMs)} ms</span>}
                    <StatusBadge tone={ok ? "verified" : "danger"}>{ok ? "Operational" : a.result?.status ? `HTTP ${a.result.status}` : "Unreachable"}</StatusBadge>
                  </>
                }
              />
            );
          })}
        </ul>
      )}

      {/* Datastores */}
      <h2 className="mt-8 text-label font-bold uppercase tracking-[0.1em] text-muted">Datastores & dependencies</h2>
      {loading ? (
        <div className="mt-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : services.length === 0 ? (
        <p className="mt-3 text-body text-muted">Live datastore status is unavailable.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {services.map((s) => (
            <StatusRow
              key={s.name}
              dot={s.status}
              title={s.name}
              subtitle={s.details ?? undefined}
              right={
                <>
                  {s.latency_ms != null && <span className="tabular text-caption text-muted">{Math.round(s.latency_ms)} ms</span>}
                  <StatusBadge tone={OVERALL_TONE[s.status]}>{capitalize(s.status)}</StatusBadge>
                </>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
