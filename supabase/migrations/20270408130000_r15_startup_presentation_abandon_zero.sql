-- DIBAY R15 ABANDONMENT — restore Absolute Zero for Intro/System Start DB/storage.
-- Demolition only. Does not recreate Intro authority. Does not touch R14 leftovers (already zero).

BEGIN;

DROP POLICY IF EXISTS r15_startup_generations_public_current_select
  ON public.r15_startup_generations;
DROP POLICY IF EXISTS r15_startup_media_admin_select
  ON storage.objects;

DELETE FROM storage.objects
WHERE bucket_id = 'r15-startup-media';

DELETE FROM storage.buckets
WHERE id = 'r15-startup-media';

DROP TABLE IF EXISTS public.r15_startup_generations CASCADE;
DROP TABLE IF EXISTS public.r15_startup_media CASCADE;
DROP TABLE IF EXISTS public.r15_startup_documents CASCADE;

COMMIT;
