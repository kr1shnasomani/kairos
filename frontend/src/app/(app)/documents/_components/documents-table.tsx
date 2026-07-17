"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VaultDocument } from "@/lib/types";
import { authorityLabel, relativeTime, triggerLabel } from "@/lib/utils";
import { DataTable, EmptyState, FilterTabs, StatusBadge, type TableColumn } from "@/components/ui";

/** VaultDocument re-mapped so it satisfies DataTable's Record constraint. */
type DocRow = Pick<VaultDocument, keyof VaultDocument>;

const COLUMNS: TableColumn<DocRow>[] = [
  {
    key: "file_name", label: "Document", sortable: true, className: "w-full max-w-[320px]",
    render: (r) => (
      <span className="block min-w-0">
        <span className="block truncate font-semibold text-ink">{r.file_name}</span>
        <span className="tabular block truncate text-label font-medium text-accent">{r.document_id}</span>
      </span>
    ),
  },
  {
    key: "document_type", label: "Type & source", sortValue: (r) => triggerLabel(r.document_type),
    render: (r) => (
      <span className="block min-w-0">
        <span className="block whitespace-nowrap text-caption font-medium text-ink">{triggerLabel(r.document_type)}</span>
        <span className="block truncate text-label text-muted">{r.source_system?.replace(/_/g, " ") ?? "—"}</span>
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
    render: (r) => <StatusBadge tone={r.status === "active" ? "verified" : "neutral"}>{r.status}</StatusBadge>,
  },
  {
    key: "ingested_at", label: "Updated", sortValue: (r) => Date.parse(r.ingested_at),
    render: (r) => <span className="tabular whitespace-nowrap text-caption text-muted" title={r.ingested_at}>{relativeTime(r.ingested_at)}</span>,
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
