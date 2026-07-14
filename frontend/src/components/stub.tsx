/** On-theme placeholder for screens that are navigable but not yet built deep. */
export function Stub({
  eyebrow,
  title,
  description,
  endpoints,
}: {
  eyebrow: string;
  title: string;
  description: string;
  endpoints?: string[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">{eyebrow}</p>
      <h1 className="mt-1 text-display font-semibold leading-tight">{title}</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{description}</p>

      <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-6">
        <div className="flex items-center gap-2 text-body font-semibold text-ink">
          <span className="size-2 rounded-full bg-caution" aria-hidden="true" />
          In this build
        </div>
        <p className="mt-1.5 text-body text-muted">
          This surface is wired into the shell and will render live once its components are built.
        </p>
        {endpoints && endpoints.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {endpoints.map((e) => (
              <span
                key={e}
                className="tabular rounded-md border border-line bg-surface-2 px-2 py-1 text-label text-muted"
              >
                {e}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
