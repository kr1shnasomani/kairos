-- Task 12: Add brief content columns missing from the initial schema.
-- Stores action_items, warnings, quarantine_flags, and event-specific IDs
-- as JSONB arrays / nullable text alongside the existing briefs row.

ALTER TABLE briefs
  ADD COLUMN IF NOT EXISTS action_items      JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS warnings          JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS quarantine_flags  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS work_order_id     TEXT,
  ADD COLUMN IF NOT EXISTS ptw_id            TEXT;
