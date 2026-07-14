"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { OperationalEvent, EventPriority } from "@/lib/types";
import { getEvent, ackEvent } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { Button, StatusBadge, EmptyState } from "@/components/ui";
import { relativeTime, triggerLabel } from "@/lib/utils";

const PRIORITY_TONE: Record<EventPriority, "danger" | "caution" | "info" | "neutral"> = {
  critical: "danger", high: "caution", normal: "info", low: "neutral",
};

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<OperationalEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getEvent(id).then(({ data }) => { if (alive) { setEvent(data); setLoading(false); } });
    return () => { alive = false; };
  }, [id]);

  async function handleAck() {
    setAcking(true);
    setAckError(null);
    try {
      const user = await getMe();
      if (!user) throw new Error("Sign in again before acknowledging this event.");
      await ackEvent(id, { user_id: user.user_id, role: user.role });
      setEvent((e) => e ? { ...e, acknowledged: true, acknowledged_by: user.user_id } : e);
    } catch (error) {
      setAckError(error instanceof Error ? error.message : "Could not acknowledge this event.");
    } finally {
      setAcking(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/events" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Events
      </Link>

      {loading && <p className="mt-6 text-body text-muted">Loading event…</p>}

      {!loading && !event && (
        <div className="mt-6"><EmptyState message={`Event ${id} not found.`} action={{ label: "Back to events", href: "/events" }} /></div>
      )}

      {event && (
        <>
          <header className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={PRIORITY_TONE[event.priority]}>{event.priority}</StatusBadge>
              {event.event_subtype === "recurring" && <StatusBadge tone="caution" dot={false}>recurring</StatusBadge>}
              {event.acknowledged && <StatusBadge tone="verified" dot={false}>acknowledged</StatusBadge>}
            </div>
            <h1 className="mt-2 text-display font-semibold leading-tight">{triggerLabel(event.event_type)}</h1>
            <p className="mt-1 text-caption text-muted">
              {event.asset_id && <span className="tabular text-accent">{event.asset_id}</span>}
              {event.asset_id && " · "}
              {relativeTime(event.occurred_at)}
              {event.site_id && ` · ${event.site_id}`}
            </p>
          </header>

          {event.brief_id && (
            <Link href={`/briefs/${event.brief_id}`}
              className="mt-4 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-body transition-colors hover:bg-surface-2">
              <span>Triggered brief <span className="tabular font-semibold text-accent">{event.brief_id}</span></span>
              <span className="text-muted">Open ↗</span>
            </Link>
          )}

          {(event.correlated_event_ids?.length ?? 0) > 0 && (
            <section className="mt-4">
              <p className="text-label font-bold uppercase tracking-[0.1em] text-muted">Correlated events</p>
              <ul className="mt-2 space-y-1.5">
                {event.correlated_event_ids!.map((cid) => (
                  <li key={cid}>
                    <Link href={`/events/${cid}`} className="tabular text-caption text-accent underline hover:no-underline">{cid}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-4">
            <p className="text-label font-bold uppercase tracking-[0.1em] text-muted">Payload</p>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-surface-2 p-3 text-caption text-ink">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </section>

          {!event.acknowledged && (
            <div className="mt-5">
              <Button variant="primary" onClick={handleAck} disabled={acking}>
                {acking ? "Acknowledging…" : "Acknowledge event"}
              </Button>
            </div>
          )}
          {ackError && <p role="alert" className="mt-2 text-caption text-danger">{ackError}</p>}
          {event.acknowledged && event.acknowledged_by && (
            <p className="mt-5 text-caption text-verified">
              ✓ Acknowledged by <span className="font-semibold">{event.acknowledged_by}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
