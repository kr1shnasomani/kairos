import Link from "next/link";
import { StatusBadge, DemoChip, PageHeader } from "@/components/ui";
import { nowMs, relativeTime } from "@/lib/utils";

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
    first_seen: new Date(nowMs() - 5 * 86400000).toISOString(),
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
    first_seen: new Date(nowMs() - 12 * 86400000).toISOString(),
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
    first_seen: new Date(nowMs() - 2 * 86400000).toISOString(),
    description:
      "Axial vibration on two centrifugal compressors trending toward ISO 10816 Zone C threshold. Vibration amplitude increased 40% over 30 days. Similar pattern preceded bearing failure at Site-Alpha (C-108) in Q3 last year.",
  },
];

const PATTERN_TYPES = Array.from(new Set(FIXTURE.map((a) => a.pattern_type)));
const SITE_COUNT = new Set(FIXTURE.flatMap((alert) => alert.sites_affected)).size;
const ASSET_COUNT = new Set(FIXTURE.flatMap((alert) => alert.assets)).size;

export default function CrossSiteAlertsPage() {
  return (
    <div data-testid="cross-site-workspace" className="mx-auto max-w-[1400px]">
      <Link href="/management" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Overview
      </Link>

      <PageHeader className="mt-4" eyebrow="Layer 13 · Cross-site" title="Cross-site pattern alerts" lede="Statistical signatures matched across sites. Pattern detection compares asset telemetry, inspection cadences, and failure histories to surface recurring precursors before they escalate." />

      <div className="mt-4"><DemoChip detail="cross-site aggregation API in roadmap" /></div>

      <div data-testid="cross-site-summary" className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Pattern alerts", FIXTURE.length],
          ["Sites represented", SITE_COUNT],
          ["Assets represented", ASSET_COUNT],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <p className="text-micro font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
            <p className="tabular mt-2 text-display font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div data-testid="cross-site-layout" className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <main data-testid="cross-site-register" className="grid min-w-0 gap-4 sm:grid-cols-2">
        {FIXTURE.map((a) => (
          <article key={a.id} className="flex flex-col rounded-xl border border-line bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--line))] hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="text-sm font-semibold text-ink">{a.title}</h2>
              <StatusBadge tone={a.severity}>{a.severity === "danger" ? "Critical" : "Watch"}</StatusBadge>
              <span className="tabular ml-auto text-label text-muted">{relativeTime(a.first_seen)}</span>
            </div>

            <p className="mt-1 text-label text-muted">{a.pattern_type}</p>

            <p className="mt-2.5 text-body leading-relaxed text-ink">{a.description}</p>

            <div className="mt-auto pt-3">
              <p className="text-caption text-muted">
                <b className="tabular text-ink">{a.assets.length}</b> matched {a.assets.length === 1 ? "asset" : "assets"} across{" "}
                <b className="tabular text-ink">{a.sites_affected.length}</b> {a.sites_affected.length === 1 ? "site" : "sites"} — {a.sites_affected.join(", ")}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Matched assets">
                {a.assets.map((asset) => (
                  <Link
                    key={asset}
                    href={`/assets/${asset}`}
                    className="tabular inline-flex min-h-11 items-center rounded-full border border-line bg-surface-2 px-3 text-label font-medium text-accent transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:underline"
                  >
                    {asset}
                  </Link>
                ))}
              </div>
            </div>
          </article>
        ))}
      </main>

      <aside data-testid="cross-site-context" className="rounded-xl border border-line bg-surface p-4 shadow-sm lg:sticky lg:top-20">
        <h2 className="text-title font-semibold">How to read these signals</h2>
        <p className="mt-2 text-caption leading-relaxed text-muted">Patterns indicate statistically similar conditions across assets or sites. They are prompts for investigation, not confirmed root causes.</p>
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-label font-bold uppercase tracking-[0.1em] text-muted">Pattern types</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PATTERN_TYPES.map((pattern) => <span key={pattern} className="rounded-md border border-line bg-surface-2 px-2 py-1 text-label text-muted">{pattern}</span>)}
          </div>
        </div>
        <p className="mt-4 border-t border-line pt-4 text-caption text-muted">This screen uses demo records until the cross-site aggregation endpoint is available.</p>
      </aside>
      </div>
    </div>
  );
}
