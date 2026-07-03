"use client";

import { useState } from "react";
import { complianceSummary as S, type GapStatus, type GapSeverity } from "@/lib/compliance";
import { Button, StatusBadge } from "@/components/ui";

const STATUS_TONE: Record<GapStatus, "danger" | "caution" | "verified"> = {
  blocked: "danger",
  open: "caution",
  covered: "verified",
};
const SEV_COLOR: Record<GapSeverity, string> = {
  high: "var(--danger)",
  medium: "var(--caution)",
  low: "var(--muted)",
};

export default function CompliancePage() {
  const [fw, setFw] = useState<string>("All");
  const [packOpen, setPackOpen] = useState(false);
  const gaps = fw === "All" ? S.gaps : S.gaps.filter((g) => g.framework === fw);

  const tiles = [
    { label: "Open gaps", value: S.open, color: "var(--caution)" },
    { label: "Clearance blocked", value: S.blocked, color: "var(--danger)" },
    { label: "Covered", value: S.covered, color: "var(--verified)" },
    { label: "Audit-ready", value: `${S.audit_ready_pct}%`, color: "var(--accent)" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Quality &amp; compliance</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Compliance</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Continuous gap detection mapped to {S.frameworks.join(" · ")}.
          </p>
        </div>
        <Button variant="primary" onClick={() => setPackOpen((v) => !v)}>Assemble audit pack</Button>
      </header>

      {packOpen && (
        <div className="mt-5 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,var(--line))] bg-surface p-4">
          <p className="text-[13px] font-semibold">Audit pack assembled — {S.frameworks.join(", ")}</p>
          <p className="mt-1 text-[12.5px] text-muted">
            {S.covered} clauses evidenced · {S.open} open · {S.blocked} blocked (clearance held below
            confidence threshold — human sign-off required). Ready for desk review.
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
        {["All", ...S.frameworks].map((f) => (
          <button key={f} onClick={() => setFw(f)}
            className={`tabular rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
              fw === f ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}>
            {f}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        {gaps.map((g, i) => (
          <div key={g.gap_id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: SEV_COLOR[g.severity] }} aria-hidden="true" />
              <span className="tabular text-[12px] font-semibold">{g.framework} §{g.clause}</span>
            </span>
            <span className="min-w-0 flex-1 text-[13px]">{g.requirement}</span>
            <span className="tabular text-[11px] text-muted">{g.asset_id}</span>
            <StatusBadge tone={STATUS_TONE[g.status]}>{g.status}</StatusBadge>
          </div>
        ))}
      </div>
    </div>
  );
}
