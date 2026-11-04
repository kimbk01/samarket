-- P0 security (Owner approved 2026-11-05): minimal privilege fix only — no function body / data change.
-- Cause: Supabase default privileges in schema public grant EXECUTE on new functions to anon and
-- authenticated. 20271105120000 revoked only PUBLIC, so the SECURITY DEFINER RPC
-- record_member_required_consent stayed callable with the public anon key for any p_user_id.
-- Caller contract: server only, via SUPABASE_SERVICE_ROLE_KEY (service_role).
--
-- Rollback (re-opens the hole — only if service_role calls break):
--   GRANT EXECUTE ON FUNCTION public.record_member_required_consent(uuid, text, text, date, text, boolean, text, boolean)
--     TO anon, authenticated;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.member_consent_events TO anon, authenticated;
BEGIN;

REVOKE EXECUTE ON FUNCTION public.record_member_required_consent(
  uuid, text, text, date, text, boolean, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_member_required_consent(
  uuid, text, text, date, text, boolean, text, boolean
) TO service_role;

-- Ledger: members read own rows only (RLS policy unchanged); no client write / truncate privilege.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.member_consent_events FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.member_consent_events FROM anon;
GRANT SELECT ON public.member_consent_events TO authenticated;

COMMIT;
