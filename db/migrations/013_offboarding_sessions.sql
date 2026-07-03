-- Migration 013: Off-Boarding Interview Series tables (Task 31)
CREATE TABLE IF NOT EXISTS offboarding_sessions (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    personnel_id         TEXT        NOT NULL,
    personnel_email      TEXT        NOT NULL,
    retirement_date      DATE        NOT NULL,
    total_sessions       INT         NOT NULL DEFAULT 6,
    session_interval_days INT        NOT NULL DEFAULT 12,
    status               TEXT        NOT NULL DEFAULT 'scheduled'
                             CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
    created_by           TEXT        NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offboarding_session_items (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id        UUID        NOT NULL REFERENCES offboarding_sessions(id) ON DELETE CASCADE,
    session_number    INT         NOT NULL,
    equipment_family  TEXT        NOT NULL,
    focus_failure_modes TEXT[]    DEFAULT '{}',
    status            TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','questions_ready','completed')),
    questions         JSONB       DEFAULT '[]',
    scheduled_for     TIMESTAMPTZ NOT NULL,
    completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_offboarding_session_items_session_id
    ON offboarding_session_items (session_id);
