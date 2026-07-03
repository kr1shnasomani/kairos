import { getBriefs } from "@/lib/api";
import { BriefInbox } from "@/components/brief-inbox";

export const metadata = { title: "Briefs — Kairos" };

export default async function BriefsPage() {
  const { data, source } = await getBriefs();
  const gov = data.governor_state;
  const pct = Math.min(100, Math.round((gov.push_count_last_hour / gov.ceiling) * 100));

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            Proactive delivery
          </p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Briefs</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Knowledge delivered at the moment of action — before you had to ask.
          </p>
        </div>

        {/* EEMUA-191 push governor */}
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              Push governor
            </span>
            <span className="tabular text-[13px] font-semibold">
              {gov.push_count_last_hour}<span className="text-muted">/{gov.ceiling} hr</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: gov.state === "suppressed" ? "var(--danger)" : "var(--verified)",
              }}
            />
          </div>
        </div>
      </header>

      <div className="mt-4 flex items-center gap-3 text-[12px] text-muted">
        <span className="tabular font-medium text-ink">{data.total_pending} pending</span>
        {data.suppressed_count > 0 && <span>· {data.suppressed_count} suppressed</span>}
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px]">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data — backend offline
          </span>
        )}
      </div>

      <div className="mt-5">
        <BriefInbox briefs={data.briefs} />
      </div>
    </div>
  );
}
