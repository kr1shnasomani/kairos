-- =============================================================================
-- KAIROS — Supabase PostgreSQL Schema
-- Initial migration: all core tables
-- Run when Supabase project is configured: supabase db push
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Assets — MDM backbone (mirrors Neo4j, used for relational queries)
-- =============================================================================
CREATE TABLE IF NOT EXISTS assets (
    asset_id        TEXT PRIMARY KEY,
    tag_number      TEXT NOT NULL,
    name            TEXT NOT NULL,
    equipment_class TEXT NOT NULL,
    criticality     TEXT NOT NULL CHECK (criticality IN ('safety_critical', 'critical', 'non_critical')),
    site_id         TEXT NOT NULL,
    facility_id     TEXT NOT NULL,
    parent_asset_id TEXT REFERENCES assets(asset_id),
    eam_source      TEXT NOT NULL DEFAULT 'manual',
    identity_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    identity_confirmed_by TEXT,
    identity_confirmed_at TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'decommissioned', 'under_review')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_site ON assets(site_id);
CREATE INDEX idx_assets_class ON assets(equipment_class);
CREATE INDEX idx_assets_tag ON assets(tag_number);

-- =============================================================================
-- Asset Alias Map — Tag alias resolution (Layer 1)
-- =============================================================================
CREATE TABLE IF NOT EXISTS asset_alias_map (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_asset_id TEXT NOT NULL REFERENCES assets(asset_id),
    alias           TEXT NOT NULL,
    alias_source    TEXT NOT NULL,
    confidence      NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_by    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (alias)
);

-- =============================================================================
-- Documents — Immutable vault registry (Layer 2)
-- =============================================================================
CREATE TABLE IF NOT EXISTS documents (
    document_id     TEXT PRIMARY KEY,
    sha256_hash     TEXT NOT NULL UNIQUE,
    file_name       TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type       TEXT NOT NULL,
    document_type   TEXT NOT NULL,
    authority_level INTEGER NOT NULL CHECK (authority_level BETWEEN 1 AND 5),
    source_system   TEXT NOT NULL,
    vault_url       TEXT,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived', 'disputed')),
    version_chain   TEXT REFERENCES documents(document_id),
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ingested_by     TEXT NOT NULL
);

CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_authority ON documents(authority_level);

-- Document → Asset links
CREATE TABLE IF NOT EXISTS document_asset_links (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id TEXT NOT NULL REFERENCES documents(document_id),
    asset_id    TEXT NOT NULL REFERENCES assets(asset_id),
    linked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, asset_id)
);

-- =============================================================================
-- Extraction Pipeline — Job status tracking (Layer 3)
-- =============================================================================
CREATE TABLE IF NOT EXISTS extraction_jobs (
    job_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     TEXT NOT NULL REFERENCES documents(document_id),
    pipeline_stage  TEXT NOT NULL DEFAULT 'queued',
    progress_pct    INTEGER NOT NULL DEFAULT 0,
    ocr_confidence  NUMERIC(4,3),
    entity_count    INTEGER,
    graph_edges     INTEGER,
    review_pending  INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Operational Events — Layer 8 event log
-- =============================================================================
CREATE TABLE IF NOT EXISTS operational_events (
    event_id        TEXT PRIMARY KEY,
    event_type      TEXT NOT NULL,
    source_system   TEXT NOT NULL,
    site_id         TEXT NOT NULL,
    asset_id        TEXT REFERENCES assets(asset_id),
    payload         JSONB NOT NULL DEFAULT '{}',
    occurred_at     TIMESTAMPTZ NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    redis_stream_id TEXT
);

CREATE INDEX idx_events_type ON operational_events(event_type);
CREATE INDEX idx_events_asset ON operational_events(asset_id);
CREATE INDEX idx_events_occurred ON operational_events(occurred_at DESC);

-- =============================================================================
-- Proactive Briefs — Layer 8 delivery log
-- =============================================================================
CREATE TABLE IF NOT EXISTS briefs (
    brief_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_event_id TEXT,
    trigger_event_type TEXT NOT NULL,
    asset_id        TEXT REFERENCES assets(asset_id),
    recipient_user_id TEXT NOT NULL,
    priority        TEXT NOT NULL DEFAULT 'normal',
    headline        TEXT NOT NULL,
    body            TEXT NOT NULL,
    sources         JSONB NOT NULL DEFAULT '[]',
    confidence      NUMERIC(4,3),
    requires_countersignature BOOLEAN NOT NULL DEFAULT FALSE,
    delivered_at    TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    countersigned_by TEXT,
    countersigned_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_briefs_recipient ON briefs(recipient_user_id);
CREATE INDEX idx_briefs_asset ON briefs(asset_id);
CREATE INDEX idx_briefs_delivered ON briefs(delivered_at);

-- Brief feedback (Phase 2)
CREATE TABLE IF NOT EXISTS brief_feedback (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brief_id    UUID NOT NULL REFERENCES briefs(brief_id),
    rating      TEXT NOT NULL CHECK (rating IN ('accurate', 'missing_context', 'incorrect')),
    notes       TEXT,
    submitted_by TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Governance — Conflicts (Layer 7)
-- =============================================================================
CREATE TABLE IF NOT EXISTS knowledge_conflicts (
    conflict_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    track           TEXT NOT NULL CHECK (track IN ('administrative', 'engineering')),
    asset_id        TEXT REFERENCES assets(asset_id),
    parameter       TEXT NOT NULL,
    source_a        JSONB NOT NULL,
    source_b        JSONB NOT NULL,
    authority_a     INTEGER,
    authority_b     INTEGER,
    severity        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending_moc', 'resolved')),
    sla_deadline    TIMESTAMPTZ,
    resolved_by     TEXT,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conflicts_status ON knowledge_conflicts(status);
CREATE INDEX idx_conflicts_asset ON knowledge_conflicts(asset_id);

-- =============================================================================
-- Quarantine Layer — Unverified knowledge (Layer 6)
-- =============================================================================
CREATE TABLE IF NOT EXISTS quarantine_items (
    item_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id        TEXT REFERENCES assets(asset_id),
    content         TEXT NOT NULL,
    input_type      TEXT NOT NULL CHECK (input_type IN ('field_observation', 'voice_note', 'elicitation_response', 'deviation_flag')),
    submitted_by    TEXT NOT NULL,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewer_id     TEXT,
    review_status   TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'promoted', 'disputed', 'archived')),
    reviewed_at     TIMESTAMPTZ,
    work_order_id   TEXT,
    session_context JSONB DEFAULT '{}'
);

CREATE INDEX idx_quarantine_status ON quarantine_items(review_status);
CREATE INDEX idx_quarantine_asset ON quarantine_items(asset_id);

-- =============================================================================
-- MoC — Management of Change (Layer 7)
-- =============================================================================
CREATE TABLE IF NOT EXISTS moc_items (
    moc_id          TEXT PRIMARY KEY,
    conflict_id     UUID REFERENCES knowledge_conflicts(conflict_id),
    asset_id        TEXT REFERENCES assets(asset_id),
    description     TEXT NOT NULL,
    conflicting_sources JSONB NOT NULL DEFAULT '[]',
    blast_radius    JSONB NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected')),
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,
    webhook_received_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Audit Log — Immutable record of all significant actions
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    action          TEXT NOT NULL,
    entity_type     TEXT,
    entity_id       TEXT,
    performed_by    TEXT NOT NULL,
    details         JSONB DEFAULT '{}',
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC);

-- =============================================================================
-- Row-Level Security — Enable for Supabase (configure policies per role)
-- =============================================================================
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarantine_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
