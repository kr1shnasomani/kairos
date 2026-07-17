// Vault document list: every ingested source, active or superseded.
import Link from "next/link";
import { getDocuments } from "@/lib/api";
import { DemoChip, EmptyState, PageHeader } from "@/components/ui";
import { StatPills } from "@/components/stat-pills";
import { DocumentsTable } from "./_components/documents-table";

export const metadata = { title: "Documents — Kairos" };

export default async function DocumentsPage() {
  const { data, source } = await getDocuments();
  const items = data.items ?? [];
  const activeCount = items.filter((d) => d.status === "active").length;

  return (
    <div data-testid="documents-workspace" className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Immutable evidence vault"
        title="Documents"
        lede="Every source is stored byte-for-byte and never deleted — superseding closes a validity window, it does not erase."
        actions={
          <>
            {source === "demo" && <DemoChip detail="backend offline" />}
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
          </>
        }
      />

      <section data-testid="documents-summary" className="mt-5">
        <StatPills
          pills={[
            { key: "total", label: "Evidence records", value: data.total ?? items.length },
            { key: "active", label: "Active", value: activeCount },
            { key: "superseded", label: "Superseded", value: items.length - activeCount },
          ]}
        />
      </section>

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No documents ingested" action={{ label: "Ingest a document", href: "/documents/ingest" }} />
        </div>
      ) : (
        <DocumentsTable items={items} />
      )}
    </div>
  );
}
