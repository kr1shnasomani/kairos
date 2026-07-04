-- =============================================================================
-- KAIROS — Migration 007: SPC Circuit Breaker (Layer 7)
-- =============================================================================

CREATE TABLE IF NOT EXISTS extraction_overrides (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_class   TEXT NOT NULL,
    document_id   TEXT,
    override_type TEXT NOT NULL CHECK (override_type IN ('manual_correction', 'quarantine_rejection', 'annotation_correction')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_overrides_class_time ON extraction_overrides(asset_class, created_at DESC);
