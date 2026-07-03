import Link from "next/link";
import { assets } from "@/lib/assets";

export const metadata = { title: "Assets — Kairos" };

const CRIT_COLOR = { high: "var(--danger)", medium: "var(--caution)", low: "var(--muted)" } as const;

export default function AssetsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Asset-centric truth</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Assets</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">Every piece of knowledge orbits a canonical asset.</p>
      </header>

      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        {assets.map((a, i) => (
          <Link key={a.asset_id} href={`/assets/${a.asset_id}`}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2 ${i > 0 ? "border-t border-line" : ""}`}>
            <span className="inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full" style={{ background: CRIT_COLOR[a.criticality] }} aria-hidden="true" />
              <span className="tabular text-[13px] font-semibold text-accent">{a.asset_id}</span>
            </span>
            <span className="text-[13.5px]">{a.name}</span>
            <span className="text-[12px] text-muted">{a.equipment_class}</span>
            <span className="tabular ml-auto text-[11.5px] text-muted">{a.open_work_orders} WO · {a.compliance_gaps} gaps</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
