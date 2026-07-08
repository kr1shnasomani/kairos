"use client";

import { useState } from "react";
import type { Brief, BriefPriority, BriefsResponse } from "@/lib/types";
import { priorityMeta, relativeTime } from "@/lib/utils";
import { BriefCard } from "./brief-card";
import { FilterTabs } from "./ui";

// PTW-critical first, then by priority order per EEMUA-191.
const PRIORITY_ORDER: BriefPriority[] = ["critical", "high", "normal", "medium", "low"];

type FilterKey = "all" | "unacknowledged" | "critical";

function GovernorBanner({ response }: { response: BriefsResponse }) {
  const gov = response.governor_state;
  const pct = Math.min(100, Math.round((gov.push_count_last_hour / gov.ceiling) * 100));
  const suppressed = gov.state === "suppressed";

  if (!suppressed && response.suppressed_count === 0) {
    // Show a compact pill when everything is normal
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-[12px]">
        <span className="font-semibold text-muted">Push governor</span>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-verified" style={{ width: `${pct}%` }} />
        </div>
        <span className="tabular text-muted">{gov.push_count_last_hour}/{gov.ceiling}/hr</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[13px] font-semibold text-danger">
            {response.suppressed_count} brief{response.suppressed_count !== 1 ? "s" : ""} held — governor suppressed
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {gov.push_count_last_hour}/{gov.ceiling} pushes this hour
            {response.next_delivery_allowed_at && (
              <> · next delivery {relativeTime(response.next_delivery_allowed_at)}</>
            )}
          </p>
        </div>
        <span className="tabular text-[22px] font-semibold text-danger">
          {gov.push_count_last_hour}<span className="text-[14px] text-muted">/{gov.ceiling}</span>
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-danger" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function BriefInbox({ response }: { response: BriefsResponse }) {
  const { briefs } = response;
  const [filter, setFilter] = useState<FilterKey>("all");

  const filterTabs = [
    { key: "all" as FilterKey, label: "All", count: briefs.length },
    { key: "unacknowledged" as FilterKey, label: "Unacknowledged", count: briefs.filter((b) => !b.acknowledged_at).length },
    { key: "critical" as FilterKey, label: "Critical", count: briefs.filter((b) => b.priority === "critical").length },
  ].filter((t) => t.key === "all" || t.count > 0);

  const filtered =
    filter === "unacknowledged" ? briefs.filter((b) => !b.acknowledged_at) :
    filter === "critical" ? briefs.filter((b) => b.priority === "critical") :
    briefs;

  const groups = PRIORITY_ORDER.filter((p) => filtered.some((b) => b.priority === p));

  // PTW briefs surface first within critical
  function sortGroup(group: Brief[]): Brief[] {
    return [...group].sort((a, b) => {
      if (a.requires_countersignature && !b.requires_countersignature) return -1;
      if (!a.requires_countersignature && b.requires_countersignature) return 1;
      return 0;
    });
  }

  return (
    <div className="space-y-4">
      <GovernorBanner response={response} />

      <FilterTabs
        tabs={filterTabs}
        active={filter}
        onChange={(k) => setFilter(k as FilterKey)}
      />

      <div className="flex flex-col gap-6">
        {groups.length === 0 && (
          <p className="py-10 text-center text-[13px] text-muted">No briefs in this view.</p>
        )}
        {groups.map((p) => {
          const group = sortGroup(filtered.filter((b) => b.priority === p));
          return (
            <section key={p} aria-label={`${priorityMeta(p).label} briefs`}>
              <div className="mb-2 flex items-center gap-2 px-0.5">
                <span className="size-1.5 rounded-full" style={{ background: priorityMeta(p).color }} aria-hidden="true" />
                <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  {priorityMeta(p).label}
                </h2>
                <span className="tabular text-[11px] text-muted">{group.length}</span>
              </div>
              <div className="flex flex-col gap-3">
                {group.map((b) => <BriefCard key={b.brief_id} brief={b} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
