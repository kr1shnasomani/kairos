-- Task 28: State-Based Push Suppression — plant operating states
CREATE TABLE IF NOT EXISTS plant_operating_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('normal', 'turnaround', 'shutdown', 'emergency')),
    set_by TEXT NOT NULL,
    set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);
-- Index for fast current-state lookups per site
CREATE INDEX IF NOT EXISTS idx_plant_operating_states_site_id_set_at
    ON plant_operating_states(site_id, set_at DESC);
