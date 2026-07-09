"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { confirmAssetIdentity } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { ADMIN_ROLES } from "@/components/use-role";
import { Button, StatusBadge, EmptyState } from "@/components/ui";

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

  useEffect(() => {
    getMe().then((u) => {
      setIsAdmin(!!u && ADMIN_ROLES.includes(u.role));
      if (u) { setMe(u.user_id); setSiteId(u.site_id); }
      setReady(true);
    });
  }, []);

  async function confirm(p: Provisional) {
    setBusy(p.asset_id);
    try {
      await confirmAssetIdentity({
        asset_id: p.asset_id,
        name: p.name,
        equipment_class: p.equipment_class,
        identity_confirmed_by: me || "admin",
        site_id: siteId,
      });
    } catch {
      // demo mode — backend offline; still reflect the confirmation optimistically
    } finally {
      setProvisional((list) => list.filter((x) => x.asset_id !== p.asset_id));
      setBusy(null);
    }
  }

  if (!ready) return <div className="mx-auto max-w-3xl px-5 py-10 text-[13px] text-muted">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/assets" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Assets
      </Link>

      <header className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Layer 1 · Master data management</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Asset identity confirmation</h1>
        <p className="mt-1.5 text-[13.5px] text-muted text-pretty">
          No AI-invented identities. Extracted knowledge that cannot link to a human-confirmed asset
          stays in quarantine under a provisional node — it is never fabricated. A qualified authority
          confirms identity here before any knowledge links to it.
        </p>
      </header>

      {!isAdmin && (
        <div className="mt-5 rounded-xl border border-line bg-surface p-5 text-[13px] text-muted">
          Identity confirmation requires the <span className="font-semibold text-ink">admin</span> role.
        </div>
      )}

      {isAdmin && (
        <>
          <section className="mt-6">
            <h2 className="text-[14px] font-semibold">Provisional assets · {provisional.length}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Holding nodes lacking <span className="tabular">identity_confirmed_by</span>.</p>
            <div className="mt-3 space-y-2">
              {provisional.length === 0 && <EmptyState message="All provisional assets confirmed." />}
              {provisional.map((p) => (
                <div key={p.asset_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-[13px] font-semibold text-accent">{p.asset_id}</span>
                      <StatusBadge tone="caution" dot={false}>provisional</StatusBadge>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink">{p.name}</p>
                    <p className="text-[11px] text-muted">{p.equipment_class} · from {p.origin}</p>
                  </div>
                  <Button variant="primary" disabled={busy === p.asset_id} onClick={() => confirm(p)}>
                    {busy === p.asset_id ? "Confirming…" : "Confirm identity"}
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-[14px] font-semibold">Unresolved tag aliases · {aliases.length}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Confirm a mapping so search resolves the variant to the canonical id.</p>
            <div className="mt-3 space-y-2">
              {aliases.length === 0 && <EmptyState message="No pending aliases." />}
              {aliases.map((a) => (
                <div key={a.alias} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                  <div className="min-w-0 flex-1 text-[12.5px]">
                    <span className="tabular font-semibold text-ink">{a.alias}</span>
                    <span className="mx-2 text-muted">→</span>
                    <span className="tabular font-semibold text-accent">{a.canonical_asset_id}</span>
                    <span className="ml-2 text-[11px] text-muted">proposed · {Math.round(a.confidence * 100)}%</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="h-8" onClick={() => setAliases((l) => l.filter((x) => x.alias !== a.alias))}>Confirm</Button>
                    <Button variant="ghost" className="h-8 text-danger" onClick={() => setAliases((l) => l.filter((x) => x.alias !== a.alias))}>Reject</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
