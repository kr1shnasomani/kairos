import type { ComplianceGap, ComplianceGapsResponse } from "./types";

// Fixture compliance data — stands in for GET /compliance/gaps while offline.
// Shape mirrors the live endpoint (backend/api/routers/compliance.py): each item is a detected
// gap (an asset + regulation with no verified procedure edge). severity is derived from the
// regulation's authority_level: 1→critical, 2→major, else minor. There is no "covered" state —
// coverage means the gap simply does not appear. Frameworks use backend IDs (underscores).

const gaps: ComplianceGap[] = [
  { concept_id: "REG-OISD-6.4", framework: "OISD_117", clause_id: "6.4", requirement_text: "Relief-device set pressure documented and current", authority_level: 1, asset_id: "P-101", equipment_class: "Centrifugal pump", severity: "critical" },
  { concept_id: "REG-OISD-9.1", framework: "OISD_117", clause_id: "9.1", requirement_text: "Isolation procedure verified against current P&ID", authority_level: 1, asset_id: "V-247", equipment_class: "Control valve", severity: "critical" },
  { concept_id: "REG-OISD-7.2", framework: "OISD_117", clause_id: "7.2", requirement_text: "Seal replacement records for rotating equipment", authority_level: 2, asset_id: "EQ-101", equipment_class: "Rotating equipment", severity: "major" },
  { concept_id: "REG-OISD-4.3", framework: "OISD_117", clause_id: "4.3", requirement_text: "Inspection interval within regulatory limit", authority_level: 2, asset_id: "HX-301", equipment_class: "Shell-and-tube exchanger", severity: "major" },
  { concept_id: "REG-ISO-8.1.2", framework: "ISO_45001", clause_id: "8.1.2", requirement_text: "Hazard elimination evidence for confined-space work", authority_level: 1, asset_id: "V-247", equipment_class: "Control valve", severity: "critical" },
  { concept_id: "REG-ISO-9.1.1", framework: "ISO_45001", clause_id: "9.1.1", requirement_text: "Monitoring records for operational controls", authority_level: 2, asset_id: "P-101", equipment_class: "Centrifugal pump", severity: "major" },
  { concept_id: "REG-ISO-7.5", framework: "ISO_45001", clause_id: "7.5", requirement_text: "Documented information controlled and versioned", authority_level: 3, asset_id: "EQ-101", equipment_class: "Rotating equipment", severity: "minor" },
  { concept_id: "REG-ISO-10.2", framework: "ISO_45001", clause_id: "10.2", requirement_text: "Nonconformity and corrective-action tracking", authority_level: 3, asset_id: "HX-301", equipment_class: "Shell-and-tube exchanger", severity: "minor" },
];

export const complianceFixture: ComplianceGapsResponse = {
  items: gaps,
  total: gaps.length,
  limit: 100,
  offset: 0,
  framework: null,
  last_scan: "demo",
};
