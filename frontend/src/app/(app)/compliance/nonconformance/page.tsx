"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getConflicts, getQuarantine, getEvents } from "@/lib/api";
import { FilterTabs, StatusBadge, EmptyState } from "@/components/ui";
import { relativeTime } from "@/lib/utils";

type NcSource = "conflict" | "inspection" | "dispute";

interface Nc {
  id: string;
  source: NcSource;
  asset_id: string | null;
  title: string;
  detail: string;
  tone: "danger" | "caution";
  when: string;
  origin?: { href: string; label: string };
}

const SOURCE_LABEL: Record<NcSource, string> = {
  conflict: "Knowledge conflict",
  inspection: "Failed inspection",
  dispute: "Disputed input",
};

export default function NonConformancePage() {
  const [items, setItems] = useState<Nc[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [filter, setFilter] = useState<"all" | NcSource>("all");

  useEffect(() => {
    let alive = true;
    Promise.all([getConflicts(), getQuarantine(), getEvents({ limit: 50 })]).then(([c, q, e]) => {
      if (!alive) return;
      const ncs: Nc[] = [];

      for (const cf of c.data.items) {
        if (cf.status === "resolved") continue;
        ncs.push({
          id: cf.conflict_id, source: "conflict", asset_id: cf.asset_id,
          title: `Conflict on ${cf.parameter}`,
          detail: `${cf.track} track · severity ${cf.severity}`,
          tone: cf.severity === "safety_critical" || cf.is_overdue ? "danger" : "caution",
          when: cf.created_at,
          origin: { href: "/governance/conflicts", label: "Conflict" },
        });
      }

      for (const qi of q.data.items) {
        if (qi.review_status !== "disputed") continue;
        ncs.push({
          id: qi.item_id, source: "dispute", asset_id: qi.asset_id,
          title: "Disputed field input",
          detail: qi.content.slice(0, 80),
          tone: "caution",
          when: qi.submitted_at,
          origin: { href: "/governance/quarantine", label: "Quarantine" },
        });
      }

      for (const ev of e.data.items) {
        const result = String((ev.payload as Record<string, unknown>)?.result ?? "");
        if (ev.event_type !== "inspection_complete" || result !== "failed") continue;
        ncs.push({
          id: ev.event_id, source: "inspection", asset_id: ev.asset_id ?? null,
          title: "Inspection failed",
          detail: String((ev.payload as Record<string, unknown>)?.findings ?? "See event"),
          tone: "danger",
          when: ev.occurred_at,
          origin: { href: `/events/${ev.event_id}`, label: "Event" },
        });
      }

      ncs.sort((a, b) => (a.when < b.when ? 1 : -1));
      setItems(ncs);
      setIsDemo(c.source === "demo" && q.source === "demo");
    });
    return () => { alive = false; };
  }, []);

  const counts = useMemo(() => ({
    conflict: items.filter((i) => i.source === "conflict").length,
    inspection: items.filter((i) => i.source === "inspection").length,
    dispute: items.filter((i) => i.source === "dispute").length,
  }), [items]);

  const visible = filter === "all" ? items : items.filter((i) => i.source === filter);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/compliance" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Compliance
      </Link>

      <header className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Layer 7 · Quality</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Non-conformance tracking</h1>
        <p className="mt-1.5 text-[13.5px] text-muted text-pretty">
          Open non-conformances composed from unresolved conflicts, failed inspections, and disputed
          field inputs. Each links to its root-cause workspace and originating record.
        </p>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
        <span className="tabular font-medium text-ink">{items.length} open</span>
        {isDemo && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data
          </span>
        )}
      </div>

      <div className="mt-5">
        <FilterTabs
          tabs={[
            { key: "all", label: "All", count: items.length },
            { key: "conflict", label: "Conflicts", count: counts.conflict },
            { key: "inspection", label: "Inspections", count: counts.inspection },
            { key: "dispute", label: "Disputes", count: counts.dispute },
          ]}
          active={filter}
          onChange={(k) => setFilter(k as "all" | NcSource)}
        />
      </div>

      <div className="mt-4 space-y-2">
        {visible.length === 0 && <EmptyState message="No open non-conformances." />}
        {visible.map((nc) => (
          <div key={`${nc.source}-${nc.id}`} className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusBadge tone={nc.tone}>{SOURCE_LABEL[nc.source]}</StatusBadge>
              <span className="text-[13px] font-semibold text-ink">{nc.title}</span>
              {nc.asset_id && <span className="tabular text-[12px] text-accent">{nc.asset_id}</span>}
              <span className="tabular ml-auto text-[11px] text-muted">{relativeTime(nc.when)}</span>
            </div>
            <p className="mt-1 text-[12.5px] text-muted">{nc.detail}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
              <Link href="/rca" className="text-accent underline hover:no-underline">Root-cause analysis ↗</Link>
              {nc.origin && <Link href={nc.origin.href} className="text-accent underline hover:no-underline">{nc.origin.label} ↗</Link>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
