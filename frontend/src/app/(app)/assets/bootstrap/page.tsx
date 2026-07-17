"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { confirmAssetIdentity } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { ADMIN_ROLES } from "@/components/use-role";
import { Button, StatusBadge, EmptyState, PageHeader } from "@/components/ui";
import { PageSkeleton } from "@/components/skeleton";

interface Provisional {
  asset_id: string;
  name: string;
  equipment_class: string;
  origin: string;
}
interface AliasCandidate {
  alias: string;
  canonical_asset_id: string;
  confidence: number;
}

// Deployment-time seed — provisional holding nodes lacking identity_confirmed_by,
// plus unresolved tag aliases. In production these come from the graph / asset_alias_map.
const SEED_PROVISIONAL: Provisional[] = [
  { asset_id: "P-207", name: "Provisional pump (EAM import)", equipment_class: "centrifugal_pump", origin: "eam_sync" },
  { asset_id: "HX-14B", name: "Heat exchanger — orphaned tag", equipment_class: "heat_exchanger", origin: "document_extraction" },
  { asset_id: "V-88", name: "Isolation valve (P&ID)", equipment_class: "gate_valve", origin: "pid_drawing" },
];
const SEED_ALIASES: AliasCandidate[] = [
  { alias: "Pump-207", canonical_asset_id: "P-207", confidence: 0.83 },
  { alias: "HEX-14B", canonical_asset_id: "HX-14B", confidence: 0.71 },
];

export default function BootstrapPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<string>("");
  const [siteId, setSiteId] = useState<string>("SITE_001");
  const [provisional, setProvisional] = useState(SEED_PROVISIONAL);
  const [aliases, setAliases] = useState(SEED_ALIASES);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMe().then((u) => {
      setIsAdmin(!!u && ADMIN_ROLES.includes(u.role));
      if (u) { setMe(u.user_id); setSiteId(u.site_id); }
      setReady(true);
    });
  }, []);

  async function confirm(p: Provisional) {
    setBusy(p.asset_id);
    setError(null);
    try {
      await confirmAssetIdentity({
        asset_id: p.asset_id,
        tag_number: p.asset_id,
        name: p.name,
        equipment_class: p.equipment_class,
        criticality: "critical",
        site_id: siteId,
        facility_id: siteId,
        confirmed_by_user_id: me || "admin",
      });
      setProvisional((list) => list.filter((x) => x.asset_id !== p.asset_id));
    } catch {
      setError("Identity confirmation was not saved. Check the connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return <PageSkeleton />;

  return (
    <div data-testid="identity-workspace" className="mx-auto max-w-5xl">
      <Link href="/assets" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Assets
      </Link>

      <PageHeader
        className="mt-4"
        eyebrow="Layer 1 · Master data management"
        title="Asset identity confirmation"
        lede="Review provisional equipment records and approve only identities that belong to a canonical asset."
      />

      <div data-testid="identity-guardrail" className="mt-5 flex gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--caution)_14%,transparent)] text-caution" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l7 3v5c0 4.6-2.9 8.1-7 10-4.1-1.9-7-5.4-7-10V6l7-3z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">Human confirmation required</p>
          <p className="mt-0.5 max-w-3xl text-caption leading-relaxed text-muted">
            Extracted knowledge remains quarantined until a qualified user confirms its asset identity. Kairos never invents the missing identity.
          </p>
        </div>
      </div>

      {!isAdmin && (
        <div className="mt-6 rounded-xl border border-line bg-surface p-5 text-body text-muted">
          Identity confirmation requires the <span className="font-semibold text-ink">admin</span> role.
        </div>
      )}

      {isAdmin && (
        <div className="mt-6 space-y-6">
          <section data-testid="provisional-queue" className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-ink">Provisional assets</h2>
                <p className="mt-0.5 text-caption text-muted">Records awaiting a canonical identity.</p>
              </div>
              <StatusBadge tone={provisional.length ? "caution" : "verified"} dot={false}>
                {provisional.length} pending
              </StatusBadge>
            </div>
            {error && <p role="alert" className="border-b border-line px-4 py-3 text-body text-danger sm:px-5">{error}</p>}
            <div className="divide-y divide-line">
              {provisional.length === 0 && <div className="p-4 sm:p-5"><EmptyState message="All provisional assets confirmed." /></div>}
              {provisional.map((p) => (
                <div
                  key={p.asset_id}
                  data-testid={`provisional-${p.asset_id}`}
                  className="grid gap-3 px-4 py-4 transition-colors hover:bg-surface-2 md:grid-cols-[minmax(0,1fr)_minmax(150px,0.55fr)_auto] md:items-center sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-body font-semibold text-accent">{p.asset_id}</span>
                      <StatusBadge tone="caution" dot={false}>provisional</StatusBadge>
                    </div>
                    <p className="mt-1 truncate text-caption font-medium text-ink">{p.name}</p>
                  </div>
                  <div className="min-w-0 text-label text-muted">
                    <p className="truncate font-medium text-ink">{p.equipment_class.replaceAll("_", " ")}</p>
                    <p className="mt-0.5 truncate">Source · {p.origin.replaceAll("_", " ")}</p>
                  </div>
                  <Button className="h-11 w-full md:h-9 md:w-auto" variant="primary" disabled={busy === p.asset_id} onClick={() => confirm(p)}>
                    {busy === p.asset_id ? "Confirming…" : "Confirm identity"}
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section data-testid="alias-queue" className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-ink">Unresolved tag aliases</h2>
                <p className="mt-0.5 text-caption text-muted">Map each variant to its proposed canonical asset.</p>
              </div>
              <StatusBadge tone={aliases.length ? "info" : "verified"} dot={false}>
                {aliases.length} pending
              </StatusBadge>
            </div>
            <div className="divide-y divide-line">
              {aliases.length === 0 && <div className="p-4 sm:p-5"><EmptyState message="No pending aliases." /></div>}
              {aliases.map((a) => (
                <div key={a.alias} className="grid gap-3 px-4 py-4 transition-colors hover:bg-surface-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center sm:px-5">
                  <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="text-label text-muted">Observed tag</p>
                      <p className="tabular mt-0.5 truncate text-caption font-semibold text-ink">{a.alias}</p>
                    </div>
                    <span className="hidden text-muted sm:block" aria-hidden="true">→</span>
                    <div className="min-w-0">
                      <p className="text-label text-muted">Canonical asset</p>
                      <p className="tabular mt-0.5 truncate text-caption font-semibold text-accent">{a.canonical_asset_id}</p>
                    </div>
                    <StatusBadge tone="info" dot={false}>{Math.round(a.confidence * 100)}% match</StatusBadge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:flex">
                    <Button variant="ghost" className="h-11 md:h-9" aria-label={`Confirm alias ${a.alias}`} onClick={() => setAliases((l) => l.filter((x) => x.alias !== a.alias))}>Confirm</Button>
                    <Button variant="ghost" className="h-11 text-danger md:h-9" aria-label={`Reject alias ${a.alias}`} onClick={() => setAliases((l) => l.filter((x) => x.alias !== a.alias))}>Reject</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
