-- Supabase Security Advisor — WARN close (project ckdosyydvgzqwpbwuhon)
-- Source CSV: Supabase Performance & Security Lints (observed 2026-10-19T16:02:28Z)
--
-- Fixes (SQL):
--   WARN function_search_path_mutable (4)
--     store_commission_adjustments_immutable
--     store_commission_row_state
--     admin_notification_backoff
--     store_commission_php_text
--   WARN authenticated_security_definer_function_executable (7)
--     Realtime Authorization helpers were GRANT EXECUTE TO authenticated so
--     PostgREST exposed them at /rest/v1/rpc/*. Callers are only
--     internal.cm_realtime_can_read_topic / can_send_topic (SECURITY DEFINER),
--     which run as the function owner — authenticated EXECUTE is not required.
--     → REVOKE PUBLIC/anon/authenticated · GRANT service_role
--
-- OUT OF BAND (Dashboard only — not SQL):
--   auth_leaked_password_protection — Supabase Auth → Password Security
--     → Enable "Leaked password protection" (HaveIBeenPwned)
--
-- No CREATE OR REPLACE of money/engine/realtime bodies. No SECURITY mode flips.

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
      ('public.admin_notification_backoff(integer)'),
      ('public.group_can_access_group_chat_room(uuid)'),
      ('public.store_can_access_order_delivery_realtime(uuid)'),
      ('public.store_can_access_store_realtime(uuid)'),
      ('public.store_commission_adjustments_immutable()'),
      ('public.store_commission_php_text(bigint)'),
      ('public.store_commission_row_state(text, bigint, text)'),
      ('public.support_can_access_support_case(uuid)'),
      ('public.trade_can_access_integrated_chat_room(uuid)'),
      ('public.trade_can_access_post_listing_broadcast(uuid)'),
      ('public.trade_can_access_trade_chat_room(uuid)')
  ) AS expected(expected_signature)
  WHERE to_regprocedure(expected_signature) IS NULL;

  IF missing_functions IS NOT NULL THEN
    RAISE EXCEPTION
      'security_lints_advisor_csv_20261019: missing functions: %',
      array_to_string(missing_functions, ', ');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- A) search_path lock — commission / admin notification helpers
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.store_commission_adjustments_immutable()
  SET search_path = public;
ALTER FUNCTION public.store_commission_row_state(text, bigint, text)
  SET search_path = public;
ALTER FUNCTION public.admin_notification_backoff(integer)
  SET search_path = public;
ALTER FUNCTION public.store_commission_php_text(bigint)
  SET search_path = public;

-- ---------------------------------------------------------------------------
-- B) Realtime Authorization helpers — no PostgREST client EXECUTE
--     (still callable from internal.* SECURITY DEFINER topic gates)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.group_can_access_group_chat_room(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.group_can_access_group_chat_room(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.group_can_access_group_chat_room(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.group_can_access_group_chat_room(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.store_can_access_order_delivery_realtime(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.store_can_access_order_delivery_realtime(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.store_can_access_order_delivery_realtime(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.store_can_access_order_delivery_realtime(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.store_can_access_store_realtime(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.store_can_access_store_realtime(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.store_can_access_store_realtime(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.store_can_access_store_realtime(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.support_can_access_support_case(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.support_can_access_support_case(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.support_can_access_support_case(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.support_can_access_support_case(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.trade_can_access_integrated_chat_room(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trade_can_access_integrated_chat_room(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.trade_can_access_integrated_chat_room(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trade_can_access_integrated_chat_room(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.trade_can_access_post_listing_broadcast(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trade_can_access_post_listing_broadcast(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.trade_can_access_post_listing_broadcast(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trade_can_access_post_listing_broadcast(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.trade_can_access_trade_chat_room(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trade_can_access_trade_chat_room(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.trade_can_access_trade_chat_room(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trade_can_access_trade_chat_room(uuid)
  TO service_role;

COMMIT;
