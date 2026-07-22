import type {
  Brief,
  BriefsResponse,
  ComplianceDashboard,
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
  SlaReport,
  MocResponse,
  MocItem,
  CircuitBreakerState,
  ModelGateHistory,
  ModelGateResult,
  ModelGateRunResponse,
  ValidationCorpusStats,
  BlastRadiusReport,
  BlastRadiusItem,
  Annotation,
  AnnotationStats,
  ElicitationSession,
  OffboardingProgramme,
  OperationalEvent,
  EventsResponse,
  PlantState,
  PlantOperatingState,
  GovernorEventState,
  DocumentStatus,
  TopologyGraph,
  TopologyNode,
  TopologyEdge,
  AuditLogEntry,
  AuditLogResponse,
  HealthDetailed,
  ServiceHealth,
  AuditPack,
  OtCoverage,
  GraphNodeData,
  GraphEdgeData,
  KnowledgeGraphData,
} from "./types";
import { fixtureBriefs } from "./fixtures";
import { auditPackFixtureFor } from "./compliance";
import { assets as fixtureAssets, getAsset as getAssetFixture, type KnowledgeEdge } from "./assets";
import { conflictsFixture, quarantineFixture } from "./governance";
import { documentsFixture, getDocumentFixture } from "./documents";
import { eventFixtures, getEventFixture } from "./events";
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
const REFRESH_KEY = "kairos-refresh";
const ACCESS_COOKIE = "kairos-access";

export function isStrictAuth(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_STRICT === "true";
}

function accessTokenMaxAge(token: string): number {
  try {
    const payload = token.split(".")[1];
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    if (typeof exp === "number") return Math.max(0, Math.floor(exp - Date.now() / 1000));
  } catch {
    // Non-JWT development tokens still need a bounded browser session.
  }
  return 60 * 60;
}

export function storeSession(accessToken: string, refreshToken?: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  } catch {
    // Storage can be disabled; strict mode retains the short-lived cookie.
  }
  if (isStrictAuth()) {
    document.cookie = `${ACCESS_COOKIE}=${encodeURIComponent(accessToken)}; Path=/; SameSite=Lax; Max-Age=${accessTokenMaxAge(accessToken)}${location.protocol === "https:" ? "; Secure" : ""}`;
  }
}

