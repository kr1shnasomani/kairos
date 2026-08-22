import Link from "next/link";
import type { Conflict } from "@/lib/types";
import { relativeTime, slaCountdown } from "@/lib/utils";
import { StatusBadge, type TableColumn } from "@/components/ui";

/** Conflict re-mapped so it satisfies DataTable's Record constraint. */
export type ConflictRow = Pick<Conflict, keyof Conflict>;

const SEV_TONE: Record<string, "danger" | "caution" | "verified" | "neutral"> = {
  critical: "danger",
  major: "caution",
  minor: "verified",
};

function SlaChip({ c, nowMs }: { c: ConflictRow; nowMs: number }) {
  if (c.status === "resolved" || !c.sla_due_at) return <span className="text-muted">—</span>;
  if (c.is_overdue) return <span className="tabular whitespace-nowrap text-label font-semibold text-danger">SLA overdue</span>;
  const { label, tone } = slaCountdown(c.sla_due_at, nowMs);
  return <span className={`tabular whitespace-nowrap text-label font-semibold ${tone}`}>{label}</span>;
}

export function buildColumns(nowMs: number, busy: string | null, onResolve: (c: ConflictRow) => void): TableColumn<ConflictRow>[] {
  return [
    { key: "conflict_id", label: "Conflict", sortable: true, render: (r) => <span className="tabular whitespace-nowrap font-semibold text-accent">{r.conflict_id}</span> },
    { key: "track", label: "Track", sortable: true, render: (r) => <StatusBadge tone={r.track === "engineering" ? "danger" : "info"} dot={false}>{r.track}</StatusBadge> },
    { key: "severity", label: "Severity", sortable: true, render: (r) => <StatusBadge tone={SEV_TONE[r.severity] ?? "neutral"}>{r.severity}</StatusBadge> },
    {
      key: "parameter", label: "Contradiction", className: "w-[38%]",
      render: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-ink">{r.parameter.replace(/_/g, " ")}</span>
          <span className="tabular block truncate text-label text-muted">{String(r.source_a?.value ?? "—")} vs {String(r.source_b?.value ?? "—")}</span>
        </span>
      ),
    },
    {
      key: "asset_id", label: "Asset",
      render: (r) => r.asset_id
        ? <Link href={`/assets/${r.asset_id}`} className="tabular whitespace-nowrap text-caption font-medium text-accent hover:underline">{r.asset_id}</Link>
        : <span className="text-muted">—</span>,
    },
    {
      key: "created_at", label: "Age", sortValue: (r) => Date.parse(r.created_at),
      render: (r) => <span className="tabular whitespace-nowrap text-caption text-muted" title={r.created_at}>{relativeTime(r.created_at)}</span>,
    },
    {
      key: "sla", label: "SLA",
      sortValue: (r) => (r.status !== "resolved" && r.is_overdue ? 0 : r.sla_due_at ? Date.parse(r.sla_due_at) : Number.MAX_SAFE_INTEGER),
      render: (r) => <SlaChip c={r} nowMs={nowMs} />,
    },
    {
      key: "resolution", label: "Resolution",
      render: (r) =>
        r.status === "resolved" ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-caption font-semibold text-verified">
            <span className="size-1.5 rounded-full bg-verified" aria-hidden="true" />Resolved
          </span>
        ) : r.track === "engineering" ? (
          <Link href="/governance/moc" className="whitespace-nowrap text-caption font-semibold text-accent hover:underline">MoC required →</Link>
        ) : (
          <button
            onClick={() => onResolve(r)}
            disabled={busy === r.conflict_id}
            className="inline-flex h-8 items-center whitespace-nowrap rounded-lg bg-accent px-3 text-caption font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy === r.conflict_id ? "Resolving…" : "Resolve"}
          </button>
        ),
    },
  ];
}
