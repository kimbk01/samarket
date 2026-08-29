-- CUT E ship-close: SECURITY DEFINER owner RPCs must not be executable by anon/authenticated.
-- Supabase default privileges grant EXECUTE to anon/authenticated on new functions;
-- REVOKE FROM PUBLIC alone is insufficient.

BEGIN;

REVOKE ALL ON FUNCTION public.owner_delivery_banner_upsert(uuid, uuid, uuid, text, text, integer, integer, text, text, text, text, uuid, text, text, timestamptz, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_delivery_banner_upsert(uuid, uuid, uuid, text, text, integer, integer, text, text, text, text, uuid, text, text, timestamptz, timestamptz, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_delivery_banner_upsert(uuid, uuid, uuid, text, text, integer, integer, text, text, text, text, uuid, text, text, timestamptz, timestamptz, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.owner_delivery_sponsored_upsert(uuid, uuid, uuid, text[], text, text, text, text, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_delivery_sponsored_upsert(uuid, uuid, uuid, text[], text, text, text, text, timestamptz, timestamptz, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_delivery_sponsored_upsert(uuid, uuid, uuid, text[], text, text, text, text, timestamptz, timestamptz, text) TO service_role;

COMMIT;
