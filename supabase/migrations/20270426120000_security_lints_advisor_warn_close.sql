-- DIBAY SUPABASE SECURITY LINT — close advisor WARN (CSV 2026-10-14)
-- Project: ckdosyydvgzqwpbwuhon
--
-- Source: Supabase Performance & Security Lints CSV
--   function_search_path_mutable (2)
--   anon_security_definer_function_executable (9)
--   authenticated_security_definer_function_executable (9)
--   auth_leaked_password_protection (1) — Dashboard only (not SQL)
--
-- Root cause (not symptom masking):
--   A) claim_notification_push_handoff — service_role-only intent but only
--      REVOKE FROM PUBLIC (anon/authenticated residual). Same defect class as
--      FD3 claim_commerce_* → explicit PUBLIC+anon+authenticated REVOKE.
--   B) cm_store_order_room_is_terminal — SECURITY DEFINER with no ACL at create;
--      called only from other DEFINER RPCs / never client .rpc → service_role only.
--   C) Realtime *_can_access_* helpers — authenticated KEEP (private RT contract);
--      anon residual from missing explicit REVOKE FROM anon.
--   D) internal topic UUID parsers — search_path unset (mutable); ACL incomplete
--      on suffix_uuid (GRANT without REVOKE PUBLIC).
--
-- No CREATE OR REPLACE of money/engine/Realtime authorization bodies.
-- No SECURITY DEFINER ↔ INVOKER flips.

BEGIN;

-- ---------------------------------------------------------------------------
-- Existence gate — fail loud if any exact signature missing
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing_functions text[];
BEGIN
  SELECT array_agg(expected_signature ORDER BY expected_signature)
  INTO missing_functions
  FROM (
    VALUES
      ('public.claim_notification_push_handoff(text[], integer, text, integer)'),
      ('public.cm_store_order_room_is_terminal(uuid)'),
      ('public.group_can_access_group_chat_room(uuid)'),
      ('public.store_can_access_order_delivery_realtime(uuid)'),
      ('public.store_can_access_store_realtime(uuid)'),
      ('public.support_can_access_support_case(uuid)'),
      ('public.trade_can_access_integrated_chat_room(uuid)'),
      ('public.trade_can_access_post_listing_broadcast(uuid)'),
      ('public.trade_can_access_trade_chat_room(uuid)'),
      ('internal.cm_realtime_topic_first_uuid_after(text, text)'),
      ('internal.cm_realtime_topic_suffix_uuid(text, text)')
  ) AS expected(expected_signature)
  WHERE to_regprocedure(expected_signature) IS NULL;

  IF missing_functions IS NOT NULL THEN
    RAISE EXCEPTION
      'security_lints_advisor_warn_close: missing functions: %',
      array_to_string(missing_functions, ', ');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- A) Service-role-only SECURITY DEFINER — close anon+authenticated EXECUTE
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.claim_notification_push_handoff(text[], integer, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_push_handoff(text[], integer, text, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.cm_store_order_room_is_terminal(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cm_store_order_room_is_terminal(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- B) Realtime Authorization helpers — anon closed; authenticated KEEP
--    Residual WARN: authenticated_security_definer_function_executable (expected)
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.trade_can_access_trade_chat_room(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trade_can_access_trade_chat_room(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.trade_can_access_trade_chat_room(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.trade_can_access_post_listing_broadcast(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trade_can_access_post_listing_broadcast(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.trade_can_access_post_listing_broadcast(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.trade_can_access_integrated_chat_room(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trade_can_access_integrated_chat_room(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.trade_can_access_integrated_chat_room(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.group_can_access_group_chat_room(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.group_can_access_group_chat_room(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.group_can_access_group_chat_room(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.support_can_access_support_case(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.support_can_access_support_case(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.support_can_access_support_case(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.store_can_access_store_realtime(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.store_can_access_store_realtime(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.store_can_access_store_realtime(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.store_can_access_order_delivery_realtime(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.store_can_access_order_delivery_realtime(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.store_can_access_order_delivery_realtime(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C) internal topic UUID parsers — pin search_path; close PUBLIC/anon EXECUTE
--    Bodies use only built-in string ops → empty search_path is safest.
-- ---------------------------------------------------------------------------

ALTER FUNCTION internal.cm_realtime_topic_suffix_uuid(text, text)
  SET search_path TO '';
REVOKE ALL ON FUNCTION internal.cm_realtime_topic_suffix_uuid(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.cm_realtime_topic_suffix_uuid(text, text)
  TO authenticated;

ALTER FUNCTION internal.cm_realtime_topic_first_uuid_after(text, text)
  SET search_path TO '';
REVOKE ALL ON FUNCTION internal.cm_realtime_topic_first_uuid_after(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.cm_realtime_topic_first_uuid_after(text, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- OUT OF BAND (Dashboard only — not SQL):
--   auth_leaked_password_protection (HaveIBeenPwned)
-- ---------------------------------------------------------------------------

COMMIT;
