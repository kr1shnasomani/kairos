// API types — derived from docs/API.md. The contract for both live and fixture data.

export type Role = "admin" | "engineer" | "field_worker" | "reliability";

export interface User {
  user_id: string;
  email: string;
  role: Role;
  site_id: string;
}

/** Authority hierarchy (docs/ARCHITECTURE Layer 4). Lower = higher authority. */
export type AuthorityLevel = 1 | 2 | 3 | 4 | 5;

export type BriefPriority = "critical" | "high" | "normal" | "medium" | "low";

export type GovernorStateValue = "normal" | "suppressed";

export interface BriefSource {
  document_id: string;
  document_type: string;
  title: string;
  authority_level: AuthorityLevel;
  relevant_excerpt: string;
  vault_url: string | null;
  is_quarantine: boolean;
}

export interface Brief {
  brief_id: string;
  recipient_user_id: string;
  priority: BriefPriority;
  trigger_event_type: string;
  headline: string;
  body: string;
  action_items: string[];
  warnings: string[];
  sources: BriefSource[];
  requires_countersignature: boolean;
  delivery_frozen: boolean;
  frozen?: boolean;
  freeze_reason?: string | null;
  freeze_deviation_flag_id?: string | null;
  delivered_at: string;
  acknowledged_at?: string | null;
}

export interface GovernorState {
  push_count_last_hour: number;
  ceiling: number;
  state: GovernorStateValue;
}

export interface BriefsResponse {
  briefs: Brief[];
  total_pending: number;
  suppressed_count: number;
  governor_state: GovernorState;
  next_delivery_allowed_at: string | null;
}

// --- Search / synthesize (Layer 11) ---
export interface SynthesizeSource {
  document_id: string;
  authority_level: AuthorityLevel;
}

export interface SynthesizeResponse {
  answer: string | null;
  sources: SynthesizeSource[];
  confidence: number;
  refused: boolean;
  refusal_reason?: string;
  safety_critical: boolean;
  sources_used?: number[];
  model?: string;
}

// --- RCA pack ---
export interface RcaTimelineEvent {
  event_type: string;
  occurred_at: string;
  description: string;
  source: string;
}

export interface RcaHypothesis {
  hypothesis: string;
  evidence_weight: number;
  sources: string[];
  refused?: boolean;
}

export interface RcaSupportingDoc {
  document_id: string;
  title: string;
  authority_level: AuthorityLevel;
  confidence: number;
}

export interface RcaPack {
  asset_id: string;
  incident_date: string;
  failure_code: string;
  timeline: RcaTimelineEvent[];
  hypotheses: RcaHypothesis[];
  supporting_documents: RcaSupportingDoc[];
  confidence: number;
  refused: boolean;
  synthesis_available: boolean;
}

/** Generic list envelope used by /assets, /governance/*, /compliance/gaps (MEMORY task 25). */
export interface ListEnvelope<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// --- Compliance (GET /compliance/gaps, /dashboard) ---
// severity is derived server-side from authority_level: 1→critical, 2→major, else minor.
export type GapSeverity = "critical" | "major" | "minor";

export interface ComplianceGap {
  concept_id?: string;
  framework: string;
  clause_id: string;
  requirement_text: string;
  applies_to?: string | null;
  authority_level: AuthorityLevel;
  asset_id: string;
  tag_number?: string | null;
  equipment_class?: string | null;
  site_id?: string | null;
  severity: GapSeverity;
  suggested_remediation?: string | null;
}

export interface ComplianceGapsResponse {
  items: ComplianceGap[];
  total: number;
  limit: number;
  offset: number;
  framework: string | null;
  last_scan: string;
}

// --- Assets (GET /assets, /assets/{id}) ---
export interface AssetSummary {
  asset_id: string;
  tag_number?: string | null;
  name: string;
  equipment_class: string;
  criticality: string; // safety_critical | critical | non_critical
  site_id?: string | null;
  parent_asset_id?: string | null;
}

