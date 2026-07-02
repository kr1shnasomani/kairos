-- Migration 012: add event_subtype column to operational_events
-- Populated as 'recurring' when a recurring_failure_detected event is ingested; NULL otherwise.
ALTER TABLE operational_events ADD COLUMN IF NOT EXISTS event_subtype TEXT;
