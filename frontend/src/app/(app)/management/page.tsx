"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui";
import { getConflicts, getComplianceDashboard } from "@/lib/api";

const COVERAGE = [
  { klass: "Rotating equipment", pct: 88 },
  { klass: "Static / vessels",   pct: 74 },
  { klass: "Instrumentation",    pct: 69 },
  { klass: "Electrical",         pct: 52 },
];

const ALERTS = [
  { text: "Seal thermal-cycling pattern seen at 3 sister pumps (P-101, P-204, P-311)", tone: "caution" as const, tag: "Cross-site", href: "/management/cross-site" },
  { text: "Feed-water hardness excursions driving fouling across HX-3xx series",       tone: "caution" as const, tag: "Cross-site", href: "/management/cross-site" },
  { text: "OISD-117 §6.4 relief-device evidence blocked on 2 assets",                  tone: "danger"  as const, tag: "Compliance", href: "/compliance" },
];

const SERVICES = ["Neo4j", "Qdrant", "Elasticsearch", "Redis", "Supabase"];

export default function ManagementPage() {
  const [conflicts, setConflicts] = useState<number | null>(null);
  const [compliance, setCompliance] = useState<{ total: number; lastScan: string } | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getConflicts(), getComplianceDashboard()]).then(([cr, dr]) => {
      if (!alive) return;
      setConflicts(cr.data?.total ?? null);
      if (dr.data) {
        const t = dr.data.total_gaps;
        setCompliance({ total: t.critical + t.major + t.minor, lastScan: dr.data.last_updated ?? "" });
      }
      setIsDemo(cr.source === "demo" && dr.source === "demo");
    }).catch(() => { if (alive) setIsDemo(true); });
    return () => { alive = false; };
  }, []);

  const coveragePct = 78; // ponytail: no coverage API endpoint; static until Layer-4 aggregation added
  const kpis = [
    { label: "Knowledge coverage", value: `${coveragePct}%`,                                  sub: "of registered assets",   color: "var(--accent)" },
    { label: "Open conflicts",      value: conflicts !== null ? String(conflicts) : "—",       sub: "awaiting resolution",    color: "var(--danger)" },
    { label: "Compliance posture",  value: compliance ? `${compliance.total} gaps` : "—",     sub: "pending remediation",    color: "var(--caution)" },
    { label: "Cross-site alerts",   value: String(ALERTS.filter((a) => a.tag === "Cross-site").length), sub: "pattern matches", color: "var(--info)" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Cross-functional</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Plant overview</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">Situational awareness across knowledge, conflicts, and compliance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDemo && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
              <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
              Demo data
            </span>
          )}
          <Link
            href="/management/plant-state"
            className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Plant state
          </Link>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">{k.label}</p>
            <p className="tabular mt-1.5 text-[26px] font-semibold leading-none" style={{ color: k.color }}>
              {k.value}
            </p>
            <p className="mt-1.5 text-[11.5px] text-muted">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Coverage by asset class</h2>
          <div className="mt-4 space-y-3.5">
            {COVERAGE.map((c) => (
              <div key={c.klass}>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span>{c.klass}</span>
                  <span className="tabular text-muted">{c.pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Cross-site &amp; compliance alerts</h2>
          <ul className="mt-4 space-y-3">
            {ALERTS.map((a) => (
              <li key={a.text} className="flex flex-col gap-1.5">
                <StatusBadge tone={a.tone}>{a.tag}</StatusBadge>
                <Link href={a.href} className="text-[13px] leading-relaxed text-ink hover:text-accent hover:underline">
                  {a.text}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/management/cross-site"
            className="mt-4 inline-flex text-[12px] font-medium text-accent hover:underline"
          >
            View all cross-site alerts →
          </Link>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">System health</h2>
          <StatusBadge tone="verified">All services up</StatusBadge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SERVICES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1 text-[12px]">
              <span className="size-1.5 rounded-full bg-verified" aria-hidden="true" />
              {s}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
