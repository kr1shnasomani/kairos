"use client";

import { useEffect, useState } from "react";
import type { ComplianceGap, ComplianceGapsResponse, GapSeverity } from "@/lib/types";
import { getComplianceGaps, type DataSource } from "@/lib/api";
import { Button, StatusBadge } from "@/components/ui";

const SEV_TONE: Record<GapSeverity, "danger" | "caution" | "verified"> = {
  critical: "danger",
  major: "caution",
  minor: "verified",
};
const SEV_COLOR: Record<GapSeverity, string> = {
  critical: "var(--danger)",
  major: "var(--caution)",
  minor: "var(--muted)",
};
const SEV_ORDER: GapSeverity[] = ["critical", "major", "minor"];

/** Human framework labels (backend IDs use underscores). */
function fwLabel(fw: string): string {
  return fw.replace(/_/g, "-").replace("OISD-117", "OISD-117");
}

export default function CompliancePage() {
  const [resp, setResp] = useState<ComplianceGapsResponse | null>(null);
  const [source, setSource] = useState<DataSource>("demo");
  const [fw, setFw] = useState<string>("All");
  const [packOpen, setPackOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getComplianceGaps().then(({ data, source }) => {
      if (!alive) return;
      setResp(data);
      setSource(source);
    });
    return () => {
      alive = false;
    };
  }, []);

  const gaps: ComplianceGap[] = resp?.items ?? [];
  const frameworks = Array.from(new Set(gaps.map((g) => g.framework)));
  const shown = fw === "All" ? gaps : gaps.filter((g) => g.framework === fw);

  const counts = SEV_ORDER.reduce<Record<GapSeverity, number>>(
    (acc, s) => ({ ...acc, [s]: gaps.filter((g) => g.severity === s).length }),
    { critical: 0, major: 0, minor: 0 },
  );

  const tiles = [
    { label: "Detected gaps", value: gaps.length, color: "var(--accent)" },
    { label: "Critical", value: counts.critical, color: "var(--danger)" },
    { label: "Major", value: counts.major, color: "var(--caution)" },
    { label: "Minor", value: counts.minor, color: "var(--muted)" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Quality &amp; compliance</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Compliance</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            High-recall gap detection: every asset + regulation without a verified procedure is flagged.
          </p>
        </div>
        <Button variant="primary" onClick={() => setPackOpen((v) => !v)}>Assemble audit pack</Button>
      </header>

      <div className="mt-3 flex items-center gap-3 text-[12px] text-muted">
        {frameworks.length > 0 && <span>{frameworks.map(fwLabel).join(" · ")}</span>}
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data — backend offline
          </span>
        )}
      </div>

      {packOpen && (
        <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,var(--line))] bg-surface p-4">
          <p className="text-[13px] font-semibold">Audit pack assembled — {frameworks.map(fwLabel).join(", ")}</p>
          <p className="mt-1 text-[12.5px] text-muted">
            {gaps.length} open gaps evidenced ({counts.critical} critical · {counts.major} major · {counts.minor} minor).
            Clauses with all evidence below the 0.70 confidence threshold require human sign-off before
            clearance — this is audit-preparation acceleration, not automated compliance.
          </p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-line bg-surface p-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">{t.label}</p>
            <p className="tabular mt-1.5 text-[26px] font-semibold leading-none" style={{ color: t.color }}>{t.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {["All", ...frameworks].map((f) => (
          <button key={f} onClick={() => setFw(f)}
            className={`tabular rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
              fw === f ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}>
            {f === "All" ? "All" : fwLabel(f)}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        {shown.length === 0 && (
          <div className="bg-surface px-4 py-8 text-center text-[13px] text-muted">
            {resp ? "No gaps detected for this framework." : "Loading gaps…"}
          </div>
        )}
        {shown.map((g, i) => (
          <div key={`${g.framework}-${g.clause_id}-${g.asset_id}`}
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: SEV_COLOR[g.severity] }} aria-hidden="true" />
              <span className="tabular text-[12px] font-semibold">{fwLabel(g.framework)} §{g.clause_id}</span>
            </span>
            <span className="min-w-0 flex-1 text-[13px]">{g.requirement_text}</span>
            <span className="tabular text-[11px] text-muted">{g.asset_id}</span>
            <StatusBadge tone={SEV_TONE[g.severity]}>{g.severity}</StatusBadge>
          </div>
        ))}
      </div>
    </div>
  );
}
