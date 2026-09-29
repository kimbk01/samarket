-- DIBAY INTRO — System Start durable singleton SSOT (V1 corrective)
-- Authority: app_system_start_config ONLY.
-- config/system-start.build.json becomes DERIVED build input (not durable write).
-- Replay-safe.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_system_start_config (
  id smallint PRIMARY KEY DEFAULT 1
    CONSTRAINT app_system_start_config_singleton CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 1
    CONSTRAINT app_system_start_config_revision_positive CHECK (revision >= 1),
  background_color text NOT NULL DEFAULT '#312E81'
    CONSTRAINT app_system_start_config_bg_hex
      CHECK (background_color ~ '^#[0-9A-F]{6}$'),
  brand_asset_enabled boolean NOT NULL DEFAULT false,
  brand_asset_media_id uuid
    REFERENCES public.app_intro_media (media_id) ON DELETE SET NULL,
  brand_size_preset text NOT NULL DEFAULT 'M'
    CONSTRAINT app_system_start_config_size_preset
      CHECK (brand_size_preset IN ('S', 'M', 'L')),
  min_visible_ms integer NOT NULL DEFAULT 500
    CONSTRAINT app_system_start_config_min_visible
      CHECK (min_visible_ms >= 500 AND min_visible_ms <= 5000),
  -- Last stamped by native build materializer (installed binary projection)
  materialized_revision bigint
    CONSTRAINT app_system_start_config_mat_revision_positive
      CHECK (materialized_revision IS NULL OR materialized_revision >= 1),
  materialized_background_color text
    CONSTRAINT app_system_start_config_mat_bg_hex
      CHECK (
        materialized_background_color IS NULL
        OR materialized_background_color ~ '^#[0-9A-F]{6}$'
      ),
  materialized_brand_asset_enabled boolean,
  materialized_brand_asset_media_id uuid
    REFERENCES public.app_intro_media (media_id) ON DELETE SET NULL,
  materialized_brand_size_preset text
    CONSTRAINT app_system_start_config_mat_size
      CHECK (
        materialized_brand_size_preset IS NULL
        OR materialized_brand_size_preset IN ('S', 'M', 'L')
      ),
  materialized_min_visible_ms integer
    CONSTRAINT app_system_start_config_mat_min
      CHECK (
        materialized_min_visible_ms IS NULL
        OR (
          materialized_min_visible_ms >= 500
          AND materialized_min_visible_ms <= 5000
        )
      ),
  materialized_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT app_system_start_config_brand_requires_media
    CHECK (
      brand_asset_enabled = false
      OR brand_asset_media_id IS NOT NULL
    )
);

COMMENT ON TABLE public.app_system_start_config IS
  'Singleton System Start durable SSOT. Build-bound; not Live CMS. FS JSON is derived only.';

INSERT INTO public.app_system_start_config (
  id,
  revision,
  background_color,
  brand_asset_enabled,
  brand_asset_media_id,
  brand_size_preset,
  min_visible_ms
)
VALUES (1, 1, '#312E81', false, NULL, 'M', 500)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_system_start_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_system_start_config FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_system_start_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.app_system_start_config TO service_role;

COMMIT;
