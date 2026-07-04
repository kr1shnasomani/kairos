"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Conflict } from "@/lib/types";
import { getConflicts, resolveConflict, type DataSource } from "@/lib/api";
import { authorityLabel, relativeTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";

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

  useEffect(() => {
    let alive = true;
    getConflicts().then(({ data, source }) => {
      if (!alive) return;
      setItems(data.items);
      setSource(source);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function resolve(c: Conflict) {
    setBusy(c.conflict_id);
    setError(null);
    const prev = items;
    // Optimistic: mark resolved immediately.
    setItems((xs) => xs.map((x) => (x.conflict_id === c.conflict_id ? { ...x, status: "resolved" } : x)));
    try {
      await resolveConflict(c.conflict_id, { decision: "accept_higher_authority" });
    } catch {
      setItems(prev); // revert on failure
      setError(`Could not resolve ${c.conflict_id} — backend offline or rejected.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/governance" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Governance
      </Link>

      <header className="mt-4">
        <h1 className="text-[28px] font-semibold leading-tight">Conflicts</h1>
        <p className="mt-1.5 max-w-xl text-[13.5px] text-muted">
          Contradictions between sources, split by track. Administrative conflicts resolve here;
          engineering conflicts are safety-critical and route through Management of Change.
        </p>
      </header>

      <div className="mt-3 flex items-center gap-3 text-[12px] text-muted">
        <span className="tabular font-medium text-ink">{items.length} open</span>
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data — backend offline
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {loaded && items.length === 0 && (
          <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-[13px] text-muted">
            No open conflicts.
          </div>
        )}
        {items.map((c) => {
          const isEng = c.track === "engineering";
          const resolved = c.status === "resolved";
          return (
            <article key={c.conflict_id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular text-[13px] font-semibold text-accent">{c.conflict_id}</span>
                <StatusBadge tone={isEng ? "danger" : "info"} dot={false}>{c.track}</StatusBadge>
                <StatusBadge tone={SEV_TONE[c.severity] ?? "neutral"}>{c.severity}</StatusBadge>
                <span className="tabular text-[11px] text-muted">{c.asset_id}</span>
                {c.is_overdue && !resolved && (
                  <span className="tabular text-[11px] font-semibold text-danger">SLA overdue</span>
                )}
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
                    {s?.document_id && <p className="tabular mt-0.5 text-[11px] text-accent">{s.document_id}</p>}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                {resolved ? (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-verified">
                    <span className="size-1.5 rounded-full bg-verified" aria-hidden="true" />Resolved
                  </span>
                ) : isEng ? (
                  <p className="text-[12px] text-muted">
                    Engineering track — resolve via Management of Change (higher authority wins,
                    old fact&rsquo;s validity window is closed on approval).
                  </p>
                ) : (
                  <button
                    onClick={() => resolve(c)}
                    disabled={busy === c.conflict_id}
                    className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === c.conflict_id ? "Resolving…" : "Resolve (accept higher authority)"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
