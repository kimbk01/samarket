-- COMPLETE REMOVE: Diba Market schema (rollback after product cancel).
-- Safe to re-run. Does not touch Trade / CM / Address / non-dibamarket objects.
-- PostGIS extension is left installed (may be used elsewhere).

BEGIN;

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.dibamarket_messages;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- Feed RPCs (M4 then P1b signatures)
DROP FUNCTION IF EXISTS public.dibamarket_feed_discover(
  double precision, double precision, text, text, integer,
  text, text, text, numeric, numeric, text,
  double precision, timestamptz, uuid,
  uuid, text, text, integer, text, integer, numeric
);
DROP FUNCTION IF EXISTS public.dibamarket_feed_discover(
  double precision, double precision, text, text, integer,
  text, text, text, numeric, numeric, text,
  double precision, timestamptz, uuid
);

DROP FUNCTION IF EXISTS public.dibamarket_unread_thread_count(uuid);

-- Attribute / category bindings (M2 / M1 / M6)
DROP TABLE IF EXISTS public.dibamarket_listing_attributes CASCADE;
DROP TABLE IF EXISTS public.dibamarket_category_attributes CASCADE;
DROP TABLE IF EXISTS public.dibamarket_attribute_options CASCADE;
DROP TABLE IF EXISTS public.dibamarket_attribute_defs CASCADE;
DROP TABLE IF EXISTS public.dibamarket_saved_searches CASCADE;
DROP TABLE IF EXISTS public.dibamarket_categories CASCADE;

-- Chat
DROP TABLE IF EXISTS public.dibamarket_thread_reads CASCADE;
DROP TABLE IF EXISTS public.dibamarket_messages CASCADE;
DROP TABLE IF EXISTS public.dibamarket_threads CASCADE;

DROP FUNCTION IF EXISTS public.dibamarket_messages_after_insert();
DROP FUNCTION IF EXISTS public.touch_dibamarket_threads_updated_at();

-- Listings
DROP TABLE IF EXISTS public.dibamarket_listings CASCADE;
DROP FUNCTION IF EXISTS public.touch_dibamarket_listings_updated_at();

-- Storage policies + bucket
DROP POLICY IF EXISTS dibamarket_images_select_public ON storage.objects;
DROP POLICY IF EXISTS dibamarket_images_insert_own ON storage.objects;
DROP POLICY IF EXISTS dibamarket_images_update_own ON storage.objects;
DROP POLICY IF EXISTS dibamarket_images_delete_own ON storage.objects;

DELETE FROM storage.objects WHERE bucket_id = 'dibamarket-images';
DELETE FROM storage.buckets WHERE id = 'dibamarket-images';

COMMIT;
