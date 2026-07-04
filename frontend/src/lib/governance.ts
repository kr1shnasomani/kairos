import type { Conflict, ConflictsResponse, QuarantineItem, QuarantineResponse } from "./types";

// Fixture governance data — stands in for GET /governance/conflicts + /quarantine while offline.
// Shapes mirror the live Supabase rows (backend/api/routers/governance.py). Curated to the
// P-101 / V-247 / EQ-101 story so the dual-track thesis reads cleanly in a demo.

const conflicts: Conflict[] = [
  {
    conflict_id: "CF-2041",
    track: "engineering",
    asset_id: "P-101",
    parameter: "max_allowable_pressure",
    source_a: { document_id: "SOP-HE-014", value: "12.0 barg" },
    source_b: { document_id: "OEM-BULL-HE3-r4", value: "10.5 barg" },
    authority_a: 4,
    authority_b: 3,
    severity: "critical",
    status: "pending_moc",
    sla_due_at: "2026-07-04T22:00:00Z",
    is_overdue: true,
    created_at: "2026-07-03T09:12:00Z",
  },
  {
    conflict_id: "CF-2042",
    track: "administrative",
    asset_id: "EQ-101",
    parameter: "seal_part_number",
    source_a: { document_id: "DOC-P101-FAILURE-HIST", value: "MS-4470-A" },
    source_b: { document_id: "OEM-BULL-MS44-r3", value: "MS-4471-B" },
    authority_a: 2,
    authority_b: 3,
    severity: "minor",
    status: "open",
    sla_due_at: "2026-07-08T09:00:00Z",
    is_overdue: false,
    created_at: "2026-07-03T14:40:00Z",
  },
  {
    conflict_id: "CF-2043",
    track: "administrative",
    asset_id: "V-247",
    parameter: "isolation_boundary",
    source_a: { document_id: "TOPO-PL3-S2", value: "XV-203 / XV-204 / PG-18" },
    source_b: { document_id: "SOP-ISO-019", value: "XV-203 / XV-204 only" },
    authority_a: 3,
    authority_b: 4,
    severity: "major",
    status: "open",
    sla_due_at: "2026-07-06T12:00:00Z",
    is_overdue: false,
    created_at: "2026-07-02T18:05:00Z",
  },
];

export const conflictsFixture: ConflictsResponse = {
  items: conflicts,
  total: conflicts.length,
  limit: 50,
  offset: 0,
};

const quarantine: QuarantineItem[] = [
  {
    item_id: "QN-EQ101-VIB-0142",
    asset_id: "EQ-101",
    content: "Operator reported abnormal vibration on EQ-101 drive end ~2 weeks before the last seal failure. Not formally raised at the time.",
    input_type: "deviation_flag",
    submitted_by: "field-op-7734",
    submitted_at: "2026-06-28T22:05:00Z",
    reviewer_id: null,
    review_status: "pending",
    work_order_id: "WO-88213",
    session_context: { document_id: "QN-EQ101-VIB-0142", entity: { text: "abnormal vibration", entity_type: "symptom" } },
    sla_due_at: "2026-07-04T22:05:00Z",
    is_overdue: true,
  },
  {
    item_id: "QN-PG18-SEAT-0210",
    asset_id: "V-247",
    content: "PG-18 gauge-bypass valve may not seat fully — observed weep during last isolation. Verify before energizing work on V-247.",
    input_type: "deviation_flag",
    submitted_by: "field-op-5521",
    submitted_at: "2026-06-12T07:30:00Z",
    reviewer_id: null,
    review_status: "pending",
    work_order_id: null,
    session_context: { document_id: "QN-PG18-SEAT-0210", entity: { text: "PG-18 not seating", entity_type: "deviation" } },
    sla_due_at: "2026-07-01T07:30:00Z",
    is_overdue: true,
  },
  {
    item_id: "QN-HX301-FOUL-0088",
    asset_id: "HX-301",
    content: "Elicitation response at WO closeout: 'cleaned tubes again, third time this quarter — water treatment upstream is the real problem'.",
    input_type: "elicitation_response",
    submitted_by: "field-op-7734",
    submitted_at: "2026-06-30T16:20:00Z",
    reviewer_id: null,
    review_status: "pending",
    work_order_id: "WO-87990",
    session_context: {
      document_id: "QN-HX301-FOUL-0088",
      questions: ["What did you do?", "Why did it fail?"],
      answers: ["Cleaned the tube bundle", "Feed-water hardness"],
    },
    sla_due_at: "2026-07-05T16:20:00Z",
    is_overdue: false,
  },
];

export const quarantineFixture: QuarantineResponse = {
  items: quarantine,
  total: quarantine.length,
  limit: 50,
  offset: 0,
  note: "All items are unverified field inputs — not reviewed by engineering authority.",
};
