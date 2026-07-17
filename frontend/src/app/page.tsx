"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLink } from "@/components/brand-link";
import { getMe } from "@/lib/auth";

const capabilities = [
  ["Trusted answers", "Every operational answer carries its source, authority, and confidence."],
  ["Field-ready", "Give technicians the brief, asset context, and capture tools they need at the point of work."],
  ["Governed intelligence", "Surface risks, conflicts, and knowledge gaps before they become plant-wide problems."],
];

const features = [
  "Evidence-linked copilot",
  "Live asset and document context",
  "Governance and compliance control",
  "Offline field capture",
];

export default function Home() {
  const router = useRouter();

  async function enterWorkspace() {
    const user = await getMe();
    router.push(user?.role === "field_worker" ? "/briefs" : user ? "/management" : "/login");
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-page text-ink">
      <nav className="sticky top-0 z-20 border-b border-line bg-page/90 px-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between">
          <BrandLink />
          <div className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#capabilities" className="transition-colors hover:text-ink">Capabilities</a>
            <a href="#platform" className="transition-colors hover:text-ink">Platform</a>
            <a href="#field" className="transition-colors hover:text-ink">Field work</a>
          </div>
          <Link href="/login" className="rounded-lg border border-line px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-2">
            Sign in
          </Link>
        </div>
      </nav>

      <section className="relative px-4 pb-16 pt-20 sm:px-6 sm:pt-24 lg:pb-24">
        <div aria-hidden="true" className="landing-glow absolute right-[-12rem] top-[-10rem] size-[28rem] rounded-full bg-accent-soft blur-3xl" />
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div className="landing-reveal max-w-2xl">
            <p className="landing-reveal-1 text-sm font-medium text-accent">Operational intelligence, grounded in evidence.</p>
            <h1 className="landing-reveal-2 mt-5 text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl">
              Make plant knowledge usable when the work is happening.
            </h1>
            <p className="landing-reveal-3 mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg">
              Kairos connects trusted documents, asset history, field observations, and governance controls into one operational workspace.
            </p>
            <div className="landing-reveal-4 mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={enterWorkspace} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-transform hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Open workspace
              </button>
              <a href="#platform" className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-2">
                Explore the platform
              </a>
            </div>
          </div>

          <div className="landing-reveal-3 landing-float relative rounded-2xl border border-line bg-surface p-3 shadow-xl">
            <div className="rounded-xl border border-line bg-page p-4 sm:p-5">
              <div className="flex items-center justify-between border-b border-line pb-4 text-xs text-muted">
                <span className="font-semibold text-ink">KAIROS / Briefing</span>
                <span>Verified context</span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-[0.7fr_1fr]">
                <div className="rounded-lg bg-surface-2 p-3">
                  <p className="text-xs text-muted">Workspace state</p>
                  <p className="mt-4 text-lg font-semibold">Live data</p>
                  <p className="mt-1 text-xs text-accent">Per signed-in site</p>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <p className="text-xs font-medium">Current briefing</p>
                  <p className="mt-3 text-sm font-semibold leading-5">Role-specific guidance appears here after sign-in.</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted"><span className="rounded-full bg-surface-2 px-2 py-1">Source-linked</span><span className="rounded-full bg-surface-2 px-2 py-1">Authority shown</span></div>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-line p-3">
                <div className="flex items-center justify-between text-xs"><span className="font-medium">Evidence timeline</span><span className="text-muted">Current</span></div>
                <div className="mt-3 h-2 rounded-full bg-surface-2"><div className="landing-progress h-2 w-3/4 rounded-full bg-accent" /></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="capabilities" className="border-y border-line bg-surface/60 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-medium text-accent">Designed for operational decisions</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">One system for the questions that cannot wait.</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
            {capabilities.map(([title, body]) => <article key={title} className="landing-card bg-page p-6 transition-all duration-200 hover:-translate-y-1 hover:bg-surface-2 hover:shadow-lg"><h3 className="text-base font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-muted">{body}</p></article>)}
          </div>
        </div>
      </section>

      <section aria-labelledby="product-snapshots-title" className="px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-medium text-accent">Inside the workspace</p>
          <h2 id="product-snapshots-title" className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">A clear view for every kind of operational work.</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">The same compact hierarchy carries from supervisory decisions to evidence review and field capture, while each screen keeps the composition its task needs.</p>

          <div data-testid="landing-product-snapshots" className="mt-10 grid items-stretch gap-5 lg:grid-cols-3">
            <article data-testid="product-snapshot-overview" className="landing-card group overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl">
              <div className="h-full rounded-xl border border-line bg-page p-4">
                <div className="flex items-center justify-between border-b border-line pb-3"><span className="text-xs font-semibold">Overview</span><span className="size-2 rounded-full bg-verified" aria-hidden="true" /></div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {["Conflicts", "Quarantine", "Compliance", "Services"].map((label) => <div key={label} className="rounded-lg bg-surface-2 p-2.5"><p className="text-[10px] uppercase tracking-wide text-muted">{label}</p><p className="mt-2 text-base font-semibold text-muted">—</p></div>)}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <div className="rounded-lg border border-line p-3"><p className="text-xs font-semibold">Needs attention</p><div className="mt-3 space-y-2"><span className="block h-2 rounded-full bg-surface-2" /><span className="block h-2 w-3/4 rounded-full bg-surface-2" /></div></div>
                  <div className="rounded-lg border border-line p-3"><p className="text-xs font-semibold">Recent signals</p><div className="mt-3 space-y-2"><span className="block h-2 rounded-full bg-surface-2" /><span className="block h-2 w-2/3 rounded-full bg-surface-2" /></div></div>
                </div>
              </div>
            </article>

            <article data-testid="product-snapshot-copilot" className="landing-card group overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl">
              <div className="flex h-full flex-col rounded-xl border border-line bg-page p-4">
                <div className="flex items-center justify-between border-b border-line pb-3"><span className="text-xs font-semibold">Expert copilot</span><span className="text-[10px] text-muted">Evidence first</span></div>
                <div className="mt-4 self-end rounded-xl rounded-br-sm bg-accent px-3 py-2 text-xs text-on-accent">What changed on this asset?</div>
                <div className="mt-3 rounded-xl rounded-bl-sm border border-line bg-surface p-3">
                  <p className="text-xs font-semibold">Governed answer</p>
                  <div className="mt-2 space-y-2"><span className="block h-2 rounded-full bg-line" /><span className="block h-2 w-5/6 rounded-full bg-line" /><span className="block h-2 w-2/3 rounded-full bg-line" /></div>
                  <div className="mt-3 flex gap-2"><span className="rounded-md bg-accent-soft px-2 py-1 text-[10px] text-accent">Source</span><span className="rounded-md bg-surface-2 px-2 py-1 text-[10px] text-muted">Confidence</span></div>
                </div>
                <div className="mt-auto pt-4"><div className="flex min-h-11 items-center rounded-xl border border-line px-3 text-xs text-muted">Ask governed knowledge…<span className="ml-auto grid size-7 place-items-center rounded-lg bg-accent text-on-accent">↑</span></div></div>
              </div>
            </article>

            <article data-testid="product-snapshot-field" className="landing-card group overflow-hidden rounded-2xl border border-line bg-surface p-3 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl">
              <div className="flex h-full flex-col rounded-xl border border-line bg-page p-4">
                <div className="flex items-center justify-between border-b border-line pb-3"><span className="text-xs font-semibold">Field capture</span><span className="text-[10px] text-muted">Touch first</span></div>
                <div className="mt-4 rounded-lg bg-surface-2 p-3"><p className="text-[10px] uppercase tracking-wide text-muted">Asset or work order</p><p className="mt-2 text-xs font-medium">Tagged at capture</p></div>
                <div className="flex flex-1 flex-col items-center justify-center py-6"><span className="grid size-16 place-items-center rounded-full border-4 border-accent-soft bg-accent text-on-accent shadow-lg"><svg width="20" height="24" viewBox="0 0 20 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="6" y="1" width="8" height="14" rx="4" /><path d="M3 11a7 7 0 0 0 14 0M10 18v5" /></svg></span><p className="mt-3 text-xs font-semibold">Record observation</p><p className="mt-1 text-[10px] text-muted">Routes to engineering review</p></div>
                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] text-muted"><span className="rounded-md bg-surface-2 py-2">Capture</span><span className="rounded-md bg-surface-2 py-2">Transcribe</span><span className="rounded-md bg-surface-2 py-2">Review</span></div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="platform" className="border-t border-line px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1fr] lg:items-center">
          <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <p className="text-sm font-medium text-accent">A connected workspace</p>
            <div className="mt-7 space-y-3">
              {features.map((feature, index) => <div key={feature} className="flex items-center gap-3 rounded-lg border border-line bg-page p-3 transition-transform hover:translate-x-1"><span className="grid size-6 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{index + 1}</span><span className="text-sm font-medium">{feature}</span></div>)}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-accent">Clear, attributable, actionable</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">From a question in the field to a decision with evidence.</h2>
            <p className="mt-5 text-base leading-7 text-muted">Briefs, copilot answers, asset context, and governance signals use the same source-aware language, so teams can move quickly without losing traceability.</p>
          </div>
        </div>
      </section>

      <section id="field" className="px-4 pb-24 sm:px-6 sm:pb-32">
        <div className="mx-auto max-w-6xl rounded-2xl bg-accent px-6 py-14 text-on-accent sm:px-10 sm:py-20">
          <p className="text-sm font-medium opacity-80">Built for the people doing the work</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Give every operational decision a trusted starting point.</h2>
          <button type="button" onClick={enterWorkspace} className="mt-8 rounded-lg bg-page px-4 py-2.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5">
            Open Kairos
          </button>
        </div>
      </section>
    </main>
  );
}
