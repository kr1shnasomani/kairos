-- Migration 014: validation corpus for Layer 0 model gate
-- Each row is a verified ground-truth entity from human promotion or annotation correction.
CREATE TABLE IF NOT EXISTS validation_corpus (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  TEXT        NOT NULL,
    entity_text  TEXT        NOT NULL,
    entity_type  TEXT        NOT NULL,
    span_start   INT,
    span_end     INT,
    authority    TEXT        NOT NULL CHECK (authority IN ('human_promotion', 'annotation_correction')),
    promoted_by  TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validation_corpus_entity_type ON validation_corpus (entity_type);
CREATE INDEX IF NOT EXISTS idx_validation_corpus_document_id ON validation_corpus (document_id);
