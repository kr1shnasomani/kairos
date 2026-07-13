"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuditPack, AuditPackClause } from "@/lib/types";
import { getAuditPack } from "@/lib/api";
import { Button, FilterTabs, StatusBadge, EmptyState, DemoChip } from "@/components/ui";

const FRAMEWORKS = ["OISD-117", "ISO 45001", "PESO", "Factory Act"];

export default function AuditPackPage() {
  const [framework, setFramework] = useState(FRAMEWORKS[0]);
  const [pack, setPack] = useState<AuditPack | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      const { data, source } = await getAuditPack(framework);
      if (!alive) return;
      setPack(data);
      setIsDemo(source === "demo" || !data);
      setLoading(false);
    };
    load();
    return () => { alive = false; };
  }, [framework]);

  const clauses = pack?.evidence ?? [];
  const reviewNeeded = clauses.filter((c) => c.clearance_blocked).length;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10 print:max-w-none print:px-0">
      <div className="print:hidden">
        <Link href="/compliance" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Compliance
        </Link>
      </div>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Layer 11 · Audit preparation</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Audit-pack assembly</h1>
          <p className="mt-1.5 text-[13.5px] text-muted text-pretty">
            Evidence organised by regulatory clause. This accelerates audit preparation — it is not
            automated compliance: clauses below the confidence threshold are blocked and require human sign-off.
          </p>
        </div>
        <Button variant="ghost" onClick={() => window.print()} className="print:hidden">
          Print / export PDF
        </Button>
      </header>

      <div className="mt-4 print:hidden">
        <FilterTabs
          tabs={FRAMEWORKS.map((f) => ({ key: f, label: f }))}
          active={framework}
          onChange={setFramework}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
        <span className="tabular font-medium text-ink">{clauses.length} clause{clauses.length !== 1 ? "s" : ""}</span>
        {reviewNeeded > 0 && <span className="text-caution">{reviewNeeded} require human review</span>}
        {isDemo && <DemoChip />}
      </div>

      <div className="mt-5 space-y-4">
        {loading && <p className="text-[13px] text-muted">Assembling pack…</p>}
        {!loading && clauses.length === 0 && (
          <EmptyState message={`No evidence found for ${framework}. Ingest procedures and inspection records to populate the pack.`} />
        )}
        {clauses.map((c) => (
          <ClauseCard
            key={c.clause_id}
            clause={c}
            framework={framework}
          />
        ))}
      </div>
    </div>
  );
}

function ClauseCard({
  clause, framework,
}: {
  clause: AuditPackClause;
  framework: string;
}) {
  const blocked = clause.clearance_blocked;
  return (
    <section className="break-inside-avoid rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="tabular text-[12.5px] font-semibold text-accent">{framework} §{clause.clause_id}</span>
        {blocked
          ? <StatusBadge tone="caution">Requires human review</StatusBadge>
          : <StatusBadge tone="verified">Cleared</StatusBadge>}
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
          Evidence
        </p>
        {!clause.document_id ? (
          <p className="text-[12px] text-danger">No supporting evidence — clearance blocked.</p>
        ) : (
          <span className="tabular text-[12.5px] font-medium text-accent">{clause.document_id}</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <span className="text-[11.5px] text-muted">Human attestation is required; this view does not clear a clause.</span>
      </div>
    </section>
  );
}