export interface AssetsResponse {
  items: AssetSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface AssetDetail extends AssetSummary {
  open_work_orders_count: number;
  compliance_gap_count: number;
  last_inspection_date: string | null;
}

// --- Governance: conflicts (GET /governance/conflicts) ---
export type ConflictTrack = "administrative" | "engineering";
export type ConflictStatus = "open" | "pending_moc" | "resolved";

/** A conflict source is a JSON blob from Supabase; document_id is the field we surface. */
export interface ConflictSource {
  document_id?: string;
  value?: string;
  [key: string]: unknown;
}

export interface Conflict {
  conflict_id: string;
  track: ConflictTrack;
  asset_id: string;
  parameter: string;
  source_a: ConflictSource;
  source_b: ConflictSource;
  authority_a: AuthorityLevel;
  authority_b: AuthorityLevel;
  severity: string;
  status: ConflictStatus;
  sla_due_at: string | null;
  is_overdue: boolean;
  created_at: string;
}

export interface ConflictsResponse {
  items: Conflict[];
  total: number;
  limit: number;
  offset: number;
}

// --- Governance: quarantine (GET /governance/quarantine) ---
export type QuarantineStatus = "pending" | "promoted" | "disputed" | "archived";

export interface QuarantineItem {
  item_id: string;
  asset_id: string | null;
  content: string;
  input_type: string;
  submitted_by: string;
  submitted_at: string;
  reviewer_id: string | null;
  review_status: QuarantineStatus;
  work_order_id: string | null;
  session_context: Record<string, unknown> | null;
  sla_due_at: string | null;
  is_overdue: boolean;
}

export interface QuarantineResponse {
  items: QuarantineItem[];
  total: number;
  limit: number;
  offset: number;
  note: string;
}

/** Body for POST /governance/quarantine/{id}/promote. */
export interface PromoteQuarantineRequest {
  authority_level: AuthorityLevel;
  relationship_type: string;
  document_type?: string;
  notes?: string;
}

// --- Documents (GET /documents/, /documents/{id}) ---
export type DocumentState = "active" | "superseded";

export interface VaultDocument {
  document_id: string;
  file_name: string;
  document_type: string; // oem_manual | procedure | inspection_report | ptw | shift_log | regulation | pid_drawing
  authority_level: AuthorityLevel;
  source_system: string;
  vault_url: string | null;
  status: DocumentState;
  ingested_at: string;
  ingested_by: string;
  file_size_bytes?: number;
  mime_type?: string;
  sha256_hash?: string;
  version_chain?: string | null;
  asset_links?: string[];
  occurred_at?: string | null;
}

export interface DocumentsResponse {
  items: VaultDocument[];
  total: number;
  limit: number;
  offset: number;
}

// --- Asset knowledge (GET /assets/{id}/knowledge, /aliases) ---
export interface AssetAlias {
  canonical_asset_id?: string;
  alias: string;
  alias_source?: string;
  confirmed?: boolean;
  confidence?: number;
}

/** Raw fact = a temporal KNOWLEDGE_EDGE plus its target node. */
export interface AssetKnowledgeFact {
  edge: Record<string, unknown>;
  target: Record<string, unknown>;
}

export interface AssetKnowledgeResponse {
  asset_id: string;
  as_of: string;
  fact_count: number;
  facts: AssetKnowledgeFact[];
}

// --- Compliance dashboard (GET /compliance/dashboard) ---
export interface ComplianceDashboard {
  total_gaps: number;
  by_severity: Record<string, number>;
  by_framework: Record<string, number>;
  last_scan: string;
}

// --- Governance: SLA report (GET /governance/sla-report) ---
export interface OverdueConflict {
  conflict_id: string;
  asset_id: string;
  parameter: string;
  track: ConflictTrack;
  severity: string;
  overdue_by_hours: number;
  escalated: boolean;
}

export interface OverdueQuarantineItem {
  item_id: string;
  asset_id: string | null;
  input_type: string;
  submitted_at: string;
  overdue_by_hours: number;
}

export interface SlaReport {
  total_conflicts: number;
  on_time_conflicts: number;
  overdue_conflicts: OverdueConflict[];
  total_quarantine: number;
  on_time_quarantine: number;
  overdue_quarantine: OverdueQuarantineItem[];
  generated_at: string;
}

// --- Governance: MoC (GET /governance/moc) ---
export type MocStatus = "pending" | "approved" | "rejected";

export interface MocItem {
  moc_id: string;
  asset_id: string;
  parameter: string;
  source_a: ConflictSource;
  source_b: ConflictSource;
  blast_radius_count: number;
  status: MocStatus;
  created_at: string;
  draft_content?: string | null;
}

export interface MocResponse {
  items: MocItem[];
  total: number;
  limit: number;
  offset: number;
}

// --- Governance: circuit breaker (GET /governance/circuit-breaker) ---
export type CircuitBreakerStatus = "ok" | "halted";

export interface CircuitBreakerEntry {
  asset_class: string;
  status: CircuitBreakerStatus;
  z_score: number;
  override_count_7d: number;
  halted_since: string | null;
}

export interface CircuitBreakerState {
  entries: CircuitBreakerEntry[];
  generated_at: string;
}

// --- Governance: model gate ---
export interface ModelGateResult {
  run_id: string;
  task_id?: string | null;
  precision: number;
  recall: number;
  f1: number;
  passed: boolean;
  corpus_size: number;
  run_at: string;
}

export interface ModelGateHistory {
  history: ModelGateResult[];
}

export interface ModelGateRunResponse {
  task_id: string;
  status: string;
}

export interface ValidationCorpusStats {
  total: number;
  by_entity_type: Record<string, number>;
  by_asset_class: Record<string, number>;
  last_updated: string;
}

// --- Governance: blast radius ---
export interface BlastRadiusItem {
  item_id: string;
  item_type: string;
  description: string;
  asset_id?: string;
  flagged_for_review: boolean;
}

export interface BlastRadiusReport {
  document_id: string;
  affected_count: number;
  items: BlastRadiusItem[];
  generated_at: string;
}

// --- Annotations (POST /annotations, GET /annotations) ---
export interface Annotation {
  annotation_id: string;
  document_id: string;
  entity_text: string;
  entity_type: string;
  corrected_type?: string | null;
  is_correct: boolean;
  span_start?: number | null;
  span_end?: number | null;
  created_by: string;
  created_at: string;
}

export interface AnnotationStats {
  total: number;
  corrections_this_week: number;
  top_corrected_entity_types: Array<{ type: string; count: number }>;
}

// --- Elicitation (GET /elicitation/{wo}/questions) ---
export interface ElicitationQuestion {
  question_id: string;
  question_text: string;
  context: string;
  options?: string[] | null;
  question_type: "multiple_choice" | "free_text";
}

export interface ElicitationSession {
  session_id: string;
  work_order_id: string;
  asset_id?: string | null;
  questions: ElicitationQuestion[];
  status: "pending" | "in_progress" | "completed";
  created_at: string;
}

// --- Offboarding (GET /elicitation/offboarding) ---
export type OffboardingSessionStatus = "pending" | "questions_ready" | "completed";

export interface OffboardingSession {
  session_id: string;
  programme_id: string;
  session_number: number;
  equipment_family: string;
  focus_failure_modes: string[];
  scheduled_date: string;
  status: OffboardingSessionStatus;
}

export interface OffboardingProgramme {
  programme_id: string;
  personnel_id: string;
  personnel_email: string;
  retirement_date: string;
  sessions: OffboardingSession[];
  sessions_completed: number;
  sessions_total: number;
  created_at: string;
}

// --- Operational events (GET /events/{id}, POST /events/*) ---
export type EventPriority = "critical" | "high" | "normal" | "low";

export interface OperationalEvent {
  event_id: string;
  event_type: string;
  event_subtype?: string | null;
  asset_id?: string | null;
  site_id?: string | null;
  occurred_at: string;
  priority: EventPriority;
  payload: Record<string, unknown>;
  brief_id?: string | null;
  correlated_event_ids?: string[];
  acknowledged: boolean;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
}

export interface EventsResponse {
  items: OperationalEvent[];
  total: number;
  limit: number;
  offset: number;
}

// --- Plant state (GET /events/plant-state/{site_id}) ---
export type PlantOperatingState = "normal" | "turnaround" | "shutdown" | "emergency";

export interface PlantState {
  site_id: string;
  state: PlantOperatingState;
  set_by: string;
  set_at: string;
  expires_at?: string | null;
}

// --- Governor state (GET /events/governor-state/{user_id}) ---
export interface GovernorEventState {
  user_id: string;
  push_count_last_hour: number;
  ceiling: number;
  state: GovernorStateValue;
  suppressed_count: number;
  next_delivery_allowed_at: string | null;
}

// --- Document pipeline status (GET /documents/{id}/status) ---
export type DocumentPipelineStage =
  | "queued" | "ocr" | "ner" | "graph_linking" | "indexing"
  | "complete" | "review_required" | "failed";

export interface DocumentStatus {
  document_id: string;
  stage: DocumentPipelineStage;
  updated_at: string;
  details?: string | null;
}

// --- P&ID topology (GET /documents/{id}/topology) ---
export interface TopologyNode {
  node_id: string;
  node_type: string;
  label: string;
  verification_status: "verified" | "unverified" | "disputed";
  properties?: Record<string, unknown>;
}

export interface TopologyEdge {
  edge_id: string;
  source_id: string;
  target_id: string;
  edge_type: string;
  label?: string;
}

export interface TopologyGraph {
  document_id: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  generated_at: string;
}

// --- Audit log (GET /audit-log) ---
export interface AuditLogEntry {
  log_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  performed_by: string;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
}

export interface AuditLogResponse {
  items: AuditLogEntry[];
  total: number;
}

// --- Health (GET /health/detailed) ---
export interface ServiceHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  latency_ms?: number | null;
  details?: string | null;
}