/** Client-side bearer token (set at login). Server reads use the dev-mode bypass. */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function getStrictReadToken(): Promise<string | null> {
  if (!isStrictAuth()) return null;
  if (typeof window !== "undefined") return getToken();
  const { cookies } = await import("next/headers");
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Storage can be disabled; the redirect still prevents a stale protected view.
  }
  document.cookie = `${ACCESS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token: string; refresh_token?: string };
    storeSession(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export async function fetchWithSession(path: string, init: RequestInit, timeoutMs = WRITE_TIMEOUT_MS): Promise<Response> {
  const makeRequest = () => {
    const token = getToken();
    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
  };

  let res = await makeRequest();
  if (res.status !== 401) return res;
  if (await refreshAccessToken()) res = await makeRequest();
  if (res.status === 401) clearSession();
  return res;
}

// Writes have no fixture to fall back to, so give them more room than reads' 1500ms
// fail-fast — but still bounded, so a hung backend fails visibly instead of hanging forever.
const WRITE_TIMEOUT_MS = 8000;

/** Authenticated write from the browser. Retries once after a silent token refresh on 401. */
export async function postJson<T>(path: string, body: unknown, timeoutMs = WRITE_TIMEOUT_MS): Promise<T> {
  const makeReq = (tok: string | null) =>
    fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

  let res = await makeReq(getToken());
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      // clear session and redirect — no router available outside components
      try { localStorage.removeItem("kairos-token"); localStorage.removeItem("kairos-refresh"); } catch {}
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new Error(`${path} → HTTP 401`);
    }
    res = await makeReq(getToken());
  }
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.assign("/login");
  }
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

// Uploads (voice notes, scanned P&IDs) can be large on slow field links — the 8s write
// budget would abort them mid-transfer, so give multipart a much longer ceiling.
const UPLOAD_TIMEOUT_MS = 120_000;

async function postMultipart<T>(path: string, body: FormData): Promise<T> {
  const res = await fetchWithSession(path, { method: "POST", body }, UPLOAD_TIMEOUT_MS);
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

// Live-only policy: give real queries room to land (cold Neo4j/Supabase calls run
// ~1s+). A genuine down/hanging backend still surfaces as an error+retry after the
// timeout — we never substitute fabricated data. Slow endpoints pass an even
// longer timeout (e.g. compliance gaps at 5s).
async function getJson<T>(path: string, timeoutMs = 4000): Promise<T> {
  const makeRequest = async () => {
    const token = await getStrictReadToken();
    return fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  };

  let res = await makeRequest();
  if (res.status === 401 && isStrictAuth()) {
    if (!await refreshAccessToken()) {
      clearSession();
      if (typeof window !== "undefined") window.location.assign("/login");
      throw new Error(`${path} → HTTP 401`);
    }
    res = await makeRequest();
  }
  if (res.status === 401 && isStrictAuth()) {
    clearSession();
    if (typeof window !== "undefined") window.location.assign("/login");
  }
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

// Liveness probe for a single endpoint — returns HTTP status + latency, never throws.
// Used by the System Health page to show each API surface live. Pass only safe read-only GETs.
export type ProbeResult = { ok: boolean; status: number; latencyMs: number };
export async function probeEndpoint(path: string, timeoutMs = 8000): Promise<ProbeResult> {
  const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
  try {
    const token = await getStrictReadToken();
    const res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    return { ok: res.ok, status: res.status, latencyMs };
  } catch {
    const latencyMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    return { ok: false, status: 0, latencyMs };
  }
}

// Opt-in liveness probe for a rate-limited model provider (nim/gemini/jina/groq). Each call spends
// real quota, so the System Health page only fires this when the provider's toggle is on. Never throws.
export type ModelProbe = { provider: string; ok: boolean; status?: number; model?: string; latencyMs?: number; detail?: string | null };
export async function probeModel(provider: string): Promise<ModelProbe> {
  try {
    const r = await getJson<{ provider: string; ok: boolean; status?: number; model?: string; latency_ms?: number; detail?: string | null }>(
      `/health/model?provider=${provider}`, 25000,
    );
    return { provider: r.provider, ok: r.ok, status: r.status, model: r.model, latencyMs: r.latency_ms, detail: r.detail };
  } catch (e) {
    return { provider, ok: false, detail: e instanceof Error ? e.message : "probe failed" };
  }
}

export async function getBriefs(): Promise<Fetched<BriefsResponse>> {
  try {
    const data = await getJson<BriefsResponse>("/briefs/?unacknowledged_only=false&limit=20");
    // An empty briefs list from a successful call is a VALID live state — no briefs
    // pending, or the governor has suppressed them. BriefInbox renders an honest
    // empty / "governor suppressed" panel for it, so this is never a fixture fallback.
    return { data: { ...data, briefs: data.briefs ?? [] }, source: "live" };
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
  // Live-only: compliance gaps are real backend data — never substitute a fixture.
  // This is the heaviest query in the app (assets × regulation clauses in Neo4j,
  // ~1s+ cold), so allow a generous 5s abort. A genuine failure propagates to the
  // caller so the page shows a retry state, not fabricated gaps. An empty result
  // is a valid state ("no gaps found"), not an error.
  const qs = framework && framework !== "All" ? `?framework=${encodeURIComponent(framework)}` : "";
  const data = await getJson<ComplianceGapsResponse>(`/compliance/gaps${qs}`, 5000);
  return { data, source: "live" };
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

export function requestQuarantineInfo(itemId: string, note: string) {
  return postJson<{ status: "requested"; item_id: string }>(
    `/governance/quarantine/${itemId}/request-info`,
    { note },
  );
}

// --- Copilot (POST /search/synthesize) + RCA (POST /search/rca-pack) ---
// Both are read-oriented POSTs. Live first, fixture on any error (backend down / refusal path).

export async function synthesize(query: string, asOf?: string): Promise<CopilotAnswer> {
  try {
    // Step 1 — RETRIEVE. Synthesis assembles only from context it is given, so we must run hybrid
    // search first (exactly what the benchmark does). Without this the answer is always empty.
    const qs = new URLSearchParams({ q: query, limit: "6" });
    if (asOf) qs.set("as_of", asOf);
    const search = await getJson<{ results: Array<{ document_id: string; snippet?: string; title?: string; authority_level?: number; asset_id?: string | null }> }>(
      `/search?${qs.toString()}`, 12000,
    );
    const results = search.results ?? [];
    if (results.length === 0) return answerFor(query);  // nothing governed to answer from

    const context = results.map((r) => ({
      text: r.snippet ?? "",
      document_id: r.document_id,
      title: r.title ?? r.document_id,
      authority_level: r.authority_level ?? 5,
      asset_id: r.asset_id ?? null,
    }));

    // Step 2 — SYNTHESIZE from the retrieved context. Long timeout: NIM/Gemini can take ~10–30s.
    const live = await postJson<{
      answer: string | null;
      sources: { document_id: string; authority_level: number }[];
      confidence: number;
      refused: boolean;
      refusal_reason?: string;
      safety_critical: boolean;
      model?: string;
    }>("/search/synthesize", asOf ? { query, context, as_of: asOf } : { query, context }, 90000);

    // Genuine safety refusal is kept. Empty answer despite context → surface the retrieved sources
    // instead of a blank bubble (still real data, not the fixture).
    if (!live.refused && !live.answer?.trim()) {
      return {
        answer: null,
        sources: context.map((c) => ({ document_id: c.document_id, title: c.title, authority_level: c.authority_level as CopilotAnswer["sources"][number]["authority_level"], excerpt: c.text.slice(0, 200) })),
        confidence: 0,
        refused: false,
        safety_critical: false,
      };
    }
    // Map the answer's cited sources back to their snippets from the retrieved context.
    const byId = new Map(context.map((c) => [c.document_id, c]));
    return {
      answer: live.answer,
      sources: (live.sources ?? []).map((s) => ({
        document_id: s.document_id,
        title: byId.get(s.document_id)?.title ?? s.document_id,
        authority_level: (s.authority_level as CopilotAnswer["sources"][number]["authority_level"]) ?? 5,
        excerpt: byId.get(s.document_id)?.text.slice(0, 200) ?? "",
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

export async function getRcaPack(
  assetId: string,
  failureCode: string,
  incidentDate?: string,
  includeQuarantine?: boolean
): Promise<RcaPack> {
  try {
    const live = await postJson<Partial<RcaPack>>("/search/rca-pack", {
      asset_id: assetId,
      failure_code: failureCode,
      incident_date: incidentDate ?? new Date().toISOString(),
      ...(includeQuarantine !== undefined && { include_quarantine: includeQuarantine }),
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

/** Short-lived signed URL to open a vault artifact in the browser (the stored
 *  vault_url is the auth-only endpoint that a plain link can't open). */
export async function getArtifactUrl(documentId: string): Promise<string | null> {
  try {
    const data = await getJson<{ signed_url?: string }>(`/documents/${documentId}/artifact-url`, 8000);
    return data.signed_url ?? null;
  } catch {
    return null;
  }
}

// --- Compliance dashboard ---
export async function getComplianceDashboard(): Promise<Fetched<ComplianceDashboard | null>> {
  try {
    const data = await getJson<ComplianceDashboard>("/compliance/dashboard");
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

// --- Audit pack ---
export async function getAuditPack(framework: string): Promise<Fetched<AuditPack | null>> {
  try {
    const data = await getJson<AuditPack>(`/compliance/audit-pack?framework=${encodeURIComponent(framework)}`);
    return { data, source: "live" };
  } catch {
    return { data: auditPackFixtureFor(framework), source: "demo" };
  }
}

// --- Governance: SLA report ---
export async function getSlaReport(): Promise<Fetched<SlaReport | null>> {
  try {
    const data = await getJson<SlaReport>("/governance/sla-report");
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

// --- Governance: MoC ---
export async function getMocList(): Promise<Fetched<MocResponse>> {
  try {
    const data = await getJson<MocResponse>("/governance/moc?limit=50");
    return { data, source: "live" };
  } catch {
    return { data: { items: [], total: 0, limit: 50, offset: 0 }, source: "demo" };
  }
}

export async function getMoc(mocId: string): Promise<Fetched<MocItem | null>> {
  try {
    const data = await getJson<MocItem>(`/governance/moc/${mocId}`);
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

export async function approveMoc(mocId: string, note?: string): Promise<void> {
  await postJson(`/governance/moc/${mocId}/approve`, { note: note || undefined });
}

// --- Governance: circuit breaker ---
export async function getCircuitBreaker(): Promise<Fetched<CircuitBreakerState | null>> {
  try {
    const data = await getJson<CircuitBreakerState>("/governance/circuit-breaker");
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

// --- Governance: model gate ---
/** Raw audit-log row from GET /governance/model-gate/history (contract-locked to {items}). */
interface RawGateRow {
  id: number | string;
  entity_id?: string;
  details?: { precision?: number; recall?: number; f1?: number; passed?: boolean; corpus_size?: number } | null;
  timestamp?: string;
}

export async function getModelGateHistory(): Promise<Fetched<ModelGateHistory>> {
  try {
    // The backend returns raw audit rows {id, entity_id, details, timestamp}; flatten each to
    // the UI ModelGateResult shape here (adapter layer). Rows without metrics are skipped.
    const raw = await getJson<{ items: RawGateRow[] }>("/governance/model-gate/history");
    const history: ModelGateResult[] = (raw.items ?? [])
      .filter((r) => r.details && typeof r.details.f1 === "number")
      .map((r) => ({
        run_id: String(r.id),
        task_id: null,
        precision: r.details!.precision ?? 0,
        recall: r.details!.recall ?? 0,
        f1: r.details!.f1 ?? 0,
        passed: !!r.details!.passed,
        corpus_size: r.details!.corpus_size ?? 0,
        run_at: r.timestamp ?? "",
      }));
    return { data: { history }, source: "live" };
  } catch {
    return { data: { history: [] }, source: "demo" };
  }
}

export function runModelGate(): Promise<ModelGateRunResponse> {
  return postJson<ModelGateRunResponse>("/governance/model-gate/run", {});
}

export async function getValidationCorpusStats(): Promise<Fetched<ValidationCorpusStats | null>> {
  try {
    const data = await getJson<ValidationCorpusStats>("/governance/validation-corpus/stats");
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

// --- Governance: blast radius ---
export async function getBlastRadius(documentId: string): Promise<Fetched<BlastRadiusReport | null>> {
  try {
    // Backend returns { document_id, affected_count, affected: [{edge, target}] }.
    // Normalise the edge/target pairs into the flat BlastRadiusItem shape the UI expects.
    const raw = await getJson<{
      document_id: string;
      affected_count: number;
      affected?: Array<{ edge?: Record<string, unknown>; source?: Record<string, unknown>; target?: Record<string, unknown> }>;
    }>(`/governance/blast-radius/${documentId}`);
    const items: BlastRadiusItem[] = (raw.affected ?? []).map((a, i) => {
      const edge = a.edge ?? {};
      // The affected entity is the edge SOURCE (the asset/concept whose knowledge
      // derives from this document); the target is the document node itself.
      const node = a.source && Object.keys(a.source).length ? a.source : (a.target ?? {});
      const assetId = (node.asset_id as string) ?? (node.tag_number as string) ?? undefined;
      return {
        item_id: (edge.edge_id as string) ?? `br-${i}`,
        item_type: assetId ? "asset" : ((node.element_type as string) ?? (edge.relationship_type as string) ?? "fact"),
        description:
          (node.name as string) ??
          (node.tag_number as string) ??
          assetId ??
          (node.label as string) ??
          (node.fact_text as string) ??
          (node.concept_id as string) ??
          "Linked entity",
        asset_id: assetId,
        flagged_for_review: edge.verification_status !== "verified",
      };
    });
    const data: BlastRadiusReport = {
      document_id: raw.document_id,
      affected_count: raw.affected_count ?? items.length,
      items,
      generated_at: new Date().toISOString(),
    };
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

// --- Annotations ---
export function createAnnotation(body: {
  document_id: string;
  entity_text: string;
  entity_type: string;
  corrected_type?: string;
  is_correct: boolean;
  span_start?: number;
  span_end?: number;
}) {
  return postJson<Annotation>("/annotations", body);
}

export async function getAnnotations(documentId: string): Promise<Fetched<Annotation[]>> {
  try {
    const data = await getJson<Annotation[]>(`/annotations?document_id=${encodeURIComponent(documentId)}`);
    return { data, source: "live" };
  } catch {
    return { data: [], source: "demo" };
  }
}

export async function getAnnotationStats(): Promise<Fetched<AnnotationStats | null>> {
  try {
    const data = await getJson<AnnotationStats>("/annotations/stats");
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

// --- Elicitation ---
export function triggerElicitation(workOrderId: string, assetId?: string) {
  return postJson<{ session_id: string; status: string }>("/elicitation/trigger", {
    work_order_id: workOrderId,
    asset_id: assetId,
  });
}

export async function getElicitationQuestions(workOrderId: string): Promise<Fetched<ElicitationSession | null>> {
  try {
    const data = await getJson<ElicitationSession>(`/elicitation/${workOrderId}/questions`);
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

export function submitElicitationResponses(
  workOrderId: string,
  responses: Array<{ question_id: string; answer: string }>,
) {
  return postJson<{ status: string; items_queued: number }>(
    `/elicitation/${workOrderId}/responses`,
    { responses },
  );
}

export function submitVoiceNote(workOrderId: string, blob: Blob, submittedBy: string) {
  const form = new FormData();
  // Endpoint expects the field named "file" (UploadFile param in elicitation router).
  form.append("file", blob, "recording.webm");
  form.append("submitted_by", submittedBy);
  return postMultipart<{ task_id: string; status: string }>(`/elicitation/${workOrderId}/voice`, form);
}

// --- Offboarding ---
export function createOffboarding(body: {
  personnel_id: string;
  personnel_email: string;
  retirement_date: string;
}) {
  return postJson<OffboardingProgramme>("/elicitation/offboarding", body);
}

export async function getOffboardingList(): Promise<Fetched<OffboardingProgramme[]>> {
  try {
    // Backend returns { items, total }; tolerate a bare array too.
    const res = await getJson<{ items?: OffboardingProgramme[] } | OffboardingProgramme[]>("/elicitation/offboarding", 6000);
    const data = Array.isArray(res) ? res : (res.items ?? []);
    return { data, source: "live" };
  } catch {
    return { data: [], source: "demo" };
  }
}

export async function getOffboarding(programmeId: string): Promise<Fetched<OffboardingProgramme | null>> {
  try {
    const data = await getJson<OffboardingProgramme>(`/elicitation/offboarding/${programmeId}`, 6000);
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

// Backend returns { items: [{ id, questions, ... }] }, where `questions` is a plain
// string[] of question texts (not structured ElicitationQuestion objects). Normalize
// into a map keyed by session-item id.
export async function getOffboardingQuestions(programmeId: string): Promise<Fetched<Record<string, string[]>>> {
  try {
    const raw = await getJson<{ items?: Array<{ id: string; questions?: string[] }> }>(
      `/elicitation/offboarding/${programmeId}/questions`,
      6000,
    );
    const map: Record<string, string[]> = {};
    for (const it of raw.items ?? []) map[it.id] = it.questions ?? [];
    return { data: map, source: "live" };
  } catch {
    return { data: {}, source: "demo" };
  }
}

// POST /offboarding/{programme_id}/responses — item_id in body; responses are
// [{question_index, answer}] (questions are positional strings).
export function submitOffboardingResponses(
  programmeId: string,
  itemId: string,
  responses: Array<{ question_index: number; answer: string }>,
) {
  return postJson<{ status: string; items_queued: number }>(
    `/elicitation/offboarding/${programmeId}/responses`,
    { item_id: itemId, responses },
  );
}

// --- Events ---
type EventIngestResponse = { status: string; event_id: string };

export function postTagOut(body: {
  source_system: string; site_id: string; asset_id: string; tag_out_reason: string; performed_by: string; expected_return_date?: string;
}) {
  return postJson<EventIngestResponse>("/events/tag-out", body);
}

export function postInspectionComplete(body: {
  source_system: string; site_id: string; asset_id: string; inspection_type: string;
  result: "passed" | "failed" | "conditional";
  findings?: string; performed_by: string; document_id?: string; confidence?: number;
}) {
  return postJson<EventIngestResponse>("/events/inspection-complete", body);
}

export function postAlarm(body: {
  source_system: string; site_id: string; asset_id: string; alarm_id: string; alarm_tag: string; alarm_description: string; severity: "critical" | "high" | "medium" | "low"; acknowledged_by: string;
}) {
  return postJson<EventIngestResponse>("/events/alarm", body);
}

export function postShiftHandover(body: {
  source_system: string; site_id: string; outgoing_shift_lead_id: string; incoming_shift_lead_id: string; handover_time: string;
}) {
  return postJson<EventIngestResponse>("/events/shift-handover", body);
}

export function postDeviationFlag(body: {
  asset_id: string;
  description: string;
  affected_topology_path?: string;
}) {
  return postJson<OperationalEvent>("/events/deviation-flag", body);
}

export function resolveDeviationFlag(
  flagId: string,
  // Mirrors backend DeviationFlagResolveRequest (models/event.py)
  body: { resolution: "promoted" | "disputed"; moc_warranted?: boolean; notes?: string },
) {
  return postJson<{ status: string }>(`/events/deviation-flag/${flagId}/resolve`, body);
}

export function setPlantState(body: {
  site_id: string;
  state: PlantOperatingState;
  expires_at?: string;
}) {
  return postJson<PlantState>("/events/plant-state", body);
}

export async function getPlantState(siteId: string): Promise<Fetched<PlantState | null>> {
  try {
    const data = await getJson<PlantState>(`/events/plant-state/${siteId}`);
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

export async function getEvent(eventId: string): Promise<Fetched<OperationalEvent | null>> {
  try {
    const data = await getJson<OperationalEvent>(`/events/${eventId}`);
    return { data, source: "live" };
  } catch {
    return { data: getEventFixture(eventId), source: "demo" };
  }
}

export function ackEvent(eventId: string, body: { user_id: string; role: string; signature?: string; notes?: string }) {
  return postJson<{ status: string }>(`/events/${eventId}/ack`, body);
}

export async function getGovernorState(userId: string): Promise<Fetched<GovernorEventState | null>> {
  try {
    const data = await getJson<GovernorEventState>(`/briefs/governor/status`);
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

// --- Documents: additional endpoints ---
// Backend groups P&ID elements into category arrays (equipment_nodes, isolation_valves,
// isolation_boundaries, instrumentation_loops) with no explicit edges. Flatten into the
// flat {nodes, edges} the viewer expects; synthesise edges from boundary→isolation refs.
const EQUIP_TYPE_MAP: Record<string, string> = { pump: "Pump", vessel: "Vessel" };

export async function getDocumentTopology(documentId: string): Promise<Fetched<TopologyGraph | null>> {
  try {
    const raw = await getJson<{
      document_id: string;
      verification_status?: string;
      extracted_at?: string;
      topology?: {
        equipment_nodes?: Array<Record<string, unknown>>;
        isolation_valves?: Array<Record<string, unknown>>;
        isolation_boundaries?: Array<Record<string, unknown>>;
        instrumentation_loops?: Array<Record<string, unknown>>;
      };
    }>(`/documents/${documentId}/topology`);

    const status = (["verified", "unverified", "disputed"].includes(raw.verification_status ?? "")
      ? raw.verification_status
      : "unverified") as TopologyNode["verification_status"];
    const t = raw.topology ?? {};
    const nodes: TopologyNode[] = [];
    const tagToId = new Map<string, string>(); // tag / boundary_id / loop_id → node_id

    for (const e of t.equipment_nodes ?? []) {
      const id = String(e.id);
      const tag = String(e.tag ?? id);
      tagToId.set(tag, id);
      nodes.push({ node_id: id, node_type: EQUIP_TYPE_MAP[String(e.equipment_class)] ?? "Equipment", label: tag, verification_status: status, properties: e });
    }
    for (const v of t.isolation_valves ?? []) {
      const id = String(v.id);
      const tag = String(v.tag ?? id);
      tagToId.set(tag, id);
      nodes.push({ node_id: id, node_type: "Valve", label: tag, verification_status: status, properties: v });
    }
    for (const l of t.instrumentation_loops ?? []) {
      const id = String(l.id);
      const label = String(l.loop_id ?? id);
      tagToId.set(label, id);
      nodes.push({ node_id: id, node_type: "Instrument", label, verification_status: status, properties: l });
    }
    const edges: TopologyEdge[] = [];
    for (const b of t.isolation_boundaries ?? []) {
      const id = String(b.id);
      nodes.push({ node_id: id, node_type: "Boundary", label: String(b.boundary_id ?? id), verification_status: status, properties: b });
      const refs = [...((b.primary_isolations as string[]) ?? []), ...((b.bleed_vents as string[]) ?? [])];
      for (const tag of refs) {
        const targetId = tagToId.get(tag);
        if (targetId) edges.push({ edge_id: `${id}-${targetId}`, source_id: id, target_id: targetId, edge_type: "isolation", label: "isolates" });
      }
    }

    const data: TopologyGraph = {
      document_id: raw.document_id,
      nodes,
      edges,
      generated_at: raw.extracted_at ?? new Date().toISOString(),
    };
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

export function supersedeDocument(documentId: string, formData: FormData) {
  return postMultipart<VaultDocument>(`/documents/${documentId}/supersede`, formData);
}

export async function getDocumentStatus(documentId: string): Promise<Fetched<DocumentStatus | null>> {
  try {
    const data = await getJson<DocumentStatus>(`/documents/${documentId}/status`);
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

// --- Audit log ---
export async function getAuditLog(params: {
  entity_type?: string;
  entity_id?: string;
  limit?: number;
}): Promise<Fetched<AuditLogResponse>> {
  try {
    const qs = new URLSearchParams();
    if (params.entity_type) qs.set("entity_type", params.entity_type);
    if (params.entity_id) qs.set("entity_id", params.entity_id);
    if (params.limit) qs.set("limit", String(params.limit));
    // Live payload uses numeric `id` + `details`; the UI shape is `log_id` +
    // `metadata`. Adapt here (same pattern as blast-radius/topology) so every
    // consumer keeps a stable, unique key.
    type RawAuditEntry = AuditLogEntry & { id?: number; details?: Record<string, unknown> | null };
    const raw = await getJson<{ items: RawAuditEntry[]; total: number }>(`/audit-log?${qs}`);
    const items = raw.items.map((it, i) => ({
      ...it,
      log_id: it.log_id ?? String(it.id ?? i),
      metadata: it.metadata ?? it.details ?? null,
    }));
    return { data: { items, total: raw.total }, source: "live" };
  } catch {
    return { data: { items: [], total: 0 }, source: "demo" };
  }
}

// --- Health ---
// Backend /health/detailed returns { status, checks: { neo4j: "ok"|"error: …", … } }.
// Adapt to the UI's { overall, services[] } shape here (same adapter pattern as blast-radius).
const _SERVICE_LABELS: Record<string, string> = {
  neo4j: "Neo4j · Knowledge graph",
  qdrant: "Qdrant · Vector store",
  elasticsearch: "Elasticsearch · Exact search",
  redis: "Redis · Cache & streams",
  temporal: "Temporal · Workflows",
};

export async function getHealthDetailed(): Promise<Fetched<HealthDetailed | null>> {
  try {
    const raw = await getJson<{ status: string; checks: Record<string, string> }>("/health/detailed");
    const services: ServiceHealth[] = Object.entries(raw.checks ?? {}).map(([name, state]) => ({
      name: _SERVICE_LABELS[name] ?? name,
      status: state === "ok" ? "healthy" : "down",
      details: state === "ok" ? null : state,
    }));
    // The API itself answered, so it's up — surface it as the first service.
    services.unshift({ name: "FastAPI · Core API", status: "healthy", details: null });
    const anyDown = services.some((s) => s.status !== "healthy");
    return {
      data: {
        overall: anyDown ? "degraded" : "healthy",
        services,
        checked_at: new Date().toISOString(),
      },
      source: "live",
    };
  } catch {
    return { data: null, source: "demo" };
  }
}

// --- OT coverage (via FastAPI passthrough to Go connector) ---
export async function getOtCoverage(assetId: string): Promise<Fetched<OtCoverage | null>> {
  try {
    const data = await getJson<OtCoverage>(`/ot/coverage/${assetId}`);
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

// --- MDM: confirm a provisional asset identity (Task 20c) ---
// Deterministic human confirmation — never AI-inferred. Sets identity_confirmed_by
// server-side; the asset becomes canonical and linkable.
export function confirmAssetIdentity(body: {
  asset_id: string;
  tag_number: string;
  name: string;
  equipment_class: string;
  criticality: "safety_critical" | "critical" | "non_critical";
  site_id: string;
  facility_id: string;
  confirmed_by_user_id: string;
}) {
  return postJson<{ asset_id: string; tag_number: string; status: "created" }>("/assets", body);
}

// --- Document ingest (multipart) ---
export function ingestDocument(formData: FormData) {
  return postMultipart<DocumentIngestResponse>("/documents/ingest", formData);
}

export interface DocumentIngestResponse {
  status: "accepted" | "duplicate";
  document_id: string;
  sha256: string;
  message: string;
  job_id?: string;
  vault_path?: string;
  workflow?: string;
}

// --- Events: list ---
function demoEvents(params?: { event_type?: string; limit?: number }): Fetched<EventsResponse> {
  const matched = eventFixtures().filter((event) => !params?.event_type || event.event_type === params.event_type);
  const limit = params?.limit ?? 50;
  return { data: { items: matched.slice(0, limit), total: matched.length, limit, offset: 0 }, source: "demo" };
}

export async function getEvents(params?: { event_type?: string; limit?: number }): Promise<Fetched<EventsResponse>> {
  try {
    const qs = new URLSearchParams();
    if (params?.event_type) qs.set("event_type", params.event_type);
    if (params?.limit) qs.set("limit", String(params.limit));
    const data = await getJson<EventsResponse>(`/events/?${qs}`);
    if (data.items.length === 0) return demoEvents(params);
    return { data, source: "live" };
  } catch {
    return demoEvents(params);
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

// --- Knowledge graph (Tasks 15-16, GET /assets/{id}/knowledge?as_of=) -------

function graphNodeKind(target: Record<string, unknown>): string {
  const t = target as Record<string, unknown>;
  const labels = Array.isArray(t.labels) ? (t.labels as string[])[0] : undefined;
  return String(t.__type__ ?? t.type ?? labels ?? "Concept");
}

function graphNodeLabel(target: Record<string, unknown>): string {
  const t = target as Record<string, string>;
  return t.name ?? t.title ?? t.asset_id ?? t.document_id ?? t.event_type ?? "Unknown";
}

function graphNodeId(target: Record<string, unknown>, i: number): string {
  const t = target as Record<string, string>;
  return String(t.id ?? t.asset_id ?? t.document_id ?? t.name ?? `node-${i}`);
}

function normVerifStatus(v: unknown): GraphEdgeData["verification_status"] {
  if (v === "verified" || v === "disputed" || v === "superseded") return v;
  return "unverified";
}

function fixtureKnowledgeGraph(assetId: string): KnowledgeGraphData {
  const asset = getAssetFixture(assetId) ?? fixtureAssets[0];
  const nodesMap = new Map<string, GraphNodeData>();
  nodesMap.set(asset.asset_id, { id: asset.asset_id, label: `${asset.asset_id} — ${asset.name}`, kind: "Asset", properties: {} });
  const edges: GraphEdgeData[] = asset.knowledge.map((k, i) => {
    const docId = `doc:${k.source_doc}`;
    if (!nodesMap.has(docId)) {
      nodesMap.set(docId, { id: docId, label: k.source_doc, kind: "Document", properties: {} });
    }
    const claimId = `claim:${i}`;
    nodesMap.set(claimId, { id: claimId, label: k.claim.slice(0, 40) + (k.claim.length > 40 ? "…" : ""), kind: "Concept", properties: {} });
    return {
      id: `e-${i}`,
      source: asset.asset_id,
      target: claimId,
      label: "has_fact",
      authority_level: k.authority_level,
      verification_status: normVerifStatus(k.verification),
      valid_from: "2020-01-01T00:00:00",
      valid_to: "9999-12-31T23:59:59",
      document_id: k.source_doc,
      confidence: k.verification === "verified" ? 0.92 : k.verification === "disputed" ? 0.45 : 0.61,
    };
  });
  return {
    asset_id: asset.asset_id,
    as_of: new Date().toISOString(),
    nodes: Array.from(nodesMap.values()),
    edges,
  };
}

export async function getKnowledgeGraph(
  assetId: string,
  asOf?: string
): Promise<Fetched<KnowledgeGraphData>> {
  try {
    const qs = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
    const raw = await getJson<AssetKnowledgeResponse>(`/assets/${assetId}/knowledge${qs}`);
    const nodesMap = new Map<string, GraphNodeData>();
    nodesMap.set(assetId, { id: assetId, label: assetId, kind: "Asset", properties: {} });
    // Dedupe edges — re-ingested datasets leave many identical KNOWLEDGE_EDGEs
    // (same target + relationship + document + validity). Left raw they stack as
    // overlapping lines and repeat endlessly in the validity-window list.
    const edges: GraphEdgeData[] = [];
    const seenEdge = new Set<string>();
    raw.facts.forEach((f, i) => {
      const tId = graphNodeId(f.target, i);
      const e = f.edge as Record<string, unknown>;
      const label = String(e.parameter ?? e.relationship_type ?? "related_to");
      const sig = `${tId}|${label}|${String(e.document_id ?? "")}|${String(e.valid_from ?? "")}`;
      if (seenEdge.has(sig)) return;
      seenEdge.add(sig);
      if (!nodesMap.has(tId)) {
        nodesMap.set(tId, {
          id: tId,
          label: graphNodeLabel(f.target),
          kind: graphNodeKind(f.target),
          properties: f.target,
        });
      }
      edges.push({
        id: `e-${i}`,
        source: assetId,
        target: tId,
        label,
        authority_level: Number(e.authority_level ?? 5),
        verification_status: normVerifStatus(e.verification_status),
        valid_from: String(e.valid_from ?? "2020-01-01T00:00:00"),
        valid_to: String(e.valid_to ?? "9999-12-31T23:59:59"),
        document_id: String(e.document_id ?? ""),
        confidence: Number(e.confidence ?? 0),
      });
    });
    return {
      data: { asset_id: assetId, as_of: raw.as_of, nodes: Array.from(nodesMap.values()), edges },
      source: "live",
    };
  } catch {
    return { data: fixtureKnowledgeGraph(assetId), source: "demo" };
  }
}
