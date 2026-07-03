// Fixture compliance data — stands in for GET /compliance/gaps + /dashboard while offline.
// Frameworks seeded per MEMORY: OISD-117 + ISO 45001.

export type GapStatus = "open" | "covered" | "blocked";
export type GapSeverity = "high" | "medium" | "low";

export interface ComplianceGap {
  gap_id: string;
  framework: string;
  clause: string;
  requirement: string;
  asset_id: string;
  status: GapStatus;
  severity: GapSeverity;
}

export interface ComplianceSummary {
  total: number;
  open: number;
  covered: number;
  blocked: number;
  frameworks: string[];
  audit_ready_pct: number;
  gaps: ComplianceGap[];
}

export const complianceSummary: ComplianceSummary = {
  total: 18,
  open: 7,
  covered: 9,
  blocked: 2,
  frameworks: ["OISD-117", "ISO 45001"],
  audit_ready_pct: 61,
  gaps: [
    { gap_id: "G-01", framework: "OISD-117", clause: "6.4", requirement: "Relief-device set pressure documented and current", asset_id: "P-101", status: "blocked", severity: "high" },
    { gap_id: "G-02", framework: "OISD-117", clause: "7.2", requirement: "Seal replacement records for rotating equipment", asset_id: "EQ-101", status: "open", severity: "high" },
    { gap_id: "G-03", framework: "OISD-117", clause: "9.1", requirement: "Isolation procedure verified against current P&ID", asset_id: "V-247", status: "open", severity: "medium" },
    { gap_id: "G-04", framework: "OISD-117", clause: "4.3", requirement: "Inspection interval within regulatory limit", asset_id: "HX-301", status: "covered", severity: "medium" },
    { gap_id: "G-05", framework: "ISO 45001", clause: "8.1.2", requirement: "Hazard elimination evidence for confined-space work", asset_id: "V-247", status: "open", severity: "high" },
    { gap_id: "G-06", framework: "ISO 45001", clause: "7.5", requirement: "Documented information controlled and versioned", asset_id: "EQ-101", status: "covered", severity: "low" },
    { gap_id: "G-07", framework: "ISO 45001", clause: "9.1.1", requirement: "Monitoring records for operational controls", asset_id: "P-101", status: "blocked", severity: "medium" },
    { gap_id: "G-08", framework: "ISO 45001", clause: "10.2", requirement: "Nonconformity and corrective-action tracking", asset_id: "HX-301", status: "open", severity: "low" },
  ],
};
