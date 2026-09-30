-- DIBAY R15 ABANDONMENT — restore Absolute Zero for Intro/System Start DB.
-- Demolition only. Bucket/object removal is performed by Storage API in the apply script
-- because storage.protect_delete blocks direct SQL deletes on storage tables.

BEGIN;

DROP POLICY IF EXISTS r15_startup_generations_public_current_select
  ON public.r15_startup_generations;
DROP POLICY IF EXISTS r15_startup_media_admin_select
  ON storage.objects;

DROP TABLE IF EXISTS public.r15_startup_generations CASCADE;
DROP TABLE IF EXISTS public.r15_startup_media CASCADE;
DROP TABLE IF EXISTS public.r15_startup_documents CASCADE;

COMMIT;
