"use client";

import { useState } from "react";
import { postTagOut, postInspectionComplete, postAlarm, postShiftHandover } from "@/lib/api";
import { Button } from "@/components/ui";

const EMIT_TYPES = [
  { key: "tag-out", label: "Tag-out" },
  { key: "inspection-complete", label: "Inspection" },
  { key: "alarm", label: "Alarm" },
  { key: "shift-handover", label: "Shift handover" },
] as const;

export function EmitPanel({ siteId, userId, onEmitted }: { siteId: string; userId: string; onEmitted: () => void }) {
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
      if (kind === "tag-out") res = await postTagOut({ source_system: "manual", site_id: siteId, asset_id: assetId, tag_out_reason: note || "Scheduled isolation", performed_by: userId });
      else if (kind === "inspection-complete") res = await postInspectionComplete({ source_system: "manual", site_id: siteId, asset_id: assetId, inspection_type: "visual", result: "failed", findings: note || "Visual finding", performed_by: userId });
      else if (kind === "alarm") res = await postAlarm({ source_system: "manual", site_id: siteId, asset_id: assetId, alarm_id: `ALM-${crypto.randomUUID().slice(0, 8)}`, alarm_tag: "PAH-101", alarm_description: note || "High pressure", severity: "high", acknowledged_by: userId });
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
    <section className="mt-5 rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">Emit operational event</h2>
        <p className="mt-0.5 text-caption text-muted">Send a test event through the live event-to-brief workflow.</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[180px_140px_minmax(220px,1fr)_auto] lg:items-end">
        <label className="flex flex-col gap-1 text-caption">
          <span className="font-semibold text-ink">Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}
            className="h-11 rounded-lg border border-line bg-surface px-2.5 text-body lg:h-9">
            {EMIT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        {needsAsset && (
          <label className="flex flex-col gap-1 text-caption">
            <span className="font-semibold text-ink">Asset</span>
            <input value={assetId} onChange={(e) => setAssetId(e.target.value)}
              className="h-11 w-full rounded-lg border border-line bg-surface px-2.5 text-body lg:h-9" />
          </label>
        )}
        <label className="flex min-w-0 flex-col gap-1 text-caption sm:col-span-2 lg:col-span-1">
          <span className="font-semibold text-ink">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional"
            className="h-11 w-full rounded-lg border border-line bg-surface px-2.5 text-body lg:h-9" />
        </label>
        <Button className="h-11 sm:col-span-2 lg:col-span-1 lg:h-9" variant="primary" onClick={emit} disabled={busy}>{busy ? "Emitting…" : "Emit"}</Button>
      </div>
      {msg && <p role="status" className="mt-3 text-caption text-muted">{msg}</p>}
    </section>
  );
}
