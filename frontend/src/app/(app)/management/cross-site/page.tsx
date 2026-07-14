import Link from "next/link";
import { StatusBadge, DemoChip, PageHeader } from "@/components/ui";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Cross-site alerts — Kairos" };

type AlertSeverity = "caution" | "danger" | "verified";

interface CrossSiteAlert {
  id: string;
  title: string;
  pattern_type: string;
  severity: AlertSeverity;
  sites_affected: string[];
  assets: string[];
  first_seen: string;
  description: string;
}

// No cross-site aggregation API yet — demo fixture until it's implemented.
const FIXTURE: CrossSiteAlert[] = [
  {
    id: "csa-001",
    title: "Seal thermal-cycling pattern",
    pattern_type: "Failure precursor",
    severity: "caution",
    sites_affected: ["Site-Alpha", "Site-Beta", "Site-Gamma"],
    assets: ["P-101", "P-204", "P-311"],
    first_seen: new Date(Date.now() - 5 * 86400000).toISOString(),
    description:
      "Statistical signature of seal failure seen across three sister pumps on different sites. Temperature cycling amplitude exceeds ±8°C threshold over 72-hour windows. Historical baseline: this pattern precedes seal failure by 9–14 days in 4 of 5 prior occurrences.",
  },
  {
    id: "csa-002",
    title: "Feed-water hardness excursions",
    pattern_type: "Chemistry drift",
    severity: "caution",
    sites_affected: ["Site-Alpha", "Site-Delta"],
    assets: ["HX-301", "HX-304", "HX-311"],
    first_seen: new Date(Date.now() - 12 * 86400000).toISOString(),
    description:
      "Feed-water hardness consistently above 180 ppm CaCO₃ at both sites, causing accelerated fouling in the HX-3xx series. Heat transfer efficiency degradation of 11–15% confirmed by inspection records. Root cause suspected: shared upstream softener maintenance schedule.",
  },
  {
    id: "csa-003",
    title: "Vibration drift on centrifugal compressors",
    pattern_type: "Wear indicator",
    severity: "danger",
    sites_affected: ["Site-Beta"],
    assets: ["C-201", "C-203"],
    first_seen: new Date(Date.now() - 2 * 86400000).toISOString(),
    description:
      "Axial vibration on two centrifugal compressors trending toward ISO 10816 Zone C threshold. Vibration amplitude increased 40% over 30 days. Similar pattern preceded bearing failure at Site-Alpha (C-108) in Q3 last year.",
  },
];

const PATTERN_TYPES = Array.from(new Set(FIXTURE.map((a) => a.pattern_type)));

export default function CrossSiteAlertsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/management" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Overview
      </Link>

      <PageHeader className="mt-4" eyebrow="Layer 13 · Cross-site" title="Cross-site pattern alerts" lede="Statistical signatures matched across sites. Pattern detection compares asset telemetry, inspection cadences, and failure histories to surface recurring precursors before they escalate." />

      <div className="mt-4"><DemoChip detail="cross-site aggregation API in roadmap" /></div>

      <div className="mt-4 flex flex-wrap gap-2 text-label text-muted">
        <span>Pattern types:</span>
        {PATTERN_TYPES.map((p) => (
          <span key={p} className="rounded-md border border-line bg-surface-2 px-2 py-0.5">{p}</span>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {FIXTURE.map((a) => (
          <article key={a.id} className="rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="text-sm font-semibold text-ink">{a.title}</h2>
              <StatusBadge tone={a.severity}>{a.severity === "danger" ? "Critical" : "Watch"}</StatusBadge>
              <span className="tabular ml-auto text-label text-muted">{relativeTime(a.first_seen)}</span>
            </div>

            <p className="mt-1 text-label text-muted">{a.pattern_type}</p>

            <p className="mt-2.5 text-body leading-relaxed text-ink">{a.description}</p>

            <div className="mt-3 flex flex-wrap gap-4 text-caption">
              <div>
                <span className="text-muted">Sites: </span>
                <span className="font-medium">{a.sites_affected.join(", ")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-muted">Assets: </span>
                {a.assets.map((asset) => (
                  <Link
                    key={asset}
                    href={`/assets/${asset}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {asset}
                  </Link>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
