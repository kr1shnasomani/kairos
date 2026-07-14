import { getBriefs } from "@/lib/api";
import { BriefInbox } from "@/components/brief-inbox";
import { DemoChip } from "@/components/ui";

export const metadata = { title: "Briefs — Kairos" };

export default async function BriefsPage() {
  const { data, source } = await getBriefs();
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">
            Proactive delivery
          </p>
          <h1 className="mt-1 text-display font-semibold leading-tight">Briefs</h1>
          <p className="mt-1.5 text-body text-muted">
            Knowledge delivered at the moment of action — before you had to ask.
          </p>
        </div>
        {source === "demo" && <DemoChip />}
      </header>

      <div className="mt-5">
        <BriefInbox response={data} />
      </div>
    </div>
  );
}
