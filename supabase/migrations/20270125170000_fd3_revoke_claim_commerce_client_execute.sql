-- FD3 P0: claim_commerce_notification_push_handoff is SECURITY DEFINER and was
-- executable by anon/authenticated. Claim token is caller-chosen (not a shared
-- secret). Product caller is cron via service_role only.
--
-- Minimum repair: revoke client EXECUTE; keep service_role.

BEGIN;

REVOKE ALL ON FUNCTION public.claim_commerce_notification_push_handoff(integer, text, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_commerce_notification_push_handoff(integer, text, integer)
  TO service_role;

COMMIT;
