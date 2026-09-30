-- DIBAY R16 FULL REVERT — remove Product OS Entry authority.
-- Does not restore R14/R15. Shared storage buckets untouched.

BEGIN;

DROP POLICY IF EXISTS os_entry_screen_config_public_live_select ON public.os_entry_screen_config;
DROP TABLE IF EXISTS public.os_entry_screen_config CASCADE;

DROP POLICY IF EXISTS os_entry_media_public_read ON storage.objects;
DROP POLICY IF EXISTS os_entry_media_admin_write ON storage.objects;

-- Bucket object purge is performed via Storage API apply script (not direct DELETE FROM storage.objects).
-- Drop bucket row after objects emptied by apply script; idempotent if already gone.
DELETE FROM storage.buckets WHERE id = 'os-entry-media';

COMMIT;
