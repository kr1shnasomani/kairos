import Link from "next/link";
import { getAssets } from "@/lib/api";
import { DemoChip, EmptyState } from "@/components/ui";
import { criticalityMeta } from "@/lib/utils";

export const metadata = { title: "Assets — Kairos" };

export default async function AssetsPage() {
  const { data, source } = await getAssets();

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">Asset-centric truth</p>
          <h1 className="mt-1 text-display font-semibold leading-tight">Assets</h1>
          <p className="mt-1.5 text-body text-muted">Every piece of knowledge orbits a canonical asset.</p>
        </div>
        <Link
          href="/assets/bootstrap"
          className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-body font-semibold text-ink transition-colors hover:bg-surface-2"
        >
          Identity confirmation
        </Link>
      </header>

      <div className="mt-3 flex items-center gap-3 text-caption text-muted">
        <span className="tabular font-medium text-ink">{data.total} registered</span>
        {source === "demo" && <DemoChip detail="backend offline" />}
      </div>

      {data.items.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="No assets registered yet." action={{ label: "Bootstrap assets", href: "/assets/bootstrap" }} />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          {data.items.map((a, i) => {
            const c = criticalityMeta(a.criticality);
            return (
              <Link key={a.asset_id} href={`/assets/${a.asset_id}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2 ${i > 0 ? "border-t border-line" : ""}`}>
                <span className="inline-flex shrink-0 items-center gap-2">
                  <span className="size-1.5 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                  <span className="tabular text-body font-semibold text-accent">{a.asset_id}</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-body">{a.name}</span>
                <span className="shrink-0 text-caption text-muted">{a.equipment_class}</span>
                <span className="tabular ml-auto shrink-0 text-label" style={{ color: c.color }}>{c.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
