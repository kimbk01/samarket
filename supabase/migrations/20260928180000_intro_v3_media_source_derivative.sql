-- INTRO V3-0 / V3-1 — additive SOURCE / DERIVATIVE media tables.
-- Does NOT mutate intro_assets, intro_scenes, intro_publications, or Product Intro V1.
-- Does NOT DROP or rewrite immutable publication history.

BEGIN;

CREATE TABLE IF NOT EXISTS public.intro_v3_media_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  mime text NOT NULL,
  width integer,
  height integer,
  aspect double precision,
  bytes bigint,
  orientation_deg integer NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  public_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  error_code text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intro_v3_media_sources_storage_path_persistable
    CHECK (public.intro_v2_persistable_ref_ok(storage_path)),
  CONSTRAINT intro_v3_media_sources_public_url_persistable
    CHECK (public_url IS NULL OR public.intro_v2_persistable_ref_ok(public_url))
);

CREATE TABLE IF NOT EXISTS public.intro_v3_media_derivatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.intro_v3_media_sources(id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'STILL_RUNTIME' CHECK (kind = 'STILL_RUNTIME'),
  format text NOT NULL DEFAULT 'webp',
  width integer NOT NULL,
  height integer NOT NULL,
  aspect double precision,
  bytes bigint,
  storage_path text NOT NULL,
  public_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intro_v3_media_derivatives_storage_path_persistable
    CHECK (public.intro_v2_persistable_ref_ok(storage_path)),
  CONSTRAINT intro_v3_media_derivatives_public_url_persistable
    CHECK (public_url IS NULL OR public.intro_v2_persistable_ref_ok(public_url))
);

CREATE INDEX IF NOT EXISTS intro_v3_media_sources_created_at_idx
  ON public.intro_v3_media_sources (created_at DESC);
CREATE INDEX IF NOT EXISTS intro_v3_media_derivatives_source_id_idx
  ON public.intro_v3_media_derivatives (source_id);
CREATE INDEX IF NOT EXISTS intro_v3_media_derivatives_created_at_idx
  ON public.intro_v3_media_derivatives (created_at DESC);

ALTER TABLE public.intro_v3_media_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_v3_media_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.intro_v3_media_derivatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_v3_media_derivatives FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.intro_v3_media_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.intro_v3_media_derivatives FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.intro_v3_media_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.intro_v3_media_derivatives TO authenticated;
GRANT ALL ON TABLE public.intro_v3_media_sources TO service_role;
GRANT ALL ON TABLE public.intro_v3_media_derivatives TO service_role;

DROP POLICY IF EXISTS intro_v3_media_sources_admin_all ON public.intro_v3_media_sources;
CREATE POLICY intro_v3_media_sources_admin_all ON public.intro_v3_media_sources
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS intro_v3_media_derivatives_admin_all ON public.intro_v3_media_derivatives;
CREATE POLICY intro_v3_media_derivatives_admin_all ON public.intro_v3_media_derivatives
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

COMMIT;
