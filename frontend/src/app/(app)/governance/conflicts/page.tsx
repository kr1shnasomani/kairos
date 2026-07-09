"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Conflict } from "@/lib/types";
import { getConflicts, resolveConflict, type DataSource } from "@/lib/api";
import { authorityLabel, relativeTime } from "@/lib/utils";
import { FilterTabs, StatusBadge } from "@/components/ui";

// ── SLA countdown ─────────────────────────────────────────────────────────────

function SlaChip({ sla_due_at, is_overdue }: { sla_due_at: string | null; is_overdue: boolean }) {
  if (!sla_due_at) return null;
  if (is_overdue) {
    return <span className="tabular text-[11px] font-semibold text-danger">SLA overdue</span>;
  }
  const msLeft = new Date(sla_due_at).getTime() - Date.now();
  const hoursLeft = Math.floor(msLeft / 3600000);
  const tone = hoursLeft < 4 ? "text-danger" : hoursLeft < 24 ? "text-caution" : "text-muted";
  const label = hoursLeft < 24 ? `${hoursLeft}h left` : `${Math.floor(hoursLeft / 24)}d left`;
  return <span className={`tabular text-[11px] font-semibold ${tone}`}>{label}</span>;
}

// ── Test-data IDs ─────────────────────────────────────────────────────────────

