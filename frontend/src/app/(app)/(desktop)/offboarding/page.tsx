// Lists offboarding programmes — structured knowledge-transfer sessions for departing experts.
import Link from "next/link";
import { getOffboardingList } from "@/lib/api";
import { PageHeader, StatusBadge } from "@/components/ui";

function progressBar(done: number, total: number) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-label text-muted">
        <span className="tabular">{done} of {total} sessions</span>
        <span className="tabular font-semibold text-ink">{pct}%</span>
      </div>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function emailInitials(email: string) {
  const parts = email.split("@")[0].split(/[^a-z0-9]+/i).filter(Boolean);
  return (parts.length > 1 ? parts.map((part) => part[0]).join("") : parts[0]?.slice(0, 2) || "?").slice(0, 2).toUpperCase();
}

export default async function OffboardingPage() {
  const { data: programmes } = await getOffboardingList();
  const totalSessions = programmes.reduce((sum, programme) => sum + programme.total_sessions, 0);
  const completedSessions = programmes.reduce((sum, programme) => sum + (programme.sessions_completed ?? 0), 0);
  const completedProgrammes = programmes.filter((programme) => programme.total_sessions > 0 && (programme.sessions_completed ?? 0) === programme.total_sessions).length;
  const activeProgrammes = programmes.length - completedProgrammes;

  return (
    <div data-testid="offboarding-workspace" className="mx-auto max-w-[1200px]">
      <PageHeader
        eyebrow="Knowledge transfer"
        title="Expert handovers"
        lede="Structured knowledge transfer for departing experts: graph-derived sessions targeting top failure modes by equipment family."
      />

      <div data-testid="offboarding-summary" className="mt-6 grid overflow-hidden rounded-xl border border-line bg-surface shadow-sm sm:grid-cols-2 lg:grid-cols-[minmax(0,1.25fr)_repeat(3,minmax(130px,0.55fr))]">
        <div className="relative bg-[linear-gradient(120deg,color-mix(in_srgb,var(--info)_7%,var(--surface)),var(--surface))] px-5 py-5 sm:col-span-2 lg:col-span-1">
          <span aria-hidden="true" className="absolute bottom-3 left-2 top-3 w-[3px] rounded-full bg-info" />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-label font-semibold uppercase tracking-[0.1em] text-muted">Handover coverage</p>
          </div>
          <p className="tabular mt-1 text-title font-semibold text-ink">{activeProgrammes} active programmes</p>
          <p className="mt-1 text-label text-muted">Knowledge capture ahead of retirement</p>
        </div>
        <SummaryMetric value={completedProgrammes} label="complete" className="sm:border-r lg:border-l" />
        <SummaryMetric value={totalSessions} label="total sessions" />
        <div className="border-t border-line px-5 py-4 sm:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0">
          <p className="tabular text-title font-semibold text-ink">{completedSessions} of {totalSessions} sessions</p>
          <p className="mt-1 text-label font-medium uppercase tracking-[0.08em] text-muted">captured</p>
        </div>
      </div>

      {programmes.length === 0 ? (
        <div className="mt-10 rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-sm font-semibold">No active programmes</p>
          <p className="mt-1 text-body text-muted">
            Programmes are created when a departing expert is registered with a retirement date.
          </p>
        </div>
      ) : (
        <div data-testid="offboarding-programmes" className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {programmes.map((p) => {
            const done = p.sessions_completed ?? 0;
            const total = p.total_sessions;
            const allDone = total > 0 && done === total;
            return (
              <Link
                key={p.id}
                data-testid={`offboarding-programme-${p.id}`}
                href={`/offboarding/${p.id}`}
                className="group flex min-w-0 flex-col rounded-xl border border-line bg-surface p-5 shadow-sm transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]"
              >
                <div className="flex items-start gap-3">
                  <span className="tabular grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-caption font-bold text-accent">{emailInitials(p.personnel_email)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold text-ink">{p.personnel_email}</p>
                    <p className="mt-0.5 text-label text-muted">
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
                <span className="mt-4 text-caption font-semibold text-accent group-hover:underline">Open handover →</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryMetric({ value, label, className = "" }: { value: number; label: string; className?: string }) {
  return (
    <div className={`border-t border-line px-5 py-4 lg:border-t-0 ${className}`}>
      <p className="tabular text-title font-semibold text-ink">{value}</p>
      <p className="mt-1 text-label font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
    </div>
  );
}
