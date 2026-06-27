-- Task 14: Enable Row-Level Security on briefs and quarantine_items.
-- Service-role key bypasses RLS (server-side API); policies apply to
-- client SDK calls (future frontend / mobile) using the anon/user key.

ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarantine_items ENABLE ROW LEVEL SECURITY;

-- Each authenticated user sees only briefs addressed to them.
CREATE POLICY briefs_recipient_isolation ON briefs
  FOR ALL TO authenticated
  USING (recipient_user_id = auth.uid()::text);

-- Quarantine items are visible to the submitter or any admin.
CREATE POLICY quarantine_submitter_isolation ON quarantine_items
  FOR ALL TO authenticated
  USING (
    submitted_by = auth.uid()::text
    OR (auth.jwt() ->> 'role') = 'admin'
  );
