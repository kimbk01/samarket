-- DIBAY R16 FULL REVERT — remove Product OS Entry authority.
-- Does not restore R14/R15. Shared storage buckets untouched.

BEGIN;

DROP POLICY IF EXISTS os_entry_screen_config_public_live_select ON public.os_entry_screen_config;
DROP TABLE IF EXISTS public.os_entry_screen_config CASCADE;

DROP POLICY IF EXISTS os_entry_media_public_read ON storage.objects;
DROP POLICY IF EXISTS os_entry_media_admin_write ON storage.objects;

-- Bucket object purge + bucket delete: Storage API only (apply-r16-os-entry-abandon-zero.mjs).
-- Direct DELETE FROM storage.buckets is blocked by storage.protect_delete().

COMMIT;
