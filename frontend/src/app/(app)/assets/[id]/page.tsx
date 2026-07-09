import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetDetail } from "@/lib/api";
import { AuthorityBadge, SourceChip, StatusBadge } from "@/components/ui";
// React Flow must not SSR — imported from the client-only lazy module.
import { KnowledgeGraph } from "@/components/lazy";

const VERIF_TONE = { verified: "verified", unverified: "caution", disputed: "danger" } as const;

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: a, source } = await getAssetDetail(id);
  if (!a) notFound();

  const stats = [
    { label: "Open work orders", value: a.open_work_orders ?? "—" },
    { label: "Compliance gaps", value: a.compliance_gaps ?? "—" },
    { label: "Last inspection", value: a.last_inspection ?? "—" },
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
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: a.criticalityColor }}>
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          {a.criticalityLabel}
        </span>
        {source === "demo" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
            <span className="size-1.5 rounded-full bg-caution" aria-hidden="true" />
            Demo data
          </span>
        )}
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

      {a.aliases.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Tag aliases</h2>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {a.aliases.map((al) => (
              <span key={al} className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] text-muted">{al}</span>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Knowledge</h2>
        <div className="mt-3 space-y-2.5">
          {a.knowledge.length === 0 && (
            <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-[13px] text-muted">
              No knowledge edges recorded for this asset yet.
            </p>
          )}
          {a.knowledge.map((k, i) => (
            <article key={`${k.source_doc}-${i}`} className="rounded-xl border border-line bg-surface p-4">
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

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
            Knowledge graph
          </h2>
          <Link
            href={`/graph?asset=${a.asset_id}`}
            className="text-[12px] text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Open full graph →
          </Link>
        </div>
        <KnowledgeGraph assetId={a.asset_id} height={340} />
      </section>
    </div>
  );
}
