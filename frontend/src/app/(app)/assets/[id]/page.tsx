import Link from "next/link";
import { notFound } from "next/navigation";
import { getAsset } from "@/lib/assets";
import { AuthorityBadge, SourceChip, StatusBadge } from "@/components/ui";

const CRIT_TONE = { high: "danger", medium: "caution", low: "verified" } as const;
const VERIF_TONE = { verified: "verified", unverified: "caution", disputed: "danger" } as const;

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = getAsset(id);
  if (!a) notFound();

  const stats = [
    { label: "Open work orders", value: a.open_work_orders },
    { label: "Compliance gaps", value: a.compliance_gaps },
    { label: "Last inspection", value: a.last_inspection },
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/assets" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Assets
      </Link>

      <header className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="tabular text-[26px] font-semibold text-accent">{a.asset_id}</h1>
        <span className="text-[16px]">{a.name}</span>
        <StatusBadge tone={CRIT_TONE[a.criticality]}>{a.criticality} criticality</StatusBadge>
      </header>
      <p className="mt-1.5 text-[13px] text-muted">
        {a.equipment_class}{a.parent && <> · {a.parent}</>}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface p-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">{s.label}</p>
            <p className="tabular mt-1.5 text-[20px] font-semibold leading-none">{s.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Tag aliases</h2>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {a.aliases.map((al) => (
            <span key={al} className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] text-muted">{al}</span>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Knowledge</h2>
        <div className="mt-3 space-y-2.5">
          {a.knowledge.map((k) => (
            <article key={k.source_doc} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[13.5px] leading-relaxed text-ink">{k.claim}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <AuthorityBadge level={k.authority_level} />
                <StatusBadge tone={VERIF_TONE[k.verification]}>{k.verification}</StatusBadge>
                <SourceChip quarantine={k.verification !== "verified"}>{k.source_doc}</SourceChip>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
