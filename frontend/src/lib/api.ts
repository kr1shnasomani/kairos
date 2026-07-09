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
  ModelGateRunResponse,
  ValidationCorpusStats,
  BlastRadiusReport,
  Annotation,
  AnnotationStats,
  ElicitationQuestion,
  ElicitationSession,
  OffboardingProgramme,
  OperationalEvent,
  EventsResponse,
  PlantState,
  PlantOperatingState,
  GovernorEventState,
  DocumentStatus,
  TopologyGraph,
  AuditLogEntry,
  AuditLogResponse,
  HealthDetailed,
  AuditPack,
  OtCoverage,
  GraphNodeData,
  GraphEdgeData,
  KnowledgeGraphData,
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

async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const refreshToken = localStorage.getItem("kairos-refresh");
    if (!refreshToken) return false;
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token: string; refresh_token?: string };
    localStorage.setItem("kairos-token", data.access_token);
    if (data.refresh_token) localStorage.setItem("kairos-refresh", data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

/** Authenticated write from the browser. Retries once after a silent token refresh on 401. */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const makeReq = (tok: string | null) =>
    fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
      body: JSON.stringify(body),
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

export async function synthesize(query: string, asOf?: string): Promise<CopilotAnswer> {
  try {
    const live = await postJson<{
      answer: string | null;
      sources: { document_id: string; authority_level: number }[];
      confidence: number;
      refused: boolean;
      refusal_reason?: string;
      safety_critical: boolean;
      model?: string;
    }>("/search/synthesize", asOf ? { query, as_of: asOf } : { query });
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
    return { data: null, source: "demo" };
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
export async function getModelGateHistory(): Promise<Fetched<ModelGateHistory>> {
  try {
    const data = await getJson<ModelGateHistory>("/governance/model-gate/history");
    return { data, source: "live" };
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
    const data = await getJson<BlastRadiusReport>(`/governance/blast-radius/${documentId}`);
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
  form.append("audio", blob, "recording.webm");
  form.append("submitted_by", submittedBy);
  const token = getToken();
  return fetch(`${API_BASE}/elicitation/${workOrderId}/voice`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  }).then((r) => {
    if (!r.ok) throw new Error(`voice → HTTP ${r.status}`);
    return r.json() as Promise<{ task_id: string; status: string }>;
  });
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
    const data = await getJson<OffboardingProgramme[]>("/elicitation/offboarding");
    return { data, source: "live" };
  } catch {
    return { data: [], source: "demo" };
  }
}

export async function getOffboarding(programmeId: string): Promise<Fetched<OffboardingProgramme | null>> {
  try {
    const data = await getJson<OffboardingProgramme>(`/elicitation/offboarding/${programmeId}`);
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

export async function getOffboardingQuestions(sessionId: string): Promise<Fetched<ElicitationQuestion[]>> {
  try {
    const data = await getJson<ElicitationQuestion[]>(`/elicitation/offboarding/${sessionId}/questions`);
    return { data, source: "live" };
  } catch {
    return { data: [], source: "demo" };
  }
}

export function submitOffboardingResponses(
  sessionId: string,
  responses: Array<{ question_id: string; answer: string }>,
) {
  return postJson<{ status: string; items_queued: number }>(
    `/elicitation/offboarding/${sessionId}/responses`,
    { responses },
  );
}

// --- Events ---
export function postTagOut(body: { asset_id: string; reason: string; permit_number?: string }) {
  return postJson<OperationalEvent>("/events/tag-out", body);
}

export function postInspectionComplete(body: {
  asset_id: string;
  result: "passed" | "failed" | "conditional";
  findings?: string;
  performed_by: string;
}) {
  return postJson<OperationalEvent>("/events/inspection-complete", body);
}

export function postAlarm(body: { asset_id: string; alarm_tag: string; description: string; priority: string }) {
  return postJson<OperationalEvent>("/events/alarm", body);
}

export function postShiftHandover(body: { from_shift: string; to_shift: string; notes: string; site_id: string }) {
  return postJson<OperationalEvent>("/events/shift-handover", body);
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
  resolution: { action: "promote" | "dispute"; moc_warranted?: boolean; note?: string },
) {
  return postJson<{ status: string }>(`/events/deviation-flag/${flagId}/resolve`, resolution);
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
    return { data: null, source: "demo" };
  }
}

export function ackEvent(eventId: string) {
  return postJson<{ status: string }>(`/events/${eventId}/ack`, {});
}

export async function getGovernorState(userId: string): Promise<Fetched<GovernorEventState | null>> {
  try {
    const data = await getJson<GovernorEventState>(`/events/governor-state/${userId}`);
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

// --- Documents: additional endpoints ---
export async function getDocumentTopology(documentId: string): Promise<Fetched<TopologyGraph | null>> {
  try {
    const data = await getJson<TopologyGraph>(`/documents/${documentId}/topology`);
    return { data, source: "live" };
  } catch {
    return { data: null, source: "demo" };
  }
}

export function supersedeDocument(documentId: string, formData: FormData) {
  const token = getToken();
  return fetch(`${API_BASE}/documents/${documentId}/supersede`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  }).then((r) => {
    if (!r.ok) throw new Error(`supersede → HTTP ${r.status}`);
    return r.json() as Promise<VaultDocument>;
  });
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
    const data = await getJson<AuditLogResponse>(`/audit-log?${qs}`);
    return { data, source: "live" };
  } catch {
    return { data: { items: [], total: 0 }, source: "demo" };
  }
}

// --- Health ---
export async function getHealthDetailed(): Promise<Fetched<HealthDetailed | null>> {
  try {
    const data = await getJson<HealthDetailed>("/health/detailed");
    return { data, source: "live" };
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

// --- Document ingest (multipart) ---
export function ingestDocument(formData: FormData) {
  const token = getToken();
  return fetch(`${API_BASE}/documents/ingest`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  }).then((r) => {
    if (!r.ok) throw new Error(`ingest → HTTP ${r.status}`);
    return r.json() as Promise<VaultDocument & { already_ingested?: boolean }>;
  });
}

// --- Events: list ---
export async function getEvents(params?: { event_type?: string; limit?: number }): Promise<Fetched<EventsResponse>> {
  try {
    const qs = new URLSearchParams();
    if (params?.event_type) qs.set("event_type", params.event_type);
    if (params?.limit) qs.set("limit", String(params.limit));
    const data = await getJson<EventsResponse>(`/events?${qs}`);
    return { data, source: "live" };
  } catch {
    return { data: { items: [], total: 0, limit: 50, offset: 0 }, source: "demo" };
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
    const edges: GraphEdgeData[] = raw.facts.map((f, i) => {
      const tId = graphNodeId(f.target, i);
      if (!nodesMap.has(tId)) {
        nodesMap.set(tId, {
          id: tId,
          label: graphNodeLabel(f.target),
          kind: graphNodeKind(f.target),
          properties: f.target,
        });
      }
      const e = f.edge as Record<string, unknown>;
      return {
        id: `e-${i}`,
        source: assetId,
        target: tId,
        label: String(e.parameter ?? e.relationship_type ?? "related_to"),
        authority_level: Number(e.authority_level ?? 5),
        verification_status: normVerifStatus(e.verification_status),
        valid_from: String(e.valid_from ?? "2020-01-01T00:00:00"),
        valid_to: String(e.valid_to ?? "9999-12-31T23:59:59"),
        document_id: String(e.document_id ?? ""),
        confidence: Number(e.confidence ?? 0),
      };
    });
    return {
      data: { asset_id: assetId, as_of: raw.as_of, nodes: Array.from(nodesMap.values()), edges },
      source: "live",
    };
  } catch {
    return { data: fixtureKnowledgeGraph(assetId), source: "demo" };
  }
}
