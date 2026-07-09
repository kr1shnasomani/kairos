import Link from "next/link";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { getDocument } from "@/lib/api";
import { authorityLabel, relativeTime, triggerLabel } from "@/lib/utils";
import { AuthorityBadge, SourceChip, StatusBadge } from "@/components/ui";

const BlastRadiusPanel = dynamic(
  () => import("@/components/blast-radius-panel").then((m) => m.BlastRadiusPanel),
  { ssr: false, loading: () => null }
);

function fmtSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: d, source } = await getDocument(id);
  if (!d) notFound();

  const meta: { label: string; value: React.ReactNode }[] = [
    { label: "Type", value: triggerLabel(d.document_type) },
    { label: "Source system", value: d.source_system },
    { label: "Ingested", value: `${relativeTime(d.ingested_at)} · ${d.ingested_by}` },
    { label: "File", value: `${d.mime_type ?? "—"} · ${fmtSize(d.file_size_bytes)}` },
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/documents" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Documents
      </Link>

      <header className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="tabular text-[22px] font-semibold text-accent">{d.document_id}</h1>
        <AuthorityBadge level={d.authority_level} />
        {d.status === "superseded"
          ? <StatusBadge tone="neutral" dot={false}>Superseded</StatusBadge>
          : <StatusBadge tone="verified">Active</StatusBadge>}
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data
          </span>
        )}
      </header>
      <p className="mt-1.5 text-[13.5px]">{d.file_name}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {meta.map((m) => (
          <div key={m.label} className="rounded-xl border border-line bg-surface p-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">{m.label}</p>
            <p className="mt-1.5 text-[12.5px] leading-snug">{m.value}</p>
          </div>
        ))}
      </div>

      {d.document_type === "pid_drawing" && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-[12.5px] text-muted">P&ID topology available for this drawing.</p>
          <Link
            href={`/documents/${d.document_id}/topology`}
            className="text-[12.5px] font-medium text-accent hover:underline"
          >
            View topology →
          </Link>
        </div>
      )}

      {d.status === "superseded" && d.version_chain && (
        <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--caution)_35%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_9%,var(--surface))] p-4">
          <p className="text-[12.5px]">
            Superseded by{" "}
            <Link href={`/documents/${d.version_chain}`} className="font-semibold text-accent hover:underline">
              {d.version_chain}
            </Link>
            . The original artifact is retained — immutability is non-negotiable.
          </p>
        </div>
      )}

      {d.asset_links && d.asset_links.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Linked assets</h2>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {d.asset_links.map((aid) => (
              <Link key={aid} href={`/assets/${aid}`}>
                <SourceChip>{aid}</SourceChip>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Provenance</h2>
        <div className="mt-2.5 space-y-2 rounded-xl border border-line bg-surface p-4 text-[12.5px]">
          <Row label="Authority">{authorityLabel(d.authority_level)}</Row>
          {d.sha256_hash && <Row label="SHA-256"><span className="tabular break-all text-muted">{d.sha256_hash}</span></Row>}
          <Row label="Vault">
            {d.vault_url
              ? <a href={d.vault_url} className="font-medium text-accent hover:underline">Open artifact →</a>
              : <span className="text-muted">Authenticated vault URL (available live)</span>}
          </Row>
        </div>
      </section>
      <BlastRadiusPanel documentId={d.document_id} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
