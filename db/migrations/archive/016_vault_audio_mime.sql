-- 016_vault_audio_mime.sql
-- Allow voice-note audio uploads into the immutable vault bucket.
-- The elicitation voice endpoint stores field recordings in `kairos-vault`, but the
-- bucket's allowed_mime_types omitted audio, so every voice note failed with
-- "invalid_mime_type" (frontend records audio/webm; the demo dataset uses audio/mpeg).
-- Idempotent: the guard skips the append if audio is already allowed.

UPDATE storage.buckets
SET allowed_mime_types = allowed_mime_types
    || ARRAY['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/ogg']
WHERE id = 'kairos-vault'
  AND NOT (allowed_mime_types @> ARRAY['audio/webm']);
