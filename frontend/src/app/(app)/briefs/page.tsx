// Briefs inbox — proactive knowledge briefs delivered at the moment of action.
import { getBriefs } from "@/lib/api";
import { BriefInbox } from "@/components/brief-inbox";
import { DemoChip, PageHeader } from "@/components/ui";

export const metadata = { title: "Briefs — Kairos" };

export default async function BriefsPage() {
  const { data, source } = await getBriefs();
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        eyebrow="Proactive delivery"
        title="Briefs"
        lede="Knowledge delivered at the moment of action, before you had to ask."
        actions={source === "demo" && <DemoChip />}
      />

      <div className="mt-6">
        <BriefInbox response={data} />
      </div>
    </div>
  );
}
