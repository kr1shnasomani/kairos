// Briefs inbox — proactive knowledge briefs delivered at the moment of action.
import { getBriefs } from "@/lib/api";
import { BriefInbox } from "@/components/brief-inbox";
import { PageHeader } from "@/components/ui";

export default async function BriefsPage() {
  const { data, source } = await getBriefs();
  // Live-only: never render fixture briefs.
  if (source === "demo") throw new Error("Briefs: live data unavailable");
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        eyebrow="Proactive delivery"
        title="Briefs"
        lede="Knowledge delivered at the moment of action, before you had to ask."
      />

      <div className="mt-6">
        <BriefInbox response={data} />
      </div>
    </div>
  );
}
