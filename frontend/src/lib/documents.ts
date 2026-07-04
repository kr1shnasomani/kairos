import type { DocumentsResponse, VaultDocument } from "./types";

// Fixture vault documents — stand in for GET /documents/ while offline. Shape mirrors the live
// Supabase `documents` rows (backend/api/routers/documents.py). Curated to the P-101 / EQ-101 /
// V-247 / HX-301 story so the immutable-vault + supersede thesis reads in a demo.

const docs: VaultDocument[] = [
  {
    document_id: "OEM-BULL-MS44-r3", file_name: "seal_series_MS44_service_bulletin_r3.pdf",
    document_type: "oem_manual", authority_level: 3, source_system: "OEM_portal", vault_url: null,
    status: "active", ingested_at: "2026-05-02T10:15:00Z", ingested_by: "engineer@kairos.local",
    asset_links: ["P-101", "EQ-101"], mime_type: "application/pdf",
  },
  {
    document_id: "OEM-BULL-MS44-r2", file_name: "seal_series_MS44_service_bulletin_r2.pdf",
    document_type: "oem_manual", authority_level: 3, source_system: "OEM_portal", vault_url: null,
    status: "superseded", ingested_at: "2024-11-08T09:00:00Z", ingested_by: "engineer@kairos.local",
    version_chain: "OEM-BULL-MS44-r3", asset_links: ["P-101"], mime_type: "application/pdf",
  },
  {
    document_id: "DOC-P101-FAILURE-HIST", file_name: "P101_failure_history.pdf",
    document_type: "inspection_report", authority_level: 2, source_system: "SAP_PM", vault_url: null,
    status: "active", ingested_at: "2026-06-20T14:30:00Z", ingested_by: "reliability@kairos.local",
    asset_links: ["P-101", "EQ-101"], mime_type: "application/pdf",
  },
  {
    document_id: "TOPO-PL3-S2", file_name: "PL3_section2_isolation.pid.json",
    document_type: "pid_drawing", authority_level: 3, source_system: "manual_upload", vault_url: null,
    status: "active", ingested_at: "2026-04-05T08:45:00Z", ingested_by: "engineer@kairos.local",
    asset_links: ["V-247"], mime_type: "application/json",
  },
  {
    document_id: "SOP-HE-014", file_name: "heat_exchanger_operating_procedure_HE014.pdf",
    document_type: "procedure", authority_level: 4, source_system: "manual_upload", vault_url: null,
    status: "active", ingested_at: "2026-03-18T11:20:00Z", ingested_by: "engineer@kairos.local",
    asset_links: ["HX-301"], mime_type: "application/pdf",
  },
  {
    document_id: "OISD-117", file_name: "OISD_117_relief_and_isolation.pdf",
    document_type: "regulation", authority_level: 1, source_system: "regulatory_feed", vault_url: null,
    status: "active", ingested_at: "2026-01-10T00:00:00Z", ingested_by: "admin@kairos.local",
    asset_links: ["P-101", "V-247", "EQ-101"], mime_type: "application/pdf",
  },
];

export const documentsFixture: DocumentsResponse = {
  items: docs,
  total: docs.length,
  limit: 50,
  offset: 0,
};

export function getDocumentFixture(id: string): VaultDocument | null {
  return docs.find((d) => d.document_id.toLowerCase() === id.toLowerCase()) ?? null;
}
