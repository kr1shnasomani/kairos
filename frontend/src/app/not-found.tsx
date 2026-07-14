import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-accent" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path d="M4 15.5 L9 20 L22 5" stroke="var(--on-accent)" strokeWidth="3.4" strokeLinecap="square" />
            <path d="M13 20 L18.5 8 L21.5 20 Z" fill="var(--on-accent)" />
          </svg>
        </span>
        <p className="tabular mt-5 text-body font-semibold text-muted">404</p>
        <h1 className="mt-1 text-display font-semibold">Page not found</h1>
        <p className="mt-1.5 text-body leading-relaxed text-muted">
          That screen doesn&rsquo;t exist. It may have moved, or the link is out of date.
        </p>
        <Link
          href="/briefs"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-ink px-4 text-body font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          Back to briefs
        </Link>
      </div>
    </main>
  );
}
