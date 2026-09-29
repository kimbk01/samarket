-- DIBAY INTRO — Phase 2
-- Canonical physical DB / Storage / Security authority for app_intro_*.
--
-- Scope:
--   - additive app_intro_* schema
--   - RLS FORCE + service_role mutation boundary
--   - reuse private dibay-intro bucket (authority/v1/ layout by convention)
--   - inert singleton Live (NEVER_CONFIGURED → device NO_LIVE_INTRO)
--
-- Forbidden:
--   - Media processor / Admin Studio / Publish workflow / Device runtime
--   - historical dibay_intro_* / intro_* / opening_* mutation or import
--   - public or broad authenticated Storage write to sealed/packs/runtime
--
-- Replay-safe: IF NOT EXISTS / guarded DO blocks.
-- Apply via contained single-migration script only (NOT supabase db push).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. DOCUMENTS (mutable Draft envelope; IntroDocumentV1 JSONB remains SSOT)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_intro_documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  draft_version integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_documents_draft_version_positive CHECK (draft_version >= 1),
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  authority_generation integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_documents_authority_generation_positive CHECK (authority_generation >= 1),
  schema_version integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_documents_schema_version_positive CHECK (schema_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT app_intro_documents_document_object
    CHECK (jsonb_typeof(document) = 'object')
);

COMMENT ON TABLE public.app_intro_documents IS
  'Canonical Intro Draft envelope. Product SSOT is IntroDocumentV1 JSONB; no Scene/Layer tables.';

CREATE INDEX IF NOT EXISTS app_intro_documents_admin_list_idx
  ON public.app_intro_documents (updated_at DESC);

-- ---------------------------------------------------------------------------
-- 2. MEDIA LIBRARY (stable mediaId + lifecycle; no processor)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_intro_media (
  media_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_kind text NOT NULL
    CONSTRAINT app_intro_media_kind_check
      CHECK (media_kind IN ('IMAGE', 'LOGO', 'GIF')),
  status text NOT NULL DEFAULT 'CREATED'
    CONSTRAINT app_intro_media_status_check
      CHECK (status IN (
        'CREATED',
        'UPLOADING',
        'UPLOADED',
        'PROCESSING',
        'READY',
        'FAILED',
        'DELETING',
        'DELETED'
      )),
  original_name text NOT NULL DEFAULT '',
  mime text,
  byte_length bigint
    CONSTRAINT app_intro_media_byte_length_nonneg CHECK (byte_length IS NULL OR byte_length >= 0),
  width integer
    CONSTRAINT app_intro_media_width_positive CHECK (width IS NULL OR width > 0),
  height integer
    CONSTRAINT app_intro_media_height_positive CHECK (height IS NULL OR height > 0),
  source_integrity text,
  current_source_generation_id uuid,
  current_runtime_artifact_id uuid,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  deleted_at timestamptz,
  CONSTRAINT app_intro_media_no_partially_ready
    CHECK (status <> 'PARTIALLY_READY')
);

COMMENT ON TABLE public.app_intro_media IS
  'Shared Media Library identity (mediaId). PARTIALLY_READY forbidden. Processor not implemented in Phase 2.';

