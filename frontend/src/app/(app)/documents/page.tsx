import Link from "next/link";
import { getDocuments } from "@/lib/api";
import { authorityLabel, triggerLabel } from "@/lib/utils";
import { DemoChip, EmptyState } from "@/components/ui";

export const metadata = { title: "Documents — Kairos" };

export default async function DocumentsPage() {
  const { data, source } = await getDocuments();

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">Immutable evidence vault</p>
          <h1 className="mt-1 text-display font-semibold leading-tight">Documents</h1>
          <p className="mt-1.5 text-body text-muted">
            Every source is stored byte-for-byte and never deleted — superseding closes a validity window, it
            does not erase.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/documents/compare"
            className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-body font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            Compare
          </Link>
          <Link
            href="/documents/ingest"
            className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-body font-semibold text-on-accent transition-opacity hover:opacity-90"
          >
            Ingest document
          </Link>
        </div>
      </header>

      <div className="mt-3 flex items-center gap-3 text-caption text-muted">
        <span className="tabular font-medium text-ink">{data.total} in vault</span>
        {source === "demo" && <DemoChip detail="backend offline" />}
      </div>

      {data.items.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No documents in the vault yet." action={{ label: "Ingest a document", href: "/documents/ingest" }} />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          {data.items.map((d, i) => (
            <Link key={d.document_id} href={`/documents/${d.document_id}`}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2 ${i > 0 ? "border-t border-line" : ""}`}>
              <span className="tabular text-caption font-semibold text-accent">{d.document_id}</span>
              <span className="min-w-0 flex-1 truncate text-body">{d.file_name}</span>
              <span className="text-label text-muted">{triggerLabel(d.document_type)}</span>
              <span className="tabular hidden text-label text-muted sm:inline">{authorityLabel(d.authority_level)}</span>
              {d.status === "superseded" ? (
                <span className="tabular text-label text-muted line-through">superseded</span>
              ) : (
                <span className="tabular text-label text-verified">active</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
