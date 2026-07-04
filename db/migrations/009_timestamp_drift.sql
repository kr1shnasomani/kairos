-- Task 24: Timestamp normalization
-- occurred_at: source document timestamp (may differ from ingested_at due to clock drift)
-- timestamp_drift_detected: flagged when |occurred_at - ingested_at| > TIMESTAMP_DRIFT_TOLERANCE_MINUTES
ALTER TABLE documents ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;
ALTER TABLE extraction_jobs ADD COLUMN IF NOT EXISTS timestamp_drift_detected BOOLEAN NOT NULL DEFAULT FALSE;
