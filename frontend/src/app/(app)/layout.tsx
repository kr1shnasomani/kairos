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
  ["/assets/bootstrap", "Asset bootstrap"],
  ["/assets", "Assets"],
  ["/events", "Events"],
  ["/rca", "RCA"],
  ["/graph", "Graph"],
  ["/audit", "Audit trail"],
  ["/projects", "Projects"],
  ["/management/cross-site", "Cross-site patterns"],
  ["/management/plant-state", "Plant state"],
  ["/management", "Overview"],
  ["/documents/ingest", "Document ingest"],
  ["/documents/compare", "Document compare"],
  ["/documents", "Documents"],
  ["/offboarding", "Off-boarding"],
  ["/settings", "System settings"],
  ["/system-health", "System health"],
  ["/system-information", "System information"],
  ["/field/voice", "Voice note"],
  ["/field/deviation", "Deviation flag"],
  ["/field/elicitation", "Knowledge capture"],
  ["/compliance/audit-pack", "Audit pack"],
  ["/compliance/nonconformance", "Non-conformances"],
  ["/compliance", "Compliance"],
  ["/governance/conflicts", "Conflicts"],
  ["/governance/quarantine", "Quarantine"],
  ["/governance/moc", "Management of Change"],
  ["/governance/sla", "SLA report"],
  ["/governance/circuit-breaker", "Circuit breaker"],
  ["/governance/model-gate", "Model gate"],
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
