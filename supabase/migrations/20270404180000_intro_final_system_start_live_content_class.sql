-- DIBAY INTRO FINAL — System Start live generation + document content_class
-- Layer B live-configurable System Start (not OS binary mutation).

ALTER TABLE public.app_intro_documents
  ADD COLUMN IF NOT EXISTS content_class text NOT NULL DEFAULT 'OWNER';

ALTER TABLE public.app_intro_documents
  DROP CONSTRAINT IF EXISTS app_intro_documents_content_class_check;

ALTER TABLE public.app_intro_documents
  ADD CONSTRAINT app_intro_documents_content_class_check
  CHECK (content_class IN ('OWNER', 'QA', 'SYSTEM'));

COMMENT ON COLUMN public.app_intro_documents.content_class IS
  'Operator classification authority: OWNER | QA | SYSTEM. Not title-regex.';

-- One-time backfill: title-regex helper only (classifyIntroTitle parity). Does not touch live pointer.
UPDATE public.app_intro_documents
SET content_class = 'SYSTEM'
WHERE content_class = 'OWNER'
  AND (
    title ~* '^SYSTEM[-_]'
    OR title ~* '^SYS[-_]TEST'
    OR title ~* '__FIXTURE__'
  );

UPDATE public.app_intro_documents
SET content_class = 'QA'
WHERE content_class = 'OWNER'
  AND (
    title ~* '^DIBAY-13-V'
    OR title ~* '^DIBAY-13-FINAL'
    OR title ~* '^CUTA-BROWSER-QA'
    OR title ~* '^CUT\s*A\b'
    OR title ~* '\mProve\M'
    OR title ~* '^409RCV'
    OR title ~* 'OWNER-MARKER'
    OR title ~* '^QA[-_]'
    OR title ~* '^TEST[-_]'
    OR title ~* 'BROWSER-QA'
    OR title ~* '-QA-'
  );

-- Expand System Start durable draft for Layer B (bg image + brand position).
ALTER TABLE public.app_system_start_config
  ADD COLUMN IF NOT EXISTS background_image_media_id uuid NULL;

ALTER TABLE public.app_system_start_config
  ADD COLUMN IF NOT EXISTS brand_x_norm double precision NOT NULL DEFAULT 0.5;

ALTER TABLE public.app_system_start_config
  ADD COLUMN IF NOT EXISTS brand_y_norm double precision NOT NULL DEFAULT 0.5;

ALTER TABLE public.app_system_start_config
  DROP CONSTRAINT IF EXISTS app_system_start_config_brand_xy;

ALTER TABLE public.app_system_start_config
  ADD CONSTRAINT app_system_start_config_brand_xy
  CHECK (
    brand_x_norm >= 0 AND brand_x_norm <= 1
    AND brand_y_norm >= 0 AND brand_y_norm <= 1
  );

-- Live System Start generation (Apply → immutable generation → device).
CREATE TABLE IF NOT EXISTS public.app_system_start_live (
  singleton boolean PRIMARY KEY DEFAULT true,
  CONSTRAINT app_system_start_live_singleton CHECK (singleton = true),
  live_kind text NOT NULL DEFAULT 'NEVER_CONFIGURED',
  CONSTRAINT app_system_start_live_kind_check
    CHECK (live_kind IN ('NEVER_CONFIGURED', 'NO_LIVE', 'COMMITTED_LIVE')),
  generation_id uuid NULL,
  source_revision integer NULL,
  config jsonb NULL,
  package_integrity text NULL,
  storage_bucket text NULL,
  storage_path text NULL,
  set_live_at timestamptz NULL,
  set_live_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_system_start_live IS
  'DIBAY System Start Layer B live pointer. Device reads verified local copy of generation.';

INSERT INTO public.app_system_start_live (singleton, live_kind)
VALUES (true, 'NEVER_CONFIGURED')
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.app_system_start_live ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_system_start_live FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_system_start_live FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.app_system_start_live TO service_role;

-- Media operator display name (storage key unchanged).
ALTER TABLE public.app_intro_media
  ADD COLUMN IF NOT EXISTS display_name text NULL;
