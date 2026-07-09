"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OperationalEvent, EventPriority } from "@/lib/types";
import {
  getEvents, postTagOut, postInspectionComplete, postAlarm, postShiftHandover,
} from "@/lib/api";
import { useRole, RESOLVE_ROLES } from "@/components/use-role";
import { getMe } from "@/lib/auth";
import { Button, FilterTabs, StatusBadge, EmptyState } from "@/components/ui";
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
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Layer 8 · Event subscription</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Operational events</h1>
        <p className="mt-1.5 text-[13.5px] text-muted text-pretty">
          The canonical event sources that drive proactive briefs — work orders, PTWs, tag-outs,
          inspections, alarms, and shift handovers. Correlated events are linked into compound context.
        </p>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
        <span className="tabular font-medium text-ink">{events.length} event{events.length !== 1 ? "s" : ""}</span>
        {isDemo && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data
          </span>
        )}
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
            <span className="text-[13px] font-medium">{triggerLabel(e.event_type)}</span>
            {e.event_subtype === "recurring" && <StatusBadge tone="caution" dot={false}>recurring</StatusBadge>}
            {e.asset_id && <span className="tabular text-[12px] text-accent">{e.asset_id}</span>}
            {(e.correlated_event_ids?.length ?? 0) > 0 && (
              <span className="text-[11px] text-muted">+{e.correlated_event_ids!.length} correlated</span>
            )}
            <span className="tabular ml-auto text-[11px] text-muted">{relativeTime(e.occurred_at)}</span>
            {e.acknowledged && <span className="text-[11px] text-verified">acked</span>}
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
      if (kind === "tag-out") await postTagOut({ asset_id: assetId, reason: note || "Scheduled isolation" });
      else if (kind === "inspection-complete") await postInspectionComplete({ asset_id: assetId, result: "failed", findings: note || "Visual finding", performed_by: "dev-user" });
      else if (kind === "alarm") await postAlarm({ asset_id: assetId, alarm_tag: "PAH-101", description: note || "High pressure", priority: "high" });
      else await postShiftHandover({ from_shift: "A", to_shift: "B", notes: note || "Nominal handover", site_id: siteId });
      setMsg("Event emitted — brief assembly triggered.");
      setNote("");
      onEmitted();
    } catch {
      setMsg("Failed — backend offline.");
    } finally {
      setBusy(false);
    }
  }

  const needsAsset = kind !== "shift-handover";

  return (
    <section className="mt-5 rounded-xl border border-line bg-surface p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Emit event (demo)</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-[12px]">
          <span className="font-semibold text-ink">Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}
            className="mt-1 h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px]">
            {EMIT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        {needsAsset && (
          <label className="block text-[12px]">
            <span className="font-semibold text-ink">Asset</span>
            <input value={assetId} onChange={(e) => setAssetId(e.target.value)}
              className="mt-1 h-9 w-28 rounded-lg border border-line bg-surface px-2.5 text-[13px]" />
          </label>
        )}
        <label className="block flex-1 text-[12px]">
          <span className="font-semibold text-ink">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional"
            className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px]" />
        </label>
        <Button variant="primary" onClick={emit} disabled={busy}>{busy ? "Emitting…" : "Emit"}</Button>
      </div>
      {msg && <p className="mt-2 text-[12.5px] text-muted">{msg}</p>}
    </section>
  );
}
