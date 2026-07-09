import Link from "next/link";

export const metadata = { title: "Governance — Kairos" };

const SURFACES = [
  {
    href: "/governance/conflicts",
    title: "Conflicts",
    live: true,
    desc: "Dual-track adjudication of contradictory facts. Administrative conflicts resolve in-app; engineering conflicts require Management of Change.",
  },
  {
    href: "/governance/quarantine",
    title: "Quarantine",
    live: true,
    desc: "Unverified field inputs awaiting human review. Promote to the canonical graph or dispute — a one-way gate, never auto-promoted.",
  },
  {
    href: "/governance/moc",
    title: "Management of Change",
    live: true,
    desc: "Auto-drafted EWR items for engineering-track conflicts. Engineer sign-off closes the old edge and clears downstream warning banners.",
  },
  {
    href: "/governance/sla",
    title: "SLA report",
    live: true,
    desc: "Governance SLA state across conflicts and quarantine. Overdue items with countdown timers, escalation flags, and on-time metrics.",
  },
  {
    href: "/governance/circuit-breaker",
    title: "Circuit breaker",
    live: true,
    desc: "SPC governor state by asset class. Z-score anomaly gates halt ingestion until admin review or human-verified resolution.",
  },
  {
    href: "/governance/model-gate",
    title: "Model gate",
    live: true,
    desc: "Precision / recall gate against the validation corpus. Failed runs block model promotion. Trigger manual runs or inspect history.",
  },
];

export default function GovernancePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Dual-track governance</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">Governance</h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
          The adjudication plane: where contradictions surface, unverified inputs are gated, and human
          authority decides what becomes canonical truth.
        </p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {SURFACES.map((s) => (
          <Link key={s.href} href={s.href}
            className="group rounded-xl border border-line bg-surface p-5 transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold">{s.title}</h2>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-verified">
                <span className="size-1.5 rounded-full bg-verified" aria-hidden="true" />Live
              </span>
              <svg className="ml-auto size-4 text-muted transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
