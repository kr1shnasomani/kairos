import Link from "next/link";
import { PageHeader } from "@/components/ui";

// Cross-site pattern detection needs ≥2 facilities on the control plane. This is a
// single-site deployment, so there is genuinely nothing to correlate — we show an
// honest "unavailable" state rather than fabricated alerts.
export default function CrossSiteAlertsPage() {
  return (
    <div data-testid="cross-site-workspace" className="mx-auto max-w-[1400px]">
      <Link href="/management" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Overview
      </Link>

      <PageHeader
        className="mt-4"
        eyebrow="Multi-site · Control plane"
        title="Cross-site pattern alerts"
        lede="Statistical signatures matched across sites — recurring failure precursors surfaced before they escalate."
      />

      <div data-testid="cross-site-unavailable" className="mt-6 rounded-xl border border-line bg-surface p-10 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
          </svg>
        </div>
        <h2 className="mt-4 text-title font-semibold text-ink">No cross-site data in this deployment</h2>
        <p className="mx-auto mt-2 max-w-xl text-body leading-relaxed text-muted">
          Cross-site pattern detection compares telemetry, inspection cadences, and failure histories across
          multiple facilities. This is a single-site deployment, so there is nothing to correlate yet. When a
          second site is connected to the control plane, matched precursors will appear here — each attributed to
          its originating site.
        </p>
      </div>
    </div>
  );
}