const TEST_PREFIXES = ["ASSET-TEST-", "ASSET-EV-", "ASSET-DEDUP-"];
function isTestData(c: Conflict) {
  return TEST_PREFIXES.some((p) => c.asset_id?.startsWith(p));
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SEV_TONE: Record<string, "danger" | "caution" | "verified" | "neutral"> = {
  critical: "danger",
  major: "caution",
  minor: "verified",
};

export default function ConflictsPage() {
  const [items, setItems] = useState<Conflict[]>([]);
  const [source, setSource] = useState<DataSource>("demo");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("open");
  const [trackFilter, setTrackFilter] = useState("all");
  const [showTestData, setShowTestData] = useState(false);

  useEffect(() => {
    let alive = true;
    getConflicts().then(({ data, source }) => {
      if (!alive) return;
      setItems(data.items);
      setSource(source);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  async function resolve(c: Conflict) {
    setBusy(c.conflict_id);
    setError(null);
    const prev = items;
    setItems((xs) => xs.map((x) => x.conflict_id === c.conflict_id ? { ...x, status: "resolved" } : x));
    try {
      await resolveConflict(c.conflict_id, { decision: "accept_higher_authority" });
    } catch {
      setItems(prev);
      setError(`Could not resolve ${c.conflict_id} — backend offline or rejected.`);
    } finally {
      setBusy(null);
    }
  }

  const visible = useMemo(() => {
    return items.filter((c) => {
      if (!showTestData && isTestData(c)) return false;
      if (statusFilter === "open" && c.status === "resolved") return false;
      if (statusFilter === "resolved" && c.status !== "resolved") return false;
      if (trackFilter === "administrative" && c.track !== "administrative") return false;
      if (trackFilter === "engineering" && c.track !== "engineering") return false;
      return true;
    });
  }, [items, statusFilter, trackFilter, showTestData]);

  const openCount = items.filter((c) => c.status !== "resolved" && (showTestData || !isTestData(c))).length;
  const adminCount = visible.filter((c) => c.track === "administrative").length;
  const engCount = visible.filter((c) => c.track === "engineering").length;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/governance" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Governance
      </Link>

      <header className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
          Layer 7 · Dual-track governance
        </p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Conflicts</h1>
        <p className="mt-1.5 max-w-xl text-[13.5px] text-muted text-pretty">
          Contradictions between sources, split by track. Administrative conflicts resolve here;
          engineering conflicts are safety-critical and route through Management of Change.
        </p>
      </header>

      {/* Stats row */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px] text-muted">
        <span className="tabular font-medium text-ink">{openCount} open</span>
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data
          </span>
        )}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11.5px]">
          <input
            type="checkbox"
            checked={showTestData}
            onChange={(e) => setShowTestData(e.target.checked)}
            className="size-3 rounded accent-accent"
          />
          Show test data
        </label>
      </div>

      {/* Filter row */}
      <div className="mt-3 flex flex-wrap gap-3">
        <FilterTabs
          tabs={[
            { key: "all", label: "All" },
            { key: "open", label: "Open", count: openCount },
            { key: "resolved", label: "Resolved" },
          ]}
          active={statusFilter}
          onChange={setStatusFilter}
        />
        <FilterTabs
          tabs={[
            { key: "all", label: "All tracks" },
            { key: "administrative", label: "Administrative", count: adminCount },
            { key: "engineering", label: "Engineering", count: engCount },
          ]}
          active={trackFilter}
          onChange={setTrackFilter}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {loaded && visible.length === 0 && (
          <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-[13px] text-muted">
            No conflicts match the current filters.
          </div>
        )}
        {visible.map((c) => <ConflictCard key={c.conflict_id} c={c} busy={busy} onResolve={resolve} />)}
      </div>
    </div>
  );
}

// ── Conflict card ─────────────────────────────────────────────────────────────

function ConflictCard({
  c,
  busy,
  onResolve,
}: {
  c: Conflict;
  busy: string | null;
  onResolve: (c: Conflict) => void;
}) {
  const isEng = c.track === "engineering";
  const resolved = c.status === "resolved";
  const pendingMoc = isEng && c.status === "pending_moc";

  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      {/* Engineering-track MoC warning */}
      {pendingMoc && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--caution)_35%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_8%,var(--surface))] px-3 py-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-caution" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-[12px] text-caution">
            Pending Management of Change —{" "}
            <Link href="/governance/moc" className="font-semibold underline hover:opacity-80">
              view MoC queue
            </Link>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular text-[13px] font-semibold text-accent">{c.conflict_id}</span>
        <StatusBadge tone={isEng ? "danger" : "info"} dot={false}>{c.track}</StatusBadge>
        <StatusBadge tone={SEV_TONE[c.severity] ?? "neutral"}>{c.severity}</StatusBadge>
        <span className="tabular text-[11px] text-muted">{c.asset_id}</span>
        <SlaChip sla_due_at={c.sla_due_at} is_overdue={c.is_overdue && !resolved} />
        <span className="tabular ml-auto text-[11px] text-muted">{relativeTime(c.created_at)}</span>
      </div>

      <p className="mt-2.5 text-[13.5px]">
        Contradiction on <span className="font-semibold">{c.parameter.replace(/_/g, " ")}</span>
      </p>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {[
          { s: c.source_a, auth: c.authority_a, tag: "A" },
          { s: c.source_b, auth: c.authority_b, tag: "B" },
        ].map(({ s, auth, tag }) => (
          <div key={tag} className="rounded-lg border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <span className="tabular text-[11px] font-semibold text-muted">Source {tag}</span>
              <span className="tabular text-[10.5px] text-muted">{authorityLabel(auth)}</span>
            </div>
            <p className="mt-1 text-[13px] font-medium">{String(s?.value ?? "—")}</p>
            {s?.document_id && (
              <Link href={`/documents/${s.document_id}`} className="tabular mt-0.5 block text-[11px] text-accent hover:underline">
                {s.document_id}
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        {resolved ? (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-verified">
            <span className="size-1.5 rounded-full bg-verified" aria-hidden="true" />
            Resolved
          </span>
        ) : isEng ? (
          <p className="text-[12px] text-muted">
            Engineering track — resolution requires a signed Management of Change.
            Direct resolve is blocked; the MoC governs the old edge&rsquo;s validity window.
          </p>
        ) : (
          <button
            onClick={() => onResolve(c)}
            disabled={busy === c.conflict_id}
            className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy === c.conflict_id ? "Resolving…" : "Resolve · accept higher authority"}
          </button>
        )}
      </div>
    </article>
  );
}