export interface HealthDetailed {
  overall: "healthy" | "degraded" | "down";
  services: ServiceHealth[];
  checked_at: string;
}

// --- Audit pack (GET /compliance/audit-pack) ---
export interface AuditPackClause {
  clause_id: string;
  requirement_text: string;
  documents: VaultDocument[];
  confidence: number;
  requires_review: boolean;
  cleared: boolean;
  reviewed_by?: string | null;
}

export interface AuditPack {
  framework: string;
  clauses: AuditPackClause[];
  generated_at: string;
}

// --- OT instrumentation coverage (GET /ot/coverage/{asset_id}) ---
export interface OtCoverage {
  asset_id: string;
  has_direct_sensors: boolean;
  sensor_tags: string[];
  coverage_type: "direct" | "macro" | "none";
  last_reading?: string | null;
}

// --- Knowledge graph (Tasks 15-16) ---
export interface GraphNodeData {
  id: string;
  label: string;
  kind: string; // Asset | Event | Document | Concept | Person | Organization | …
  properties: Record<string, unknown>;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
  authority_level: number;
  verification_status: "verified" | "unverified" | "disputed" | "superseded";
  valid_from: string;
  valid_to: string; // "9999-…" sentinel = currently open
  document_id: string;
  confidence: number;
}

export interface KnowledgeGraphData {
  asset_id: string;
  as_of: string;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}
