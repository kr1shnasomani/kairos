import { Stub } from "@/components/stub";

export const metadata = { title: "Governance — Kairos" };

export default function GovernancePage() {
  return (
    <Stub
      eyebrow="Dual-track governance"
      title="Governance"
      description="Knowledge conflicts, quarantine review and promotion, blast-radius analysis, Management of Change, and SLA tracking."
      endpoints={["GET /governance/conflicts", "/quarantine", "/moc", "/sla-report"]}
    />
  );
}
