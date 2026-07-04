-- =============================================================================
-- KAIROS — Migration 006: NER Annotation Interface (Layer 3 Active Learning)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ner_annotations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     TEXT NOT NULL REFERENCES documents(document_id),
    entity_text     TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    corrected_type  TEXT,
    is_correct      BOOLEAN NOT NULL,
    span_start      INTEGER,
    span_end        INTEGER,
    annotated_by    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ner_annotations_document ON ner_annotations(document_id);
CREATE INDEX idx_ner_annotations_created  ON ner_annotations(created_at DESC);
CREATE INDEX idx_ner_annotations_type     ON ner_annotations(corrected_type) WHERE is_correct = FALSE;
