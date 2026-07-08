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
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            Proactive delivery
          </p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight">Briefs</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">
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
