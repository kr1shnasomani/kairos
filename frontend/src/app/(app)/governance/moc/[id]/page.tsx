"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { MocItem, ConflictSource } from "@/lib/types";
import { getMoc, approveMoc, type DataSource } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import { StatusBadge, DemoChip } from "@/components/ui";
import dynamic from "next/dynamic";

const BlastRadiusPanel = dynamic(
  () => import("@/components/blast-radius-panel").then((m) => m.BlastRadiusPanel),
  { ssr: false, loading: () => null }
);

const FIXTURES: MocItem[] = [
  {
    moc_id: "MOC-2024-001",
    asset_id: "P-101",
    parameter: "operating_pressure",
    source_a: { value: "12.5 bar", document_id: "DOC-OEM-001" },
    source_b: { value: "14.0 bar", document_id: "DOC-INSP-007" },
    blast_radius_count: 7,
    status: "pending",
    created_at: new Date(Date.now() - 86400000).toISOString(),
    draft_content: "EWR Draft: Operating pressure discrepancy on P-101. Source OEM-001 records 12.5 bar; recent inspection DOC-INSP-007 records 14.0 bar. Recommend engineering review of seal ratings before next scheduled maintenance window.",
  },
  {
    moc_id: "MOC-2024-002",
    asset_id: "V-247",
    parameter: "relief_valve_setpoint",
    source_a: { value: "16 bar", document_id: "DOC-PROC-003" },
    source_b: { value: "18 bar", document_id: "DOC-OEM-008" },
    blast_radius_count: 3,
    status: "pending",
    created_at: new Date(Date.now() - 172800000).toISOString(),
    draft_content: null,
  },
  {
    moc_id: "MOC-2024-003",
    asset_id: "EQ-101",
    parameter: "maintenance_interval_days",
    source_a: { value: "90", document_id: "DOC-PROC-011" },
    source_b: { value: "120", document_id: "DOC-OEM-002" },
    blast_radius_count: 2,
    status: "approved",
    created_at: new Date(Date.now() - 432000000).toISOString(),
    draft_content: null,
  },
];
const FIXTURE_MAP = new Map(FIXTURES.map((f) => [f.moc_id, f]));

const STATUS_TONE: Record<string, "caution" | "verified" | "danger"> = {
  pending: "caution",
  approved: "verified",
  rejected: "danger",
};

export default function MocDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [moc, setMoc] = useState<MocItem | null>(null);
  const [source, setSource] = useState<DataSource>("demo");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMoc(id).then(({ data, source }) => {
      if (!alive) return;
      setMoc(data ?? FIXTURE_MAP.get(id) ?? null);
      setSource(data ? source : "demo");
    });
    return () => { alive = false; };
  }, [id]);

  async function handleApprove() {
    if (!moc) return;
    setBusy(true);
    setError(null);
    try {
      await approveMoc(moc.moc_id, note || undefined);
      setMoc({ ...moc, status: "approved" });
    } catch {
      setError("Approval failed — backend offline or rejected.");
    } finally {
      setBusy(false);
    }
  }

  if (!moc) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center text-body text-muted">
        Loading MoC…
      </div>
    );
  }

  const isPending = moc.status === "pending";

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/governance/moc" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        MoC queue
      </Link>

      <header className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="tabular text-display font-semibold text-accent">{moc.moc_id}</h1>
        <StatusBadge tone={STATUS_TONE[moc.status] ?? "neutral"}>{moc.status}</StatusBadge>
        {source === "demo" && <DemoChip />}
        <span className="tabular ml-auto text-label text-muted">{relativeTime(moc.created_at)}</span>
      </header>

      <p className="mt-2 text-body">
        Parameter discrepancy on <Link href={`/assets/${moc.asset_id}`} className="font-semibold text-accent hover:underline">{moc.asset_id}</Link>:{" "}
        <span className="font-medium">{moc.parameter.replace(/_/g, " ")}</span>
      </p>

      {/* Source comparison */}
      <section className="mt-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Conflicting sources</h2>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          {([
            { s: moc.source_a as ConflictSource, tag: "A" },
            { s: moc.source_b as ConflictSource, tag: "B" },
          ]).map(({ s, tag }) => (
            <div key={tag} className="rounded-lg border border-line bg-surface-2 p-3">
              <span className="tabular text-label font-semibold text-muted">Source {tag}</span>
              <p className="mt-1 text-body font-medium">{String(s?.value ?? "—")}</p>
              {s?.document_id && (
                <Link
                  href={`/documents/${s.document_id}`}
                  className="tabular mt-0.5 block text-label text-accent hover:underline"
                >
                  {s.document_id}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Draft EWR content */}
      {moc.draft_content && (
        <section className="mt-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Auto-drafted EWR</h2>
          <div className="mt-2.5 rounded-xl border border-line bg-surface p-4 text-body leading-relaxed text-ink">
            {moc.draft_content}
          </div>
          <p className="mt-1.5 text-label text-muted">
            Draft generated by KAIROS. Requires engineer sign-off — never auto-approved.
          </p>
        </section>
      )}

      {/* Approval */}
      {isPending && (
        <section className="mt-5 rounded-xl border border-[color-mix(in_srgb,var(--caution)_30%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_6%,var(--surface))] p-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Engineer sign-off</h2>
          <p className="mt-2 text-caption text-muted">
            Approving this MoC closes the validity window of the old edge and clears downstream warning banners.
            This action is irreversible and logged.
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Engineer note (optional)"
              aria-label="Engineer note"
              className="h-9 rounded-lg border border-line bg-surface px-3 text-caption outline-none focus:border-accent"
            />
            {error && <p className="text-caption text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={busy}
                className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-caption font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Approving…" : "Approve MoC"}
              </button>
              <Link
                href="/governance/conflicts"
                className="inline-flex h-9 items-center rounded-lg border border-line px-4 text-caption font-semibold text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                View conflict
              </Link>
            </div>
          </div>
        </section>
      )}

      {!isPending && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 text-body font-semibold ${moc.status === "approved" ? "text-verified" : "text-danger"}`}>
            <span className={`size-2 rounded-full ${moc.status === "approved" ? "bg-verified" : "bg-danger"}`} aria-hidden="true" />
            {moc.status === "approved" ? "Approved — downstream facts cleared" : "Rejected"}
          </span>
        </div>
      )}

      {/* Blast radius */}
      {moc.blast_radius_count > 0 && (
        <div className="mt-6">
          <BlastRadiusPanel documentId={(moc.source_b as ConflictSource)?.document_id ?? moc.moc_id} />
        </div>
      )}
    </div>
  );
}
