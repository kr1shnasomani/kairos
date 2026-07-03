// API types — derived from docs/API.md. The contract for both live and fixture data.

export type Role = "admin" | "engineer" | "field_worker";

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
