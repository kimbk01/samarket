-- CUT 1A Opening Show — minimum tables for IMAGE authoring vertical slice.
-- No opening_revisions. No scene/layer row tables. Draft JSON is document authority.
-- Old intro_* tables are not used.

BEGIN;

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'opening-show-media',
  'opening-show-media',
  true,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.opening_shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opening_shows_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 120)
);

COMMENT ON TABLE public.opening_shows IS
  'CUT 1A Opening Show. New domain. Not intro_campaigns / intro_v3.';

CREATE TABLE IF NOT EXISTS public.opening_drafts (
  show_id uuid PRIMARY KEY REFERENCES public.opening_shows (id) ON DELETE CASCADE,
  document jsonb NOT NULL,
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.opening_drafts IS
  'CUT 1A working OpeningDocument JSON. Scene/layer rows are forbidden.';

CREATE TABLE IF NOT EXISTS public.opening_media (
  id uuid PRIMARY KEY,
  show_id uuid NOT NULL REFERENCES public.opening_shows (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  source_path text NOT NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opening_media_source_namespace CHECK (source_path LIKE '\_opening/%' ESCAPE '\')
);

COMMENT ON TABLE public.opening_media IS
  'CUT 1A READY media only. Rows exist only after process success.';

CREATE TABLE IF NOT EXISTS public.opening_media_derivatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES public.opening_media (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('display', 'thumb')),
  storage_path text NOT NULL,
  mime text NOT NULL,
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  CONSTRAINT opening_media_derivatives_namespace CHECK (storage_path LIKE '\_opening/%' ESCAPE '\'),
  CONSTRAINT opening_media_derivatives_kind_unique UNIQUE (media_id, kind)
);

CREATE INDEX IF NOT EXISTS opening_shows_updated_at_idx
  ON public.opening_shows (updated_at DESC);

CREATE INDEX IF NOT EXISTS opening_media_show_id_idx
  ON public.opening_media (show_id, created_at DESC);

ALTER TABLE public.opening_shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_media_derivatives ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.opening_shows FROM PUBLIC;
REVOKE ALL ON TABLE public.opening_shows FROM anon, authenticated;
GRANT SELECT ON TABLE public.opening_shows TO authenticated;
GRANT ALL ON TABLE public.opening_shows TO service_role;

REVOKE ALL ON TABLE public.opening_drafts FROM PUBLIC;
REVOKE ALL ON TABLE public.opening_drafts FROM anon, authenticated;
GRANT SELECT ON TABLE public.opening_drafts TO authenticated;
GRANT ALL ON TABLE public.opening_drafts TO service_role;

REVOKE ALL ON TABLE public.opening_media FROM PUBLIC;
REVOKE ALL ON TABLE public.opening_media FROM anon, authenticated;
GRANT SELECT ON TABLE public.opening_media TO authenticated;
GRANT ALL ON TABLE public.opening_media TO service_role;

REVOKE ALL ON TABLE public.opening_media_derivatives FROM PUBLIC;
REVOKE ALL ON TABLE public.opening_media_derivatives FROM anon, authenticated;
GRANT SELECT ON TABLE public.opening_media_derivatives TO authenticated;
GRANT ALL ON TABLE public.opening_media_derivatives TO service_role;

DROP POLICY IF EXISTS opening_shows_admin_select ON public.opening_shows;
CREATE POLICY opening_shows_admin_select
  ON public.opening_shows
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS opening_drafts_admin_select ON public.opening_drafts;
CREATE POLICY opening_drafts_admin_select
  ON public.opening_drafts
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS opening_media_admin_select ON public.opening_media;
CREATE POLICY opening_media_admin_select
  ON public.opening_media
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS opening_media_derivatives_admin_select ON public.opening_media_derivatives;
CREATE POLICY opening_media_derivatives_admin_select
  ON public.opening_media_derivatives
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS opening_show_media_public_read ON storage.objects;
CREATE POLICY opening_show_media_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'opening-show-media');

COMMIT;
