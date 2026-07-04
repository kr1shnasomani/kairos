-- =============================================================================
-- KAIROS — Migration 008: Brief Freeze for Physical Deviation Flags (Layer 6/8)
-- =============================================================================

ALTER TABLE briefs
    ADD COLUMN IF NOT EXISTS delivery_frozen BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_briefs_frozen_asset ON briefs(asset_id, delivery_frozen)
    WHERE delivery_frozen = TRUE;
