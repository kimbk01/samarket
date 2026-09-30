-- Intro media library: allow VIDEO (MP4 runtime) alongside IMAGE / LOGO / GIF.

ALTER TABLE public.app_intro_media
  DROP CONSTRAINT IF EXISTS app_intro_media_kind_check;

ALTER TABLE public.app_intro_media
  ADD CONSTRAINT app_intro_media_kind_check
  CHECK (media_kind IN ('IMAGE', 'LOGO', 'GIF', 'VIDEO'));
