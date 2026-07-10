-- =============================================================================
-- KAIROS — Supabase test-data purge
-- =============================================================================
-- Deletes integration-test residue only. Canonical/demo data is never matched.
-- Test-id prefixes are minted by tests/ (see tests/conftest.py):
--   assets  : ASSET-TEST-%  ASSET-DEDUP-%  ASSET-EV-%  ASSET-ACK-%
--   work ord: WO-ATTR-%  WO-GO-%  WO-RESP-%  WO-VOICE-%  WO-TEST-%
--   docs    : DOC-INSP-%  DOC-X%
--
-- FK-safe: every child of assets/documents/briefs/knowledge_conflicts is deleted
-- before its parent. `assets.parent_asset_id` is ON DELETE NO ACTION (no cascade),
-- so a prefix filter can only ever remove the rows it names.
--
-- The Python equivalent (run in-container) is backend/scripts/purge_test_data.py
-- (`make purge-test-data`), which also clears Neo4j + Elasticsearch.
--
-- Applied via Supabase MCP on 2026-07-10 — removed ~421 rows (see db/maintenance/CHANGELOG.md).
-- =============================================================================
DO $$
DECLARE
  a text[] := ARRAY['ASSET-TEST-%','ASSET-DEDUP-%','ASSET-EV-%','ASSET-ACK-%'];
  w text[] := ARRAY['WO-ATTR-%','WO-GO-%','WO-RESP-%','WO-VOICE-%','WO-TEST-%'];
  d text[] := ARRAY['DOC-INSP-%','DOC-X%'];
BEGIN
  DELETE FROM brief_feedback   WHERE brief_id IN (SELECT brief_id FROM briefs WHERE asset_id LIKE ANY(a));
  DELETE FROM moc_items        WHERE asset_id LIKE ANY(a)
                                  OR conflict_id IN (SELECT conflict_id FROM knowledge_conflicts WHERE asset_id LIKE ANY(a));
  DELETE FROM document_asset_links WHERE asset_id LIKE ANY(a) OR document_id LIKE ANY(d);
  DELETE FROM extraction_jobs   WHERE document_id LIKE ANY(d);
  DELETE FROM ner_annotations   WHERE document_id LIKE ANY(d);
  DELETE FROM validation_corpus WHERE document_id LIKE ANY(d);
  DELETE FROM elicitation_sessions WHERE asset_id LIKE ANY(a);
  DELETE FROM quarantine_items  WHERE asset_id LIKE ANY(a) OR work_order_id LIKE ANY(w);
  DELETE FROM knowledge_conflicts WHERE asset_id LIKE ANY(a);
  DELETE FROM briefs            WHERE asset_id LIKE ANY(a);
  DELETE FROM operational_events WHERE asset_id LIKE ANY(a);
  DELETE FROM asset_alias_map   WHERE canonical_asset_id LIKE ANY(a);
  DELETE FROM documents         WHERE document_id LIKE ANY(d);
  DELETE FROM assets            WHERE asset_id LIKE ANY(a);
END $$;
