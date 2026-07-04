-- Task 15: Elicitation Engine session storage.
-- Tracks micro-interview state from workflow trigger through question delivery
-- and response collection. Questions are graph-derived via MicroInterviewWorkflow.

CREATE TABLE IF NOT EXISTS elicitation_sessions (
    session_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_order_id   TEXT NOT NULL,
    asset_id        TEXT REFERENCES assets(asset_id),
    questions       JSONB NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'questions_ready', 'completed')),
    triggered_by    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_elicitation_work_order ON elicitation_sessions(work_order_id);
