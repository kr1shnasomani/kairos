"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OperationalEvent, EventPriority } from "@/lib/types";
import {
  getEvents, postTagOut, postInspectionComplete, postAlarm, postShiftHandover,
} from "@/lib/api";
import { useRole, RESOLVE_ROLES } from "@/components/use-role";
import { getMe } from "@/lib/auth";
import { Button, FilterTabs, StatusBadge, EmptyState, DemoChip } from "@/components/ui";
import { relativeTime, triggerLabel } from "@/lib/utils";

const PRIORITY_TONE: Record<EventPriority, "danger" | "caution" | "info" | "neutral"> = {
  critical: "danger", high: "caution", normal: "info", low: "neutral",
};

const EMIT_TYPES = [
  { key: "tag-out", label: "Tag-out" },
  { key: "inspection-complete", label: "Inspection" },
  { key: "alarm", label: "Alarm" },
  { key: "shift-handover", label: "Shift handover" },
] as const;

export default function EventsPage() {
  const role = useRole();
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [filter, setFilter] = useState("all");
  const [siteId, setSiteId] = useState("SITE_001");
  const canEmit = RESOLVE_ROLES.includes(role);

  useEffect(() => { getMe().then((u) => { if (u) setSiteId(u.site_id); }); }, []);

  const load = useCallback(() => getEvents({ limit: 50 }).then(({ data, source }) => {
    setEvents(data.items);
    setIsDemo(source === "demo");
  }), []);
  useEffect(() => { load(); }, [load]);

  const types = useMemo(() => Array.from(new Set(events.map((e) => e.event_type))), [events]);
  const visible = filter === "all" ? events : events.filter((e) => e.event_type === filter);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">Layer 8 · Event subscription</p>
        <h1 className="mt-1 text-display font-semibold leading-tight">Operational events</h1>
        <p className="mt-1.5 text-body text-muted text-pretty">
          The canonical event sources that drive proactive briefs — work orders, PTWs, tag-outs,
          inspections, alarms, and shift handovers. Correlated events are linked into compound context.
        </p>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-caption text-muted">
        <span className="tabular font-medium text-ink">{events.length} event{events.length !== 1 ? "s" : ""}</span>
        {isDemo && <DemoChip />}
      </div>

      {canEmit && <EmitPanel siteId={siteId} onEmitted={load} />}

      {types.length > 0 && (
        <div className="mt-5">
          <FilterTabs
            tabs={[{ key: "all", label: "All" }, ...types.map((t) => ({ key: t, label: triggerLabel(t) }))]}
            active={filter}
            onChange={setFilter}
          />
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        {visible.length === 0 && (
          <div className="p-2">
            <EmptyState message={canEmit ? "No events yet — emit one above to see the flow end-to-end." : "No operational events recorded."} />
          </div>
        )}
        {visible.map((e, i) => (
          <Link key={e.event_id} href={`/events/${e.event_id}`}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2 ${i > 0 ? "border-t border-line" : ""}`}>
            <StatusBadge tone={PRIORITY_TONE[e.priority]}>{e.priority}</StatusBadge>
            <span className="text-body font-medium">{triggerLabel(e.event_type)}</span>
            {e.event_subtype === "recurring" && <StatusBadge tone="caution" dot={false}>recurring</StatusBadge>}
            {e.asset_id && <span className="tabular text-caption text-accent">{e.asset_id}</span>}
            {(e.correlated_event_ids?.length ?? 0) > 0 && (
              <span className="text-label text-muted">+{e.correlated_event_ids!.length} correlated</span>
            )}
            <span className="tabular ml-auto text-label text-muted">{relativeTime(e.occurred_at)}</span>
            {e.acknowledged && <span className="text-label text-verified">acked</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

function EmitPanel({ siteId, onEmitted }: { siteId: string; onEmitted: () => void }) {
  const [kind, setKind] = useState<(typeof EMIT_TYPES)[number]["key"]>("tag-out");
  const [assetId, setAssetId] = useState("P-101");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function emit() {
    setBusy(true);
    setMsg(null);
    try {
      let res: { status: string; event_id: string };
      if (kind === "tag-out") res = await postTagOut({ source_system: "manual", site_id: siteId, asset_id: assetId, tag_out_reason: note || "Scheduled isolation", performed_by: "dev-user" });
      else if (kind === "inspection-complete") res = await postInspectionComplete({ source_system: "manual", site_id: siteId, asset_id: assetId, inspection_type: "visual", result: "failed", findings: note || "Visual finding", performed_by: "dev-user" });
      else if (kind === "alarm") res = await postAlarm({ source_system: "manual", site_id: siteId, asset_id: assetId, alarm_id: `ALM-${crypto.randomUUID().slice(0, 8)}`, alarm_tag: "PAH-101", alarm_description: note || "High pressure", severity: "high", acknowledged_by: "dev-user" });
      else res = await postShiftHandover({ source_system: "manual", site_id: siteId, outgoing_shift_lead_id: "shift-A", incoming_shift_lead_id: "shift-B", handover_time: new Date().toISOString() });
      setMsg(res.status === "deduplicated"
        ? "Duplicate suppressed — an identical event arrived within the 10-minute window."
        : "Event emitted — brief assembly triggered.");
      setNote("");
      onEmitted();
    } catch (err) {
      setMsg(err instanceof Error ? `Failed — ${err.message}` : "Failed — backend unreachable.");
    } finally {
      setBusy(false);
    }
  }

  const needsAsset = kind !== "shift-handover";

  return (
    <section className="mt-5 rounded-xl border border-line bg-surface p-4">
      <p className="text-label font-bold uppercase tracking-[0.1em] text-muted">Emit event (demo)</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-caption">
          <span className="font-semibold text-ink">Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}
            className="h-9 rounded-lg border border-line bg-surface px-2.5 text-body">
            {EMIT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        {needsAsset && (
          <label className="flex flex-col gap-1 text-caption">
            <span className="font-semibold text-ink">Asset</span>
            <input value={assetId} onChange={(e) => setAssetId(e.target.value)}
              className="h-9 w-28 rounded-lg border border-line bg-surface px-2.5 text-body" />
          </label>
        )}
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-caption">
          <span className="font-semibold text-ink">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional"
            className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-body" />
        </label>
        <Button variant="primary" onClick={emit} disabled={busy}>{busy ? "Emitting…" : "Emit"}</Button>
      </div>
      {msg && <p className="mt-2 text-caption text-muted">{msg}</p>}
    </section>
  );
}
