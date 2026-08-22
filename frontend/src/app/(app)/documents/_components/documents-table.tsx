"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VaultDocument } from "@/lib/types";
import { authorityLabel } from "@/lib/utils";
import { label } from "@/lib/labels";
import { DataTable, EmptyState, FilterTabs, StatusBadge, statusTone, Timestamp, Truncate, type TableColumn } from "@/components/ui";

/** VaultDocument re-mapped so it satisfies DataTable's Record constraint. */
type DocRow = Pick<VaultDocument, keyof VaultDocument>;

const COLUMNS: TableColumn<DocRow>[] = [
  {
    key: "file_name", label: "Document", sortable: true, className: "w-[38%]",
    render: (r) => (
      <span className="block min-w-0">
        <Truncate text={r.file_name} className="font-semibold text-ink" />
        <span className="tabular block truncate text-label font-medium text-muted">{r.document_id}</span>
      </span>
    ),
  },
  {
    key: "document_type", label: "Type & source", sortValue: (r) => label(r.document_type),
    render: (r) => (
      <span className="block min-w-0">
        <span className="block whitespace-nowrap text-caption font-medium text-ink">{label(r.document_type)}</span>
        <span className="block truncate text-label text-muted">{label(r.source_system)}</span>
      </span>
    ),
  },
  {
    key: "authority_level", label: "Authority", sortValue: (r) => r.authority_level ?? 99,
    render: (r) => (
      <span className="block min-w-0">
        <span className="tabular block whitespace-nowrap text-caption text-ink">{authorityLabel(r.authority_level)}</span>
        <span className="block whitespace-nowrap text-label text-muted">{(r.asset_links ?? []).length} linked {(r.asset_links ?? []).length === 1 ? "asset" : "assets"}</span>
      </span>
    ),
  },
  {
    key: "status", label: "State", sortable: true,
    render: (r) => <StatusBadge tone={statusTone(r.status)}>{label(r.status)}</StatusBadge>,
  },
  {
    key: "ingested_at", label: "Updated", sortValue: (r) => Date.parse(r.ingested_at),
    render: (r) => <Timestamp value={r.ingested_at} />,
  },
  {
    key: "download", label: "Get", align: "right",
    render: (r) => r.vault_url ? (
      <a href={r.vault_url} className="text-link" onClick={(event) => event.stopPropagation()}>
        Download
      </a>
    ) : null,
  },
];

export function DocumentsTable({ items }: { items: VaultDocument[] }) {
  const router = useRouter();
  const [stateFilter, setStateFilter] = useState("all");

  const counts = useMemo(() => ({
    active: items.filter((d) => d.status === "active").length,
    superseded: items.filter((d) => d.status !== "active").length,
  }), [items]);

  const rows = useMemo<DocRow[]>(() => {
    const scoped = stateFilter === "all" ? items : items.filter((d) => (stateFilter === "active" ? d.status === "active" : d.status !== "active"));
    return [...scoped].sort((a, b) => Date.parse(b.ingested_at) - Date.parse(a.ingested_at));
  }, [items, stateFilter]);

  return (
    <section data-testid="documents-registry" className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <FilterTabs
          tabs={[
            { key: "all", label: "All", count: items.length },
            { key: "active", label: "Active", count: counts.active },
            { key: "superseded", label: "Superseded", count: counts.superseded },
          ]}
          active={stateFilter}
          onChange={setStateFilter}
        />
        <span className="tabular ml-auto text-caption font-medium text-muted">{rows.length} of {items.length} records</span>
      </div>
      <DataTable<DocRow>
        key={stateFilter}
        columns={COLUMNS}
        rows={rows}
        keyFn={(r) => r.document_id}
        pageSize={25}
        onRowClick={(r) => router.push(`/documents/${r.document_id}`)}
        emptyState={<EmptyState message="No documents match this filter." />}
      />
    </section>
  );
}
