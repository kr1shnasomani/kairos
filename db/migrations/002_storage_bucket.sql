-- =============================================================================
-- KAIROS — Storage Bucket Setup (Migration 002)
-- Run once against Supabase to create the immutable document vault bucket.
-- Applied: 2026-06-27
--
-- The kairos-vault bucket is the Layer 2 Immutable Evidence Vault.
-- It is PRIVATE — all access requires an authenticated signed URL.
-- File size limit: 500 MB (covers large P&IDs, engineering drawings).
-- =============================================================================

-- Create the vault bucket (private, not public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'kairos-vault',
    'kairos-vault',
    false,
    524288000,  -- 500 MB
    ARRAY[
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/tiff',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
        'application/octet-stream'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Storage RLS Policies
-- service_role bypasses RLS automatically — these policies cover the
-- anon and authenticated roles only (frontend direct upload flows).
-- =============================================================================

-- Service role: full access (used by the FastAPI backend)
CREATE POLICY "service_role_all"
    ON storage.objects
    FOR ALL
    TO service_role
    USING (bucket_id = 'kairos-vault');

-- Authenticated users: read vault documents (signed URL access)
CREATE POLICY "authenticated_read"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'kairos-vault');

-- Authenticated users: insert (for future direct upload flows)
CREATE POLICY "authenticated_insert"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'kairos-vault');
