-- DIBAY R15 Startup Presentation Phase 1.
-- Minimal vertical slice only: one System Start document, immutable generations, R15 media.

BEGIN;

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'r15-startup-media',
  'r15-startup-media',
  true,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.r15_startup_documents (
  id boolean PRIMARY KEY DEFAULT true,
  draft_document jsonb NOT NULL,
  draft_version integer NOT NULL DEFAULT 1,
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT r15_startup_documents_singleton CHECK (id = true),
  CONSTRAINT r15_startup_documents_schema CHECK ((draft_document->>'schemaVersion')::integer = 1),
  CONSTRAINT r15_startup_documents_system_start CHECK (jsonb_typeof(draft_document->'systemStart') = 'object')
);

CREATE TABLE IF NOT EXISTS public.r15_startup_media (
  asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE,
  public_url text NOT NULL,
  mime_type text NOT NULL,
  byte_length integer NOT NULL CHECK (byte_length > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT r15_startup_media_path CHECK (storage_path LIKE 'draft/%' OR storage_path LIKE 'generations/%')
);

CREATE TABLE IF NOT EXISTS public.r15_startup_generations (
  generation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_hash text NOT NULL CHECK (document_hash ~ '^[0-9a-f]{64}$'),
  manifest jsonb NOT NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT false,
  CONSTRAINT r15_startup_generations_schema CHECK ((manifest->>'schemaVersion')::integer = 1),
  CONSTRAINT r15_startup_generations_manifest_generation CHECK ((manifest->>'generationId')::uuid = generation_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS r15_startup_generations_one_current
  ON public.r15_startup_generations (is_current)
  WHERE is_current;

ALTER TABLE public.r15_startup_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.r15_startup_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.r15_startup_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.r15_startup_media FORCE ROW LEVEL SECURITY;
ALTER TABLE public.r15_startup_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.r15_startup_generations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.r15_startup_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.r15_startup_media FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.r15_startup_generations FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.r15_startup_documents TO service_role;
GRANT ALL ON TABLE public.r15_startup_media TO service_role;
GRANT ALL ON TABLE public.r15_startup_generations TO service_role;
GRANT SELECT ON TABLE public.r15_startup_generations TO anon, authenticated;

DROP POLICY IF EXISTS r15_startup_generations_public_current_select ON public.r15_startup_generations;
CREATE POLICY r15_startup_generations_public_current_select
  ON public.r15_startup_generations
  FOR SELECT
  TO anon, authenticated
  USING (is_current = true);

DROP POLICY IF EXISTS r15_startup_media_admin_select ON storage.objects;
CREATE POLICY r15_startup_media_admin_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'r15-startup-media'
    AND public.is_platform_admin(auth.uid())
  );

COMMIT;