CREATE INDEX IF NOT EXISTS app_intro_media_admin_list_idx
  ON public.app_intro_media (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS app_intro_media_status_idx
  ON public.app_intro_media (status);

-- ---------------------------------------------------------------------------
-- 3. SOURCE GENERATIONS (immutable uploaded source identity)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_intro_source_generations (
  source_generation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL
    REFERENCES public.app_intro_media (media_id) ON DELETE RESTRICT,
  generation integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_source_generations_generation_positive CHECK (generation >= 1),
  storage_bucket text NOT NULL DEFAULT 'dibay-intro',
  storage_path text NOT NULL,
  byte_length bigint NOT NULL
    CONSTRAINT app_intro_source_generations_byte_length_nonneg CHECK (byte_length >= 0),
  integrity text NOT NULL,
  mime text,
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT app_intro_source_generations_storage_bucket_check
    CHECK (storage_bucket = 'dibay-intro'),
  CONSTRAINT app_intro_source_generations_path_prefix_check
    CHECK (storage_path LIKE 'authority/v1/source/%'),
  CONSTRAINT app_intro_source_generations_media_generation_uidx
    UNIQUE (media_id, generation)
);

COMMENT ON TABLE public.app_intro_source_generations IS
  'Immutable Library source generation. Path under authority/v1/source/.';

CREATE INDEX IF NOT EXISTS app_intro_source_generations_media_idx
  ON public.app_intro_source_generations (media_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. RUNTIME ARTIFACTS (immutable READY Library generation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_intro_runtime_artifacts (
  runtime_artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL
    REFERENCES public.app_intro_media (media_id) ON DELETE RESTRICT,
  source_generation_id uuid NOT NULL
    REFERENCES public.app_intro_source_generations (source_generation_id) ON DELETE RESTRICT,
  generation integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_runtime_artifacts_generation_positive CHECK (generation >= 1),
  process_recipe_version text NOT NULL DEFAULT '1',
  format text NOT NULL,
  width integer NOT NULL
    CONSTRAINT app_intro_runtime_artifacts_width_positive CHECK (width > 0),
  height integer NOT NULL
    CONSTRAINT app_intro_runtime_artifacts_height_positive CHECK (height > 0),
  byte_length bigint NOT NULL
    CONSTRAINT app_intro_runtime_artifacts_byte_length_nonneg CHECK (byte_length >= 0),
  integrity text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'dibay-intro',
  storage_path text NOT NULL,
  animation_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT app_intro_runtime_artifacts_storage_bucket_check
    CHECK (storage_bucket = 'dibay-intro'),
  CONSTRAINT app_intro_runtime_artifacts_path_prefix_check
    CHECK (storage_path LIKE 'authority/v1/runtime/%'),
  CONSTRAINT app_intro_runtime_artifacts_media_generation_uidx
    UNIQUE (media_id, generation),
  CONSTRAINT app_intro_runtime_artifacts_source_recipe_uidx
    UNIQUE (source_generation_id, process_recipe_version)
);

COMMENT ON TABLE public.app_intro_runtime_artifacts IS
  'Immutable READY Library runtime generation (runtimeArtifactId). GIF format may be CANONICAL_ANIMATED_GIF. No processor in Phase 2.';

CREATE INDEX IF NOT EXISTS app_intro_runtime_artifacts_lookup_idx
  ON public.app_intro_runtime_artifacts (media_id, created_at DESC);

-- Deferred media current-* FKs (avoid create-order cycles)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_intro_media_current_source_generation_fkey'
  ) THEN
    ALTER TABLE public.app_intro_media
      ADD CONSTRAINT app_intro_media_current_source_generation_fkey
      FOREIGN KEY (current_source_generation_id)
      REFERENCES public.app_intro_source_generations (source_generation_id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_intro_media_current_runtime_artifact_fkey'
  ) THEN
    ALTER TABLE public.app_intro_media
      ADD CONSTRAINT app_intro_media_current_runtime_artifact_fkey
      FOREIGN KEY (current_runtime_artifact_id)
      REFERENCES public.app_intro_runtime_artifacts (runtime_artifact_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. PUBLISH OPERATIONS (idempotent prepare/commit owner)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_intro_publish_operations (
  publish_operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL
    REFERENCES public.app_intro_documents (document_id) ON DELETE RESTRICT,
  source_draft_version integer NOT NULL
    CONSTRAINT app_intro_publish_operations_source_draft_version_positive
      CHECK (source_draft_version >= 1),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'PREPARING'
    CONSTRAINT app_intro_publish_operations_status_check
      CHECK (status IN ('PREPARING', 'READY_TO_COMMIT', 'COMMITTED', 'FAILED')),
  captured_document jsonb NOT NULL,
  captured_runtime_set jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT app_intro_publish_operations_idempotency_uidx
    UNIQUE (document_id, source_draft_version, idempotency_key),
  CONSTRAINT app_intro_publish_operations_captured_document_object
    CHECK (jsonb_typeof(captured_document) = 'object'),
  CONSTRAINT app_intro_publish_operations_captured_runtime_set_array
    CHECK (jsonb_typeof(captured_runtime_set) = 'array')
);

COMMENT ON TABLE public.app_intro_publish_operations IS
  'Idempotent Publish prepare/commit lifecycle. Same documentId+sourceDraftVersion+idempotencyKey cannot invent duplicate ops.';

CREATE INDEX IF NOT EXISTS app_intro_publish_operations_lookup_idx
  ON public.app_intro_publish_operations (document_id, source_draft_version, idempotency_key);

CREATE INDEX IF NOT EXISTS app_intro_publish_operations_status_idx
  ON public.app_intro_publish_operations (status, updated_at DESC);

-- ---------------------------------------------------------------------------
-- 6. REVISIONS (immutable committed revision authority)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_intro_revisions (
  published_revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL
    REFERENCES public.app_intro_documents (document_id) ON DELETE RESTRICT,
  publish_operation_id uuid NOT NULL
    REFERENCES public.app_intro_publish_operations (publish_operation_id) ON DELETE RESTRICT,
  source_draft_version integer NOT NULL
    CONSTRAINT app_intro_revisions_source_draft_version_positive CHECK (source_draft_version >= 1),
  publish_state text NOT NULL DEFAULT 'PREPARING'
    CONSTRAINT app_intro_revisions_publish_state_check
      CHECK (publish_state IN ('PREPARING', 'READY_TO_COMMIT', 'COMMITTED', 'FAILED')),
  document_snapshot jsonb NOT NULL,
  document_integrity text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_revisions_schema_version_positive CHECK (schema_version >= 1),
  protocol_version integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_revisions_protocol_version_positive CHECK (protocol_version >= 1),
  render_spec_version integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_revisions_render_spec_version_positive CHECK (render_spec_version >= 1),
  font_spec_version integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_revisions_font_spec_version_positive CHECK (font_spec_version >= 1),
  authority_generation integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_revisions_authority_generation_positive CHECK (authority_generation >= 1),
  pack_id uuid,
  manifest_integrity text,
  asset_set_integrity text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT app_intro_revisions_document_snapshot_object
    CHECK (jsonb_typeof(document_snapshot) = 'object'),
  CONSTRAINT app_intro_revisions_publish_operation_uidx
    UNIQUE (publish_operation_id),
  CONSTRAINT app_intro_revisions_committed_requires_pack
    CHECK (
      publish_state <> 'COMMITTED'
      OR (
        pack_id IS NOT NULL
        AND manifest_integrity IS NOT NULL
        AND asset_set_integrity IS NOT NULL
      )
    )
);

COMMENT ON TABLE public.app_intro_revisions IS
  'Immutable Published revision authority. Only COMMITTED is Live-eligible. No in-place mutation of product snapshot.';

CREATE INDEX IF NOT EXISTS app_intro_revisions_document_history_idx
  ON public.app_intro_revisions (document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_intro_revisions_publish_state_idx
  ON public.app_intro_revisions (publish_state);

-- ---------------------------------------------------------------------------
-- 7. SEALED ASSETS (immutable Published sealed bytes — survive Library lifecycle)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_intro_sealed_assets (
  sealed_asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  published_revision_id uuid NOT NULL
    REFERENCES public.app_intro_revisions (published_revision_id) ON DELETE RESTRICT,
  runtime_artifact_id uuid
    REFERENCES public.app_intro_runtime_artifacts (runtime_artifact_id) ON DELETE SET NULL,
  media_id uuid
    REFERENCES public.app_intro_media (media_id) ON DELETE SET NULL,
  media_ref_id text,
  format text NOT NULL,
  width integer NOT NULL
    CONSTRAINT app_intro_sealed_assets_width_positive CHECK (width > 0),
  height integer NOT NULL
    CONSTRAINT app_intro_sealed_assets_height_positive CHECK (height > 0),
  byte_length bigint NOT NULL
    CONSTRAINT app_intro_sealed_assets_byte_length_nonneg CHECK (byte_length >= 0),
  integrity text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'dibay-intro',
  storage_path text NOT NULL,
  animation_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_intro_sealed_assets_storage_bucket_check
    CHECK (storage_bucket = 'dibay-intro'),
  CONSTRAINT app_intro_sealed_assets_path_prefix_check
    CHECK (storage_path LIKE 'authority/v1/sealed/%'),
  CONSTRAINT app_intro_sealed_assets_path_uidx
    UNIQUE (storage_path),
  CONSTRAINT app_intro_sealed_assets_revision_integrity_uidx
    UNIQUE (published_revision_id, sealed_asset_id)
);

COMMENT ON TABLE public.app_intro_sealed_assets IS
  'Immutable sealedAssetId. Device authority = sealedAssetId + integrity. Library media delete must NOT destroy sealed history (ON DELETE SET NULL on media/runtime FKs). No overwrite semantics.';

CREATE INDEX IF NOT EXISTS app_intro_sealed_assets_lookup_idx
  ON public.app_intro_sealed_assets (sealed_asset_id);

CREATE INDEX IF NOT EXISTS app_intro_sealed_assets_revision_idx
  ON public.app_intro_sealed_assets (published_revision_id);

-- ---------------------------------------------------------------------------
-- 8. PACKS (immutable pack identity)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_intro_packs (
  pack_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  published_revision_id uuid NOT NULL
    REFERENCES public.app_intro_revisions (published_revision_id) ON DELETE RESTRICT,
  manifest_integrity text NOT NULL,
  document_integrity text NOT NULL,
  asset_set_integrity text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_packs_schema_version_positive CHECK (schema_version >= 1),
  protocol_version integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_packs_protocol_version_positive CHECK (protocol_version >= 1),
  render_spec_version integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_packs_render_spec_version_positive CHECK (render_spec_version >= 1),
  font_spec_version integer NOT NULL DEFAULT 1
    CONSTRAINT app_intro_packs_font_spec_version_positive CHECK (font_spec_version >= 1),
  storage_bucket text NOT NULL DEFAULT 'dibay-intro',
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_intro_packs_storage_bucket_check
    CHECK (storage_bucket = 'dibay-intro'),
  CONSTRAINT app_intro_packs_path_prefix_check
    CHECK (storage_path LIKE 'authority/v1/packs/%'),
  CONSTRAINT app_intro_packs_revision_uidx
    UNIQUE (published_revision_id),
  CONSTRAINT app_intro_packs_path_uidx
    UNIQUE (storage_path)
);

COMMENT ON TABLE public.app_intro_packs IS
  'Immutable pack identity binding committed revision + manifest/asset-set integrity. No pack builder in Phase 2.';

CREATE INDEX IF NOT EXISTS app_intro_packs_lookup_idx
  ON public.app_intro_packs (pack_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_intro_revisions_pack_id_fkey'
  ) THEN
    ALTER TABLE public.app_intro_revisions
      ADD CONSTRAINT app_intro_revisions_pack_id_fkey
      FOREIGN KEY (pack_id)
      REFERENCES public.app_intro_packs (pack_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. LIVE (singleton; distinguish NEVER_CONFIGURED vs NO_LIVE_INTRO vs COMMITTED)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_intro_live (
  singleton boolean PRIMARY KEY DEFAULT true
    CONSTRAINT app_intro_live_singleton_true CHECK (singleton = true),
  live_kind text NOT NULL DEFAULT 'NEVER_CONFIGURED'
    CONSTRAINT app_intro_live_kind_check
      CHECK (live_kind IN ('NEVER_CONFIGURED', 'NO_LIVE_INTRO', 'COMMITTED_LIVE')),
  published_revision_id uuid
    REFERENCES public.app_intro_revisions (published_revision_id) ON DELETE RESTRICT,
  pack_id uuid
    REFERENCES public.app_intro_packs (pack_id) ON DELETE RESTRICT,
  set_live_at timestamptz,
  set_live_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  disabled_at timestamptz,
  disabled_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_intro_live_kind_shape_check
    CHECK (
      (
        live_kind = 'NEVER_CONFIGURED'
        AND published_revision_id IS NULL
        AND pack_id IS NULL
        AND disabled_at IS NULL
      )
      OR (
        live_kind = 'NO_LIVE_INTRO'
        AND published_revision_id IS NULL
        AND pack_id IS NULL
        AND disabled_at IS NOT NULL
      )
      OR (
        live_kind = 'COMMITTED_LIVE'
        AND published_revision_id IS NOT NULL
        AND pack_id IS NOT NULL
        AND disabled_at IS NULL
      )
    )
);

COMMENT ON TABLE public.app_intro_live IS
  'Singleton canonical Live authority. NEVER_CONFIGURED and NO_LIVE_INTRO are distinct; both map to device NO_LIVE_INTRO. No historical Live import.';

-- Inert initial canonical state (zero-live). Replay-safe.
INSERT INTO public.app_intro_live (
  singleton,
  live_kind,
  published_revision_id,
  pack_id,
  set_live_at,
  set_live_by,
  disabled_at,
  disabled_by,
  updated_at
)
VALUES (
  true,
  'NEVER_CONFIGURED',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  now()
)
ON CONFLICT (singleton) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. RLS / GRANTS — service_role mutation boundary (no client table policies)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_intro_documents',
    'app_intro_media',
    'app_intro_source_generations',
    'app_intro_runtime_artifacts',
    'app_intro_publish_operations',
    'app_intro_revisions',
    'app_intro_sealed_assets',
    'app_intro_packs',
    'app_intro_live'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 11. STORAGE — reuse private dibay-intro; no client write policies for authority
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('dibay-intro', 'dibay-intro', false, 52428800)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = COALESCE(storage.buckets.file_size_limit, 52428800);

-- Keep bucket private even if a prior row drifted.
UPDATE storage.buckets
SET public = false
WHERE id = 'dibay-intro' AND public IS DISTINCT FROM false;

-- Intentionally no storage.objects policy rows for dibay-intro / authority/v1/.
-- Client access remains default-deny under storage RLS.
-- Mutations / signed capabilities are server service_role authorized only.
-- Historical root objects remain untouched / non-authority.
-- Canonical subspaces (convention; no attempt-number namespace):
--   authority/v1/source/
--   authority/v1/tmp/          -- processing scratch only; never runtime authority
--   authority/v1/runtime/
--   authority/v1/sealed/
--   authority/v1/packs/

COMMIT;
