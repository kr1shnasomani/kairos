"use client";

import { useState } from "react";
import type { Brief, BriefPriority } from "@/lib/types";
import { priorityMeta } from "@/lib/utils";
import { BriefCard } from "./brief-card";

const ORDER: BriefPriority[] = ["critical", "high", "normal", "medium", "low"];
type Filter = "all" | BriefPriority;

/** Filter bar (All / by priority) + priority-grouped feed — Linear inbox grounding. */
export function BriefInbox({ briefs }: { briefs: Brief[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = ORDER.reduce<Record<string, number>>((acc, p) => {
    acc[p] = briefs.filter((b) => b.priority === p).length;
    return acc;
  }, {});
  const present = ORDER.filter((p) => counts[p] > 0);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: briefs.length },
    ...present.map((p) => ({ key: p, label: priorityMeta(p).label, count: counts[p] })),
  ];

  const shownGroups = filter === "all" ? present : present.filter((p) => p === filter);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter briefs">
        {tabs.map((t) => {
          const active = filter === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {t.label}
              <span className="tabular text-[11px] opacity-70">{t.count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-6">
        {shownGroups.map((p) => (
          <section key={p}>
            <div className="mb-2 flex items-center gap-2 px-0.5">
              <span className="size-1.5 rounded-full" style={{ background: priorityMeta(p).color }} aria-hidden="true" />
              <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                {priorityMeta(p).label}
              </h2>
              <span className="tabular text-[11px] text-muted">{counts[p]}</span>
            </div>
            <div className="flex flex-col gap-3">
              {briefs
                .filter((b) => b.priority === p)
                .map((b) => (
                  <BriefCard key={b.brief_id} brief={b} />
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
