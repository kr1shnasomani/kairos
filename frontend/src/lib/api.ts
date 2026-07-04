import type {
  Brief,
  BriefsResponse,
  ComplianceGapsResponse,
  AssetsResponse,
  ConflictsResponse,
  QuarantineResponse,
  PromoteQuarantineRequest,
  RcaPack,
  DocumentsResponse,
  VaultDocument,
  AssetDetail,
  AssetAlias,
  AssetKnowledgeResponse,
  AuthorityLevel,
} from "./types";
import { fixtureBriefs } from "./fixtures";
import { complianceFixture } from "./compliance";
import { assets as fixtureAssets, getAsset as getAssetFixture, type KnowledgeEdge } from "./assets";
import { conflictsFixture, quarantineFixture } from "./governance";
import { documentsFixture, getDocumentFixture } from "./documents";
import { answerFor, type CopilotAnswer } from "./copilot";
import { rcaFor } from "./rca";
import { criticalityMeta } from "./utils";

// Live in dev mode: no Authorization header → backend treats the caller as
// dev-user / engineer (docs/API.md §Auth). When the backend is unreachable we
// fall back to fixtures so the UI is always demoable.

// Server components run inside the container — use the internal Docker hostname.
// Browser clients use the public URL (host port-mapped).
export const API_BASE =
  typeof window === "undefined"
    ? (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000");

const TOKEN_KEY = "kairos-token";

/** Client-side bearer token (set at login). Server reads use the dev-mode bypass. */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Authenticated write from the browser. Returns parsed JSON or throws on non-2xx. */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function ackBrief(briefId: string, body: { signature?: string; notes?: string }) {
  return postJson<{ ack_status: string }>(`/briefs/${briefId}/ack`, { user_id: "dev-user", ...body });
}

export function sendBriefFeedback(briefId: string, rating: string, notes?: string) {
  return postJson<{ feedback_recorded: boolean }>(`/briefs/${briefId}/feedback`, { rating, notes });
}

export type DataSource = "live" | "demo";

export interface Fetched<T> {
  data: T;
  source: DataSource;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    // fail fast so a down/hanging backend falls back to fixtures quickly (refused = instant already)
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function getBriefs(): Promise<Fetched<BriefsResponse>> {
  try {
    const data = await getJson<BriefsResponse>("/briefs/?unacknowledged_only=false&limit=20");
    // Governor suppression / empty backend → show the curated story instead of a blank inbox.
    if (!data.briefs || data.briefs.length === 0) return { data: fixtureBriefs, source: "demo" };
    return { data, source: "live" };
  } catch {
    return { data: fixtureBriefs, source: "demo" };
  }
}

export async function getBrief(briefId: string): Promise<Fetched<Brief | null>> {
  try {
    const data = await getJson<Brief>(`/briefs/${briefId}`);
    return { data, source: "live" };
  } catch {
    const found = fixtureBriefs.briefs.find((b) => b.brief_id === briefId) ?? null;
    return { data: found, source: "demo" };
  }
}

// --- Compliance ---
export async function getComplianceGaps(framework?: string): Promise<Fetched<ComplianceGapsResponse>> {
  try {
    const qs = framework && framework !== "All" ? `?framework=${encodeURIComponent(framework)}` : "";
    const data = await getJson<ComplianceGapsResponse>(`/compliance/gaps${qs}`);
    // Empty live gaps → show the curated story (demo-primary), matching getAssets/getBriefs.
    if (!data.items || data.items.length === 0) throw new Error("empty");
    return { data, source: "live" };
  } catch {
    return { data: complianceFixture, source: "demo" };
  }
}

// --- Assets ---
// Fixture assets carry a richer shape; project them onto the live list envelope.
const FIXTURE_CRIT: Record<string, string> = { high: "safety_critical", medium: "critical", low: "non_critical" };

export async function getAssets(): Promise<Fetched<AssetsResponse>> {
  try {
    const data = await getJson<AssetsResponse>("/assets/?limit=100");
    if (!data.items || data.items.length === 0) throw new Error("empty");
    return { data, source: "live" };
  } catch {
    const demo: AssetsResponse = {
      items: fixtureAssets.map((a) => ({
        asset_id: a.asset_id,
        name: a.name,
        equipment_class: a.equipment_class,
        criticality: FIXTURE_CRIT[a.criticality] ?? a.criticality,
      })),
      total: fixtureAssets.length,
      limit: 100,
      offset: 0,
    };
    return { data: demo, source: "demo" };
  }
}

// --- Governance: conflicts + quarantine ---
export async function getConflicts(): Promise<Fetched<ConflictsResponse>> {
  try {
    const data = await getJson<ConflictsResponse>("/governance/conflicts?limit=50");
    if (!data.items) throw new Error("no items");
    return { data, source: "live" };
  } catch {
    return { data: conflictsFixture, source: "demo" };
  }
}

export async function getQuarantine(): Promise<Fetched<QuarantineResponse>> {
  try {
    const data = await getJson<QuarantineResponse>("/governance/quarantine?limit=50");
    if (!data.items) throw new Error("no items");
    return { data, source: "live" };
  } catch {
    return { data: quarantineFixture, source: "demo" };
  }
}

export function resolveConflict(conflictId: string, resolution: { note?: string; decision?: string }) {
  return postJson<{ status: string; conflict_id: string }>(
    `/governance/conflicts/${conflictId}/resolve`,
    resolution,
  );
}

export function promoteQuarantine(itemId: string, body: PromoteQuarantineRequest) {
  return postJson<{ status: string; item_id: string; edge_id: string; conflict_detected: boolean }>(
    `/governance/quarantine/${itemId}/promote`,
    body,
  );
}

export function disputeQuarantine(itemId: string, reason: string) {
  return postJson<{ status: string; item_id: string }>(
    `/governance/quarantine/${itemId}/dispute`,
    { reason },
  );
}

// --- Copilot (POST /search/synthesize) + RCA (POST /search/rca-pack) ---
// Both are read-oriented POSTs. Live first, fixture on any error (backend down / refusal path).

export async function synthesize(query: string): Promise<CopilotAnswer> {
  try {
    const live = await postJson<{
      answer: string | null;
      sources: { document_id: string; authority_level: number }[];
      confidence: number;
      refused: boolean;
      refusal_reason?: string;
      safety_critical: boolean;
      model?: string;
    }>("/search/synthesize", { query });
    // KB unseeded → live answers null/empty with no refusal. Don't render a blank bubble;
    // fall back to the curated answer (demo-primary). A genuine safety refusal is kept.
    if (!live.refused && !live.answer?.trim()) return answerFor(query);
    return {
      answer: live.answer,
      sources: (live.sources ?? []).map((s) => ({
        document_id: s.document_id,
        title: s.document_id,
        authority_level: (s.authority_level as CopilotAnswer["sources"][number]["authority_level"]) ?? 5,
        excerpt: "",
      })),
      confidence: live.confidence ?? 0,
      refused: !!live.refused,
      refusal_reason: live.refusal_reason,
      safety_critical: !!live.safety_critical,
      model: live.model,
    };
  } catch {
    return answerFor(query);
  }
}

export async function getRcaPack(assetId: string, failureCode: string): Promise<RcaPack> {
  try {
    const live = await postJson<Partial<RcaPack>>("/search/rca-pack", {
      asset_id: assetId,
      failure_code: failureCode,
      incident_date: new Date().toISOString(),
    });
    if (!live.timeline) throw new Error("no timeline");
    return {
      asset_id: assetId,
      incident_date: live.incident_date ?? new Date().toISOString(),
      failure_code: failureCode,
      timeline: live.timeline ?? [],
      hypotheses: live.hypotheses ?? [],
      supporting_documents: live.supporting_documents ?? [],
      confidence: live.confidence ?? 0,
      refused: !!live.refused,
      synthesis_available: !!live.synthesis_available,
    };
  } catch {
    return rcaFor(assetId, failureCode);
  }
}

// --- Documents (GET /documents/, /documents/{id}) ---
export async function getDocuments(): Promise<Fetched<DocumentsResponse>> {
  try {
    const data = await getJson<DocumentsResponse>("/documents/?limit=50");
    if (!data.items || data.items.length === 0) throw new Error("empty");
    return { data, source: "live" };
  } catch {
    return { data: documentsFixture, source: "demo" };
  }
}

export async function getDocument(documentId: string): Promise<Fetched<VaultDocument | null>> {
  try {
    const data = await getJson<VaultDocument>(`/documents/${documentId}`);
    return { data, source: "live" };
  } catch {
    return { data: getDocumentFixture(documentId), source: "demo" };
  }
}

// --- Asset detail (composes /assets/{id} + /aliases + /knowledge) ---
export interface AssetDetailView {
  asset_id: string;
  name: string;
  equipment_class: string;
  criticalityLabel: string;
  criticalityColor: string;
  parent: string | null;
  open_work_orders: number | null;
  compliance_gaps: number | null;
  last_inspection: string | null;
  aliases: string[];
  knowledge: KnowledgeEdge[];
}

function normVerification(v: unknown): KnowledgeEdge["verification"] {
  return v === "verified" || v === "disputed" ? v : "unverified";
}

/** Best-effort claim text from a raw graph fact (target has no single claim field). */
function factClaim(target: Record<string, unknown>, edge: Record<string, unknown>): string {
  const t = target;
  return (
    (t.requirement_text as string) ||
    (t.claim as string) ||
    (t.name as string) ||
    (t.title as string) ||
    (edge.parameter as string) ||
    (t.document_id as string) ||
    "Knowledge edge"
  );
}

export async function getAssetDetail(id: string): Promise<Fetched<AssetDetailView | null>> {
  try {
    const [detail, aliases, knowledge] = await Promise.all([
      getJson<AssetDetail>(`/assets/${id}`),
      getJson<AssetAlias[]>(`/assets/${id}/aliases`).catch(() => [] as AssetAlias[]),
      getJson<AssetKnowledgeResponse>(`/assets/${id}/knowledge`).catch(() => null),
    ]);
    const crit = criticalityMeta(detail.criticality);
    const view: AssetDetailView = {
      asset_id: detail.asset_id,
      name: detail.name,
      equipment_class: detail.equipment_class,
      criticalityLabel: crit.label,
      criticalityColor: crit.color,
      parent: detail.parent_asset_id ?? null,
      open_work_orders: detail.open_work_orders_count ?? null,
      compliance_gaps: detail.compliance_gap_count ?? null,
      last_inspection: detail.last_inspection_date ?? null,
      aliases: (aliases ?? []).map((a) => a.alias),
      knowledge: (knowledge?.facts ?? []).map((f) => ({
        claim: factClaim(f.target, f.edge),
        authority_level: ((f.edge.authority_level as AuthorityLevel) ?? 5),
        verification: normVerification(f.edge.verification_status),
        source_doc: (f.edge.document_id as string) ?? "—",
      })),
    };
    return { data: view, source: "live" };
  } catch {
    const a = getAssetFixture(id);
    if (!a) return { data: null, source: "demo" };
    const crit = criticalityMeta(a.criticality);
    return {
      data: {
        asset_id: a.asset_id,
        name: a.name,
        equipment_class: a.equipment_class,
        criticalityLabel: crit.label,
        criticalityColor: crit.color,
        parent: a.parent,
        open_work_orders: a.open_work_orders,
        compliance_gaps: a.compliance_gaps,
        last_inspection: a.last_inspection,
        aliases: a.aliases,
        knowledge: a.knowledge,
      },
      source: "demo",
    };
  }
}
