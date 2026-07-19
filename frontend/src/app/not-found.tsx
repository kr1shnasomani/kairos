import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm text-center">
        {/* Plain <img>, not next/image — the root not-found renders inside the
            _global-error boundary at build time, where <Image>'s config context is null. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Kairos" width={48} height={48} className="mx-auto size-12 rounded-xl object-cover" />
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
