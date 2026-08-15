"use client";

import Link from "next/link";
import { useMemo } from "react";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { getAssetCoverage } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import type { AssetCoverage } from "@/lib/types";
import { cn } from "@/lib/utils";

// The four dimensions the platform can honestly report per asset. "Verified" is deliberately
// included even though it reads zero across the estate today — that is the quarantine gate doing
// its job (nothing is auto-promoted), and hiding the column would hide the finding.
const DIMENSIONS = [
  { key: "facts", label: "Facts", hint: "Distinct knowledge edges on the asset" },
  { key: "authoritative_facts", label: "Authoritative", hint: "From regulatory / engineering / OEM sources (level 1-3)" },
  { key: "verified_facts", label: "Verified", hint: "Human-promoted through the quarantine gate" },
  { key: "documents", label: "Documents", hint: "Vault documents linked to the asset" },
] as const;

/** Shade a cell by its value relative to the strongest asset in that column.
 *  Relative, not absolute: "how thin is this compared with the best-covered equipment we have"
 *  is the question a reliability engineer actually asks, and an absolute scale would paint a
 *  small corpus uniformly empty and say nothing. */
function shade(value: number, max: number): string {
  if (value === 0) return "bg-surface-2 text-muted";
  const ratio = max > 0 ? value / max : 0;
  if (ratio >= 0.75) return "bg-[color-mix(in_srgb,var(--verified)_28%,var(--surface))] text-ink";
  if (ratio >= 0.4) return "bg-[color-mix(in_srgb,var(--verified)_16%,var(--surface))] text-ink";
  return "bg-[color-mix(in_srgb,var(--caution)_14%,var(--surface))] text-ink";
}

export default function CoveragePage() {
  const state = useFetch(() => getAssetCoverage(), []);
  const rows: AssetCoverage[] = state.status === "live" ? state.data : [];

  const maxima = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of DIMENSIONS) m[d.key] = Math.max(0, ...rows.map((r) => Number(r[d.key as keyof AssetCoverage] ?? 0)));
    return m;
  }, [rows]);

  const blindSpots = useMemo(
    () => rows.filter((r) => r.facts === 0 || r.documents === 0 || r.authoritative_facts === 0),
    [rows],
  );

  return (
    <div data-testid="coverage-workspace" className="mx-auto max-w-[1400px]">
      <Link href="/management" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Overview
      </Link>

      <PageHeader
        className="mt-4"
        eyebrow="Knowledge coverage"
        title="What we know, and where we are blind"
        lede="Coverage per asset across the graph and the vault. Shading is relative to the best-covered asset — this shows where knowledge is thin, not whether it is sufficient."
      />

      {state.status === "loading" && (
        <div className="mt-6 h-64 animate-pulse rounded-xl border border-line bg-surface-2" />
      )}

      {state.status === "error" && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_5%,var(--surface))] p-4 text-body text-ink">
          <span>Couldn&apos;t load coverage.</span>
          <button onClick={state.retry} className="rounded-lg border border-line px-3 py-1.5 text-body hover:bg-surface-2">
            Retry
          </button>
        </div>
      )}

      {state.status === "live" && rows.length === 0 && (
        <div className="mt-6 rounded-xl border border-line bg-surface">
          <EmptyState message="No registered assets yet." />
        </div>
      )}

      {state.status === "live" && rows.length > 0 && (
        <>
          {blindSpots.length > 0 && (
            <div
              data-testid="coverage-blind-spots"
              className="mt-6 rounded-xl border border-[color-mix(in_srgb,var(--caution)_30%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_6%,var(--surface))] p-4"
            >
              <p className="text-body font-semibold text-ink">
                {blindSpots.length} asset{blindSpots.length === 1 ? "" : "s"} with a coverage blind spot
              </p>
              <p className="mt-1 text-caption leading-relaxed text-muted">
                Missing facts, no linked document, or nothing above authority level 3. These are the
                assets where a question is most likely to go unanswered — or to be answered from a
                site procedure rather than an engineering source.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {blindSpots.map((b) => (
                  <Link
                    key={b.asset_id}
                    href={`/assets/${b.asset_id}`}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-label text-ink hover:border-[color-mix(in_srgb,var(--accent)_50%,var(--line))]"
                  >
                    {b.asset_id}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[820px] border-collapse text-body">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-3 text-left text-micro font-bold uppercase tracking-[0.1em] text-muted">Asset</th>
                  {DIMENSIONS.map((d) => (
                    <th key={d.key} title={d.hint} className="px-3 py-3 text-center text-micro font-bold uppercase tracking-[0.1em] text-muted">
                      {d.label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-micro font-bold uppercase tracking-[0.1em] text-muted" title="Unverified field input awaiting human review">
                    Quarantined
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.asset_id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/assets/${r.asset_id}`} className="font-medium text-ink hover:text-accent">
                        {r.asset_id}
                      </Link>
                      <div className="text-label text-muted">{r.name}</div>
                    </td>
                    {DIMENSIONS.map((d) => {
                      const v = Number(r[d.key as keyof AssetCoverage] ?? 0);
                      return (
                        <td key={d.key} className="px-3 py-2.5 text-center">
                          <span className={cn("inline-block min-w-[2.5rem] rounded-lg px-2 py-1 tabular font-medium", shade(v, maxima[d.key]))}>
                            {v}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-center">
                      {r.pending_quarantine > 0 ? (
                        <StatusBadge tone="caution" dot={false}>{r.pending_quarantine}</StatusBadge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-caption leading-relaxed text-muted">
            Counts are distinct knowledge edges, so a re-ingested asset does not appear better
            covered than it is. <strong className="font-medium text-ink">Verified reads zero across the
            estate</strong> because promotion through the quarantine gate is human-only and nothing has
            been promoted yet — the column is kept visible rather than hidden, because that is the
            finding.
          </p>
        </>
      )}
    </div>
  );
}
