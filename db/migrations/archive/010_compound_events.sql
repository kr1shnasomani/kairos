-- Task 27: Event Correlation — compound_event_id links correlated events across source systems
ALTER TABLE operational_events ADD COLUMN IF NOT EXISTS compound_event_id UUID;
CREATE INDEX IF NOT EXISTS idx_operational_events_compound_event_id
    ON operational_events(compound_event_id) WHERE compound_event_id IS NOT NULL;
