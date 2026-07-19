import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";

// Authenticated, live-data routes render per request — never statically prerendered
// at build time (no backend then). Required now that fetchers are live-only: a
// server page's throw-on-fallback would otherwise fail the production build's SSG.
export const dynamic = "force-dynamic";

// Longest-prefix map — mirrors PAGE_LABELS in app-shell.tsx.
// Server-side: Next.js uses this to set <title> on SSR/refresh.
// Client-side: AppShell's JSX <title> takes over on navigation.
const ROUTE_LABELS: [string, string][] = [
  ["/briefs", "Briefs"],
  ["/copilot", "Copilot"],
  ["/assets/bootstrap", "Asset Bootstrap"],
  ["/assets", "Assets"],
  ["/events", "Events"],
  ["/rca", "RCA"],
  ["/graph", "Graph"],
  ["/audit", "Audit Trail"],
  ["/projects", "Projects"],
  ["/management/cross-site", "Cross-Site Patterns"],
  ["/management/plant-state", "Plant State"],
  ["/management", "Overview"],
  ["/documents/ingest", "Document Ingest"],
  ["/documents/compare", "Document Compare"],
  ["/documents", "Documents"],
  ["/offboarding", "Off-Boarding"],
  ["/settings", "System Settings"],
  ["/system-health", "System Health"],
  ["/system-information", "System Information"],
  ["/field/voice", "Voice Note"],
  ["/field/deviation", "Deviation Flag"],
  ["/field/elicitation", "Knowledge Capture"],
  ["/compliance/audit-pack", "Audit Pack"],
  ["/compliance/nonconformance", "Non-Conformances"],
  ["/compliance", "Compliance"],
  ["/governance/conflicts", "Conflicts"],
  ["/governance/quarantine", "Quarantine"],
  ["/governance/moc", "Management of Change"],
  ["/governance/sla", "SLA Report"],
  ["/governance/circuit-breaker", "Circuit Breaker"],
  ["/governance/model-gate", "Model Gate"],
  ["/governance", "Governance"],
];

export async function generateMetadata(): Promise<Metadata> {
  const { headers } = await import("next/headers");
  const heads = await headers();
  const pathname = heads.get("x-pathname") ?? "";
  const label = ROUTE_LABELS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"),
  )?.[1];
  return { title: label ? `Kairos: ${label}` : "Kairos" };
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
