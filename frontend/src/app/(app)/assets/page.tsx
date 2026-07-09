import Link from "next/link";
import { getAssets } from "@/lib/api";

export const metadata = { title: "Assets — Kairos" };

const CRIT: Record<string, { label: string; color: string }> = {
  safety_critical: { label: "Safety-critical", color: "var(--danger)" },
  critical: { label: "Critical", color: "var(--caution)" },
  non_critical: { label: "Non-critical", color: "var(--muted)" },
};

function crit(c: string) {
  return CRIT[c] ?? { label: c, color: "var(--muted)" };
}

export default async function AssetsPage() {
  const { data, source } = await getAssets();

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Asset-centric truth</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Assets</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">Every piece of knowledge orbits a canonical asset.</p>
        </div>
        <Link
          href="/assets/bootstrap"
          className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2"
        >
          Identity confirmation
        </Link>
      </header>

      <div className="mt-3 flex items-center gap-3 text-[12px] text-muted">
        <span className="tabular font-medium text-ink">{data.total} registered</span>
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data — backend offline
          </span>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        {data.items.map((a, i) => {
          const c = crit(a.criticality);
          return (
            <Link key={a.asset_id} href={`/assets/${a.asset_id}`}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2 ${i > 0 ? "border-t border-line" : ""}`}>
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                <span className="tabular text-[13px] font-semibold text-accent">{a.asset_id}</span>
              </span>
              <span className="text-[13.5px]">{a.name}</span>
              <span className="text-[12px] text-muted">{a.equipment_class}</span>
              <span className="tabular ml-auto text-[11px] text-muted" style={{ color: c.color }}>{c.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
