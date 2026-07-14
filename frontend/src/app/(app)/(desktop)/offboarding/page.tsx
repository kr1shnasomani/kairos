import Link from "next/link";
import { getOffboardingList } from "@/lib/api";
import { DemoChip, StatusBadge } from "@/components/ui";

export const metadata = { title: "Offboarding programmes — Kairos" };

function progressBar(done: number, total: number) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular shrink-0 text-label text-muted">
        {done}/{total}
      </span>
    </div>
  );
}

export default async function OffboardingPage() {
  const { data: programmes, source } = await getOffboardingList();

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">
            Knowledge transfer
          </p>
          <h1 className="mt-1 text-display font-semibold leading-tight">
            Offboarding programmes
          </h1>
          <p className="mt-1.5 text-body text-muted">
            Structured knowledge transfer for departing experts — graph-derived sessions targeting
            top failure modes by equipment family.
          </p>
        </div>
        {source === "demo" && <DemoChip />}
      </header>

      {programmes.length === 0 ? (
        <div className="mt-10 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-sm font-semibold">No active programmes</p>
          <p className="mt-1 text-body text-muted">
            Programmes are created when a departing expert is registered with a retirement date.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {programmes.map((p) => {
            const done = p.sessions_completed ?? 0;
            const total = p.total_sessions;
            const allDone = total > 0 && done === total;
            return (
              <Link
                key={p.id}
                href={`/offboarding/${p.id}`}
                className="group flex flex-col gap-1 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-subtitle font-semibold">{p.personnel_email}</p>
                    <p className="mt-0.5 text-caption text-muted">
                      Retires{" "}
                      {new Date(p.retirement_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  {allDone ? (
                    <StatusBadge tone="verified">Complete</StatusBadge>
                  ) : (
                    <StatusBadge tone="info">In progress</StatusBadge>
                  )}
                </div>
                {progressBar(done, total)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
