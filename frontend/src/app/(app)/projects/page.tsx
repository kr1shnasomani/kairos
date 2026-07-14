"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { VaultDocument, AssetSummary, OperationalEvent } from "@/lib/types";
import { getDocuments, getAssets, getEvents } from "@/lib/api";
import { AuthorityBadge, FilterTabs, KpiCard, StatusBadge, EmptyState, DemoChip, PageHeader } from "@/components/ui";
import { triggerLabel, relativeTime } from "@/lib/utils";

const UNCLASSIFIED = "Unclassified";
const FAILURE_TYPES = new Set(["work_order_created", "recurring_failure_detected", "alarm_acknowledged", "equipment_tag_out"]);

interface ClassGroup {
  equipment_class: string;
  assets: AssetSummary[];
  documents: VaultDocument[];
  events: OperationalEvent[];
}

export default function ProjectsPage() {
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [active, setActive] = useState<string>("all");

  useEffect(() => {
    let alive = true;
    Promise.all([getDocuments(), getAssets(), getEvents({ limit: 100 })]).then(([d, a, e]) => {
      if (!alive) return;
      setDocuments(d.data.items);
      setAssets(a.data.items);
      setEvents(e.data.items);
      setIsDemo(d.source === "demo" || a.source === "demo" || e.source === "demo");
    });
    return () => { alive = false; };
  }, []);

  // asset_id -> equipment_class, so documents and events can be bucketed by class.
  const classOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assets) m.set(a.asset_id, a.equipment_class);
    return m;
  }, [assets]);

  const groups = useMemo<ClassGroup[]>(() => {
    const by = new Map<string, ClassGroup>();
    const ensure = (cls: string) =>
      by.get(cls) ?? by.set(cls, { equipment_class: cls, assets: [], documents: [], events: [] }).get(cls)!;
    for (const a of assets) ensure(a.equipment_class).assets.push(a);
    for (const d of documents) {
      const cls = d.asset_links?.map((id) => classOf.get(id)).find(Boolean) ?? UNCLASSIFIED;
      ensure(cls).documents.push(d);
    }
    for (const ev of events) {
      const cls = (ev.asset_id && classOf.get(ev.asset_id)) || UNCLASSIFIED;
      ensure(cls).events.push(ev);
    }
    return Array.from(by.values()).sort((a, b) => b.documents.length - a.documents.length);
  }, [assets, documents, events, classOf]);

  const classNames = groups.map((g) => g.equipment_class);
  const visible = active === "all" ? groups : groups.filter((g) => g.equipment_class === active);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader eyebrow="Project &amp; procurement" title="Engineering registry" lede="Documents, revisions, and failure/maintenance history organised by equipment class — the record a procurement officer needs when evaluating a replacement or a vendor." />

      <div className="mt-3 flex flex-wrap items-center gap-3 text-caption text-muted">
        <span className="tabular font-medium text-ink">{classNames.length} equipment classes · {documents.length} documents</span>
        {isDemo && <DemoChip />}
      </div>

      {classNames.length > 0 && (
        <div className="mt-5">
          <FilterTabs
            tabs={[{ key: "all", label: "All classes" }, ...classNames.map((c) => ({ key: c, label: triggerLabel(c) }))]}
            active={active}
            onChange={setActive}
          />
        </div>
      )}

      <div className="mt-5 space-y-6">
        {visible.length === 0 && <EmptyState message="No registry data yet — ingest documents and assets to populate." action={{ label: "Ingest a document", href: "/documents/ingest" }} />}
        {visible.map((g) => <ClassSection key={g.equipment_class} group={g} />)}
      </div>
    </div>
  );
}

function ClassSection({ group }: { group: ClassGroup }) {
  const failures = group.events.filter((e) => FAILURE_TYPES.has(e.event_type));
  const byType = new Map<string, VaultDocument[]>();
  for (const d of group.documents) {
    const list = byType.get(d.document_type) ?? [];
    list.push(d);
    byType.set(d.document_type, list);
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-subtitle font-semibold">{triggerLabel(group.equipment_class)}</h2>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Assets" value={group.assets.length} />
        <KpiCard label="Documents" value={group.documents.length} />
        <KpiCard label="Failure / maint. events" value={failures.length} tone={failures.length > 0 ? "caution" : "neutral"} />
      </div>

      {/* Document registry grouped by type, with revision chains */}
      <div className="mt-4 space-y-3">
        {Array.from(byType.entries()).map(([type, docs]) => (
          <div key={type}>
            <p className="mb-1.5 text-label font-bold uppercase tracking-[0.1em] text-muted">{triggerLabel(type)}</p>
            <ul className="space-y-1">
              {docs.map((d) => (
                <li key={d.document_id} className="flex flex-wrap items-center gap-2 text-caption">
                  <Link href={`/documents/${d.document_id}`} className="tabular font-medium text-accent underline hover:no-underline">
                    {d.document_id}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-ink">{d.file_name}</span>
                  <span className="text-label text-muted">{d.source_system}</span>
                  <AuthorityBadge level={d.authority_level} />
                  {d.version_chain
                    ? <StatusBadge tone="info" dot={false}>rev</StatusBadge>
                    : null}
                  {d.status === "superseded"
                    ? <StatusBadge tone="caution" dot={false}>superseded</StatusBadge>
                    : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Procurement history — failure / maintenance record for the class */}
      {failures.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-1.5 text-label font-bold uppercase tracking-[0.1em] text-muted">Procurement history</p>
          <ul className="space-y-1">
            {failures.slice(0, 8).map((e) => (
              <li key={e.event_id} className="flex flex-wrap items-center gap-2 text-caption">
                <span className="tabular text-accent">{e.asset_id}</span>
                <span className="text-ink">{triggerLabel(e.event_type)}</span>
                {typeof e.payload?.failure_code === "string" && (
                  <span className="text-muted">{e.payload.failure_code as string}</span>
                )}
                <span className="tabular ml-auto text-label text-muted">{relativeTime(e.occurred_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
