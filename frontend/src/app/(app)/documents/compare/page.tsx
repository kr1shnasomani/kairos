"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { VaultDocument } from "@/lib/types";
import { getDocument } from "@/lib/api";
import { AuthorityBadge, Button, EmptyState, StatusBadge, PageHeader } from "@/components/ui";
import { PageSkeleton } from "@/components/skeleton";
import { authorityLabel, triggerLabel, relativeTime } from "@/lib/utils";

export default function CompareRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComparePage />
    </Suspense>
  );
}

function ComparePage() {
  const sp = useSearchParams();
  const [idA, setIdA] = useState(sp.get("a") ?? "");
  const [idB, setIdB] = useState(sp.get("b") ?? "");
  const [docA, setDocA] = useState<VaultDocument | null>(null);
  const [docB, setDocB] = useState<VaultDocument | null>(null);
  const [busy, setBusy] = useState(false);

  async function compare() {
    setBusy(true);
    try {
      const [a, b] = await Promise.all([
        idA.trim() ? getDocument(idA.trim()) : Promise.resolve({ data: null }),
        idB.trim() ? getDocument(idB.trim()) : Promise.resolve({ data: null }),
      ]);
      setDocA(a.data);
      setDocB(b.data);
    } finally {
      setBusy(false);
    }
  }

  // Prefill compare from ?a=&b= without a synchronous setState in the effect body.
  useEffect(() => {
    const a = sp.get("a"), b = sp.get("b");
    if (!a || !b) return;
    let alive = true;
    (async () => {
      const [ra, rb] = await Promise.all([getDocument(a), getDocument(b)]);
      if (!alive) return;
      setDocA(ra.data);
      setDocB(rb.data);
    })();
    return () => { alive = false; };
  }, [sp]);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/documents" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Documents
      </Link>

      <PageHeader className="mt-4" eyebrow="Layer 2 · Immutable vault" title="Compare versions" lede="Walk the supersede chain and diff metadata across two versions. A superseded document is never presented as current — supersession closes a validity window, it does not erase." />

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block text-caption">
          <span className="font-semibold text-ink">Document A</span>
          <input value={idA} onChange={(e) => setIdA(e.target.value)} placeholder="DOC-001"
            className="mt-1 h-9 w-40 rounded-lg border border-line bg-surface px-2.5 text-body" />
        </label>
        <label className="block text-caption">
          <span className="font-semibold text-ink">Document B</span>
          <input value={idB} onChange={(e) => setIdB(e.target.value)} placeholder="DOC-002"
            className="mt-1 h-9 w-40 rounded-lg border border-line bg-surface px-2.5 text-body" />
        </label>
        <Button variant="primary" onClick={compare} disabled={busy || !idA || !idB}>
          {busy ? "Loading…" : "Compare"}
        </Button>
      </div>

      {docA || docB ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <DocCard doc={docA} label="A" other={docB} />
          <DocCard doc={docB} label="B" other={docA} />
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState message="Enter two document IDs above to compare their versions." />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, changed }: { label: string; value: React.ReactNode; changed?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 px-3 py-2 text-caption ${changed ? "bg-[color-mix(in_srgb,var(--caution)_10%,transparent)]" : ""}`}>
      <span className="text-muted">{label}</span>
      <span className="tabular text-right font-medium text-ink">{value}</span>
    </div>
  );
}

function DocCard({ doc, label, other }: { doc: VaultDocument | null; label: string; other: VaultDocument | null }) {
  if (!doc) return (
    <div className="grid place-items-center rounded-xl border border-dashed border-line py-10 text-body text-muted">
      Document {label} not found
    </div>
  );
  const diff = (a: unknown, b: unknown) => other != null && a !== b;
  return (
    <section className="overflow-hidden rounded-xl border border-line">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2.5">
        <span className="tabular text-body font-semibold text-accent">{doc.document_id}</span>
        {doc.status === "superseded"
          ? <StatusBadge tone="caution" dot={false}>superseded</StatusBadge>
          : <StatusBadge tone="verified" dot={false}>active</StatusBadge>}
        <AuthorityBadge level={doc.authority_level} />
      </div>
      <div className="divide-y divide-line/60 bg-surface">
        <Row label="File" value={doc.file_name} changed={diff(doc.file_name, other?.file_name)} />
        <Row label="Type" value={triggerLabel(doc.document_type)} changed={diff(doc.document_type, other?.document_type)} />
        <Row label="Authority" value={authorityLabel(doc.authority_level)} changed={diff(doc.authority_level, other?.authority_level)} />
        <Row label="Source" value={doc.source_system} changed={diff(doc.source_system, other?.source_system)} />
        <Row label="Ingested" value={relativeTime(doc.ingested_at)} changed={diff(doc.ingested_at, other?.ingested_at)} />
        <Row label="By" value={doc.ingested_by} changed={diff(doc.ingested_by, other?.ingested_by)} />
        {doc.sha256_hash && <Row label="SHA-256" value={<span title={doc.sha256_hash}>{doc.sha256_hash.slice(0, 12)}…</span>} changed={diff(doc.sha256_hash, other?.sha256_hash)} />}
        {doc.version_chain && <Row label="Chain" value={doc.version_chain} />}
      </div>
      <div className="border-t border-line bg-surface px-3 py-2">
        <Link href={`/documents/${doc.document_id}`} className="text-caption text-accent underline hover:no-underline">Open document {label} ↗</Link>
      </div>
    </section>
  );
}
