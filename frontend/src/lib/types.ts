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
  delivered_at: string;
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
