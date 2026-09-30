-- DIBAY R16 — Product OS Start Screen (os-entry).
-- Independent of Intro / R14 / R15. REAL OS Splash is NOT this table.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'os-entry-media',
  'os-entry-media',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.os_entry_screen_config (
  lane text PRIMARY KEY CHECK (lane IN ('draft', 'live')),
  background_color text NOT NULL,
  image_storage_path text NULL,
  image_public_url text NULL,
  image_sha256 text NULL CHECK (image_sha256 IS NULL OR image_sha256 ~ '^[0-9a-f]{64}$'),
  image_mime_type text NULL,
  image_byte_length integer NULL CHECK (image_byte_length IS NULL OR image_byte_length > 0),
  image_x numeric NOT NULL DEFAULT 0.5 CHECK (image_x >= 0 AND image_x <= 1),
  image_y numeric NOT NULL DEFAULT 0.42 CHECK (image_y >= 0 AND image_y <= 1),
  image_width numeric NOT NULL DEFAULT 0.36 CHECK (image_width >= 0 AND image_width <= 1),
  image_height numeric NOT NULL DEFAULT 0.36 CHECK (image_height >= 0 AND image_height <= 1),
  image_fit text NOT NULL DEFAULT 'contain' CHECK (image_fit = 'contain'),
  text_content text NOT NULL DEFAULT '',
  text_x numeric NOT NULL DEFAULT 0.5 CHECK (text_x >= 0 AND text_x <= 1),
  text_y numeric NOT NULL DEFAULT 0.72 CHECK (text_y >= 0 AND text_y <= 1),
  text_width numeric NOT NULL DEFAULT 0.8 CHECK (text_width >= 0 AND text_width <= 1),
  text_size numeric NOT NULL DEFAULT 0.045 CHECK (text_size >= 0 AND text_size <= 1),
  text_align text NOT NULL DEFAULT 'center' CHECK (text_align IN ('left', 'center', 'right')),
  minimum_visible_ms integer NOT NULL DEFAULT 400 CHECK (minimum_visible_ms >= 0 AND minimum_visible_ms <= 30000),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.os_entry_screen_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_entry_screen_config FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.os_entry_screen_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.os_entry_screen_config TO service_role;

-- Public may read LIVE row only (warm sync via service API preferred; RLS backup).
GRANT SELECT ON TABLE public.os_entry_screen_config TO anon, authenticated;

DROP POLICY IF EXISTS os_entry_screen_config_public_live_select ON public.os_entry_screen_config;
CREATE POLICY os_entry_screen_config_public_live_select
  ON public.os_entry_screen_config
  FOR SELECT
  TO anon, authenticated
  USING (lane = 'live');

DROP POLICY IF EXISTS os_entry_media_public_read ON storage.objects;
CREATE POLICY os_entry_media_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'os-entry-media');

DROP POLICY IF EXISTS os_entry_media_admin_write ON storage.objects;
CREATE POLICY os_entry_media_admin_write
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'os-entry-media'
    AND public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'os-entry-media'
    AND public.is_platform_admin(auth.uid())
  );

-- Seed empty draft/live so Admin UI has rows (revision 0 = built-in until first apply).
INSERT INTO public.os_entry_screen_config (
  lane,
  background_color,
  image_public_url,
  image_fit,
  text_content,
  minimum_visible_ms,
  revision
)
VALUES
  ('draft', '#0B421A', '/os-entry/dibay-mark.png', 'contain', '', 400, 0),
  ('live', '#0B421A', '/os-entry/dibay-mark.png', 'contain', '', 400, 0)
ON CONFLICT (lane) DO NOTHING;

COMMIT;
