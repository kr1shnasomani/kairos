import type { AuthorityLevel } from "./types";

// Display-oriented copilot response. Superset of the API's SynthesizeResponse
// with source titles/excerpts for rendering. api.ts maps POST /search/synthesize
// (+ the /search hits that formed its context) into this shape.
//
// Types and suggestions only — deliberately no fixture answers live here. The copilot
// renders live evidence, an empty result, or an error+retry; a stand-in answer would
// present invented document IDs as governed provenance.

export interface CopilotSource {
  document_id: string;
  title: string;
  authority_level: AuthorityLevel;
  excerpt: string;
  is_quarantine?: boolean;
}

export interface ExtractedEntity {
  entity_text: string;
  entity_type: string;
  document_id: string;
  confidence: number;
  span_start?: number;
  span_end?: number;
}

export interface CopilotAnswer {
  answer: string | null;
  sources: CopilotSource[];
  confidence: number;
  refused: boolean;
  refusal_reason?: string;
  safety_critical: boolean;
  model?: string;
  entities?: ExtractedEntity[];
}

export const SUGGESTIONS = [
  "What's the failure history of P-101?",
  "Maximum allowable pressure for the HE-3xx series?",
  "Isolation points for work on V-247",
  "Open compliance gaps on P-101",
];
