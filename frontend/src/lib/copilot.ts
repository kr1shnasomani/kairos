import type { AuthorityLevel } from "./types";

// Display-oriented copilot response. Superset of the API's SynthesizeResponse
// with source titles/excerpts for rendering. When live, map POST /search/synthesize
// (+ the /search hits that formed its context) into this shape.

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

const SEAL: CopilotAnswer = {
  answer:
    "EQ-101 has four recorded mechanical-seal failures between 2018 and 2026. Three were preceded by thermal cycling beyond the OEM envelope. The seal specification was revised 18 months ago — the current variant is P/N MS-4471-B (superseding MS-4470-A). A field observation of unusual vibration before the last failure remains unverified.",
  sources: [
    {
      document_id: "DOC-P101-FAILURE-HIST",
      title: "EQ-101 Failure History Report",
      authority_level: 2,
      excerpt: "Four mechanical-seal failures 2018–2026; three preceded by thermal cycling.",
    },
    {
      document_id: "OEM-BULL-MS44-r3",
      title: "Seal Series MS-44 Service Bulletin r3",
      authority_level: 3,
      excerpt: "Supersedes MS-4470-A with MS-4471-B, effective 2024-11.",
    },
    {
      document_id: "QN-EQ101-VIB-0142",
      title: "Field note — unusual vibration on EQ-101",
      authority_level: 5,
      excerpt: "Operator reported abnormal vibration ~2 weeks before the last failure.",
      is_quarantine: true,
    },
  ],
  confidence: 0.91,
  refused: false,
  safety_critical: false,
  model: "meta/llama-3.3-70b-instruct",
  entities: [
    { entity_text: "EQ-101", entity_type: "Asset", document_id: "DOC-P101-FAILURE-HIST", confidence: 0.96 },
    { entity_text: "MS-4471-B", entity_type: "Part", document_id: "OEM-BULL-MS44-r3", confidence: 0.89 },
    { entity_text: "thermal cycling", entity_type: "FailureMode", document_id: "DOC-P101-FAILURE-HIST", confidence: 0.61 },
  ],
};

const PRESSURE_REFUSAL: CopilotAnswer = {
  answer: null,
  refused: true,
  safety_critical: true,
  confidence: 0.42,
  refusal_reason:
    "Safety-critical parameter query refused: evidence confidence 0.42 is below the 0.70 threshold for category max_allowable_pressure. Sources are returned directly — confirm the value with the responsible engineer before acting.",
  sources: [
    {
      document_id: "OEM-BULL-HE3-r4",
      title: "HE-3xx Series Service Bulletin r4",
      authority_level: 3,
      excerpt: "Revised maximum operating pressure pending Management-of-Change sign-off.",
    },
    {
      document_id: "SOP-HE-014",
      title: "Heat Exchanger Operating Procedure HE-014",
      authority_level: 4,
      excerpt: "Operating envelope references the prior bulletin; update in progress.",
    },
  ],
};

const ISOLATION: CopilotAnswer = {
  answer:
    "Isolation for V-247 on Line 3 / Section 2 uses double-block-and-bleed: primary XV-203, secondary bleed XV-204, and local gauge bypass PG-18. XV-203 is approaching its 18-month inspection interval. PG-18 has an unverified deviation flag (may not seat fully) — physically verify before energizing the work.",
  sources: [
    {
      document_id: "TOPO-PL3-S2",
      title: "P&ID topology — Line 3, Section 2 isolation boundary",
      authority_level: 3,
      excerpt: "Isolation boundary: XV-203 (primary), XV-204 (bleed), PG-18 (gauge bypass).",
    },
    {
      document_id: "QN-PG18-SEAT-0210",
      title: "Deviation — PG-18 may not seat fully",
      authority_level: 5,
      excerpt: "Field flag raised 2026-06-12; not yet reviewed by engineering.",
      is_quarantine: true,
    },
  ],
  confidence: 0.87,
  refused: false,
  safety_critical: false,
  model: "meta/llama-3.3-70b-instruct",
  entities: [
    { entity_text: "V-247", entity_type: "Asset", document_id: "TOPO-PL3-S2", confidence: 0.97 },
    { entity_text: "XV-203", entity_type: "Valve", document_id: "TOPO-PL3-S2", confidence: 0.93 },
    { entity_text: "XV-204", entity_type: "Valve", document_id: "TOPO-PL3-S2", confidence: 0.91 },
    { entity_text: "PG-18", entity_type: "Instrument", document_id: "TOPO-PL3-S2", confidence: 0.54 },
    { entity_text: "18-month inspection", entity_type: "Procedure", document_id: "TOPO-PL3-S2", confidence: 0.65 },
  ],
};

const GENERIC: CopilotAnswer = {
  answer:
    "I answer only from governed knowledge with source citations. Try asking about a specific asset (e.g. P-101), a failure mode, an isolation boundary, or a compliance requirement — I'll assemble the evidence and flag anything unverified.",
  sources: [],
  confidence: 0.6,
  refused: false,
  safety_critical: false,
  model: "meta/llama-3.3-70b-instruct",
};

/** Fixture matcher — stands in for /search + /search/synthesize while the backend is offline. */
export function answerFor(query: string): CopilotAnswer {
  const q = query.toLowerCase();
  if ((q.includes("pressure") || q.includes("max")) && (q.includes("he-3") || q.includes("pressure")))
    return PRESSURE_REFUSAL;
  if (q.includes("p-101") || q.includes("p101") || q.includes("seal") || q.includes("failure"))
    return SEAL;
  if (q.includes("v-247") || q.includes("isolation") || q.includes("ptw"))
    return ISOLATION;
  return GENERIC;
}
