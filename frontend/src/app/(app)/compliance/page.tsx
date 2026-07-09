"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ComplianceGap, ComplianceDashboard, GapSeverity } from "@/lib/types";
import { getComplianceGaps, getComplianceDashboard, type DataSource } from "@/lib/api";
import { FilterTabs, StatusBadge } from "@/components/ui";

const SEV_TONE: Record<GapSeverity, "danger" | "caution" | "verified"> = {
  critical: "danger",
  major: "caution",
  minor: "verified",
};
const SEV_ORDER: GapSeverity[] = ["critical", "major", "minor"];

function fwLabel(fw: string): string {
  return fw.replace(/_/g, "-");
}

export default function CompliancePage() {
  const [gaps, setGaps] = useState<ComplianceGap[]>([]);
  const [dashboard, setDashboard] = useState<ComplianceDashboard | null>(null);
  const [source, setSource] = useState<DataSource>("demo");

  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  useEffect(() => {
    let alive = true;
    Promise.all([getComplianceGaps(), getComplianceDashboard()]).then(([gapsResult, dashResult]) => {
      if (!alive) return;
      setGaps(gapsResult.data?.items ?? []);
      setSource(gapsResult.source);
      if (dashResult.data) setDashboard(dashResult.data);
    }).catch(() => {
      // ponytail: individual api fns catch internally; this guards unexpected JS throws
    });
    return () => { alive = false; };
  }, []);

  const frameworks = useMemo(() => Array.from(new Set(gaps.map((g) => g.framework))), [gaps]);

  const counts = useMemo(() => {
    const base = dashboard?.by_severity ?? {};
    return SEV_ORDER.reduce<Record<GapSeverity, number>>(
      (acc, s) => ({ ...acc, [s]: base[s] ?? gaps.filter((g) => g.severity === s).length }),
      { critical: 0, major: 0, minor: 0 },
    );
  }, [gaps, dashboard]);

  const visible = useMemo(() => {
    return gaps.filter((g) => {
      if (frameworkFilter !== "all" && g.framework !== frameworkFilter) return false;
      if (severityFilter !== "all" && g.severity !== severityFilter) return false;
      return true;
    });
  }, [gaps, frameworkFilter, severityFilter]);

  const totalGaps = dashboard?.total_gaps ?? gaps.length;
  const lastScan = dashboard?.last_scan ?? null;

  const tiles = [
    { label: "Total gaps", value: totalGaps, color: "var(--accent)" },
    { label: "Critical", value: counts.critical, color: "var(--danger)" },
    { label: "Major", value: counts.major, color: "var(--caution)" },
    { label: "Minor", value: counts.minor, color: "var(--muted)" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Layer 11 · Quality &amp; compliance</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Compliance</h1>
          <p className="mt-1.5 text-[13.5px] text-muted text-pretty">
            High-recall gap detection: every asset + regulation without a verified procedure is flagged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/compliance/nonconformance"
            className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            Non-conformance
          </Link>
          <Link
            href="/compliance/audit-pack"
            className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-on-accent transition-opacity hover:opacity-90"
          >
            Assemble audit pack
          </Link>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
        {frameworks.length > 0 && <span>{frameworks.map(fwLabel).join(" · ")}</span>}
        {lastScan && <span>Last scan: {new Date(lastScan).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>}
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data
          </span>
        )}
      </div>

      {/* KPI tiles */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-line bg-surface p-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">{t.label}</p>
            <p className="tabular mt-1.5 text-[26px] font-semibold leading-none" style={{ color: t.color }}>{t.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap gap-3">
        <FilterTabs
          tabs={[
            { key: "all", label: "All frameworks" },
            ...frameworks.map((fw) => ({ key: fw, label: fwLabel(fw) })),
          ]}
          active={frameworkFilter}
          onChange={setFrameworkFilter}
        />
        <FilterTabs
          tabs={[
            { key: "all", label: "All severity" },
            { key: "critical", label: "Critical", count: counts.critical },
            { key: "major", label: "Major", count: counts.major },
            { key: "minor", label: "Minor", count: counts.minor },
          ]}
          active={severityFilter}
          onChange={setSeverityFilter}
        />
      </div>

      {/* Gap table */}
      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        {visible.length === 0 && (
          <div className="bg-surface px-4 py-8 text-center text-[13px] text-muted">
            {gaps.length > 0 ? "No gaps match the current filters." : "Loading gaps…"}
          </div>
        )}
        {visible.map((g, i) => (
          <div
            key={`${g.framework}-${g.clause_id}-${g.asset_id}`}
            className={`bg-surface px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="tabular text-[12px] font-semibold text-accent">
                {fwLabel(g.framework)} §{g.clause_id}
              </span>
              {g.applies_to && (
                <span className="tabular text-[11px] text-muted">{g.applies_to}</span>
              )}
              <span className="tabular ml-auto text-[11px] text-muted">{g.asset_id}</span>
              <StatusBadge tone={SEV_TONE[g.severity]}>{g.severity}</StatusBadge>
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-ink">{g.requirement_text}</p>
            {g.equipment_class && (
              <p className="mt-0.5 text-[11px] text-muted">Equipment class: {g.equipment_class}</p>
            )}
            {g.suggested_remediation && (
              <p className="mt-1.5 rounded-lg border border-[color-mix(in_srgb,var(--verified)_30%,var(--line))] bg-[color-mix(in_srgb,var(--verified)_7%,var(--surface))] px-3 py-2 text-[12px] text-ink">
                <span className="font-semibold text-verified">Suggested: </span>
                {g.suggested_remediation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
