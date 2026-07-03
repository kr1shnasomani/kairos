-- knowledge_conflicts: escalation tracking columns
ALTER TABLE knowledge_conflicts
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_to TEXT;

-- quarantine_items: SLA + escalation tracking
-- DEFAULT covers all existing insert sites; deviation_flag handler overrides to 24h
ALTER TABLE quarantine_items
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 days'),
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
