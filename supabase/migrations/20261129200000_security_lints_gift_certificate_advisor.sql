-- Supabase Security Advisor — gift certificate follow-up (project ckdosyydvgzqwpbwuhon)
-- Source CSV: Supabase Performance & Security Lints (observed 2026-08-28)
--
-- Fixes (SQL):
--   WARN function_search_path_mutable — 4 gift validity / scope helpers
--   WARN anon_security_definer_function_executable — gift SECURITY DEFINER RPCs
--   WARN authenticated_security_definer_function_executable — same gift RPCs
--
-- Drift cause: later gift migrations REVOKE FROM PUBLIC + GRANT service_role only;
-- Supabase default / role grants left anon+authenticated EXECUTE on SECURITY DEFINER.
--
-- Intentional residual WARN (product contract — do not “fix”):
--   posts_mask_reserved_buyer_id(anon+authenticated) — posts_masked view
--   cm_is_room_* / is_admin_user / is_platform_admin(authenticated) — RLS helpers
-- Dashboard only:
--   auth_leaked_password_protection — Supabase Auth → Password Security
--
-- No CREATE OR REPLACE of money/engine bodies. No SECURITY mode flips.

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
      ('public.generate_gift_public_number()'),
      ('public.gift_certificate_cash_out_approve(uuid, uuid)'),
      ('public.gift_certificate_cash_out_cancel(uuid, uuid)'),
      ('public.gift_certificate_cash_out_mark_paid(uuid, uuid, text, text, text)'),
      ('public.gift_certificate_cash_out_reject(uuid, uuid, text)'),
      ('public.gift_certificate_cash_out_request(uuid, uuid, integer, text, text, text, text, text)'),
      ('public.gift_certificate_correct_legacy_recognition(uuid)'),
      ('public.gift_certificate_instance_allows_checkout_store(text, uuid, uuid)'),
      ('public.gift_certificate_instance_is_expired(date)'),
      ('public.gift_certificate_issue_date(timestamp with time zone)'),
      ('public.gift_certificate_promo_accrue_for_instance(uuid, uuid, integer, integer, integer, text, text)'),
      ('public.gift_certificate_promo_recognize_for_redemption(uuid)'),
      ('public.gift_certificate_promo_reverse_for_redemption(uuid)'),
      ('public.gift_certificate_promo_settle(uuid, integer, text)'),
      ('public.gift_certificate_recognize_revenue_for_completed_order(uuid)'),
      ('public.gift_certificate_redemption_is_recognized(uuid)'),
      ('public.gift_certificate_redemption_recognized_net(uuid)'),
      ('public.gift_certificate_resolve_validity_at_issue(text, integer, date, date)'),
      ('public.trg_store_orders_gift_revenue_on_completed()')
  ) AS expected(expected_signature)
  WHERE to_regprocedure(expected_signature) IS NULL;

  IF missing_functions IS NOT NULL THEN
    RAISE EXCEPTION
      'security_lints_gift_certificate_advisor: missing functions: %',
      array_to_string(missing_functions, ', ');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- A) search_path lock — validity / scope helpers
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.gift_certificate_issue_date(timestamp with time zone)
  SET search_path = public;
ALTER FUNCTION public.gift_certificate_instance_is_expired(date)
  SET search_path = public;
ALTER FUNCTION public.gift_certificate_resolve_validity_at_issue(text, integer, date, date)
  SET search_path = public;
ALTER FUNCTION public.gift_certificate_instance_allows_checkout_store(text, uuid, uuid)
  SET search_path = public;

-- ---------------------------------------------------------------------------
-- B) Service-role-only — gift SECURITY DEFINER + helpers (no PostgREST client)
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.generate_gift_public_number()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_gift_public_number()
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_gift_public_number()
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_gift_public_number()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_request(
  uuid, uuid, integer, text, text, text, text, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_request(
  uuid, uuid, integer, text, text, text, text, text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_request(
  uuid, uuid, integer, text, text, text, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cash_out_request(
  uuid, uuid, integer, text, text, text, text, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_cancel(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_cancel(uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_cancel(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cash_out_cancel(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_reject(uuid, uuid, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_reject(uuid, uuid, text)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_reject(uuid, uuid, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cash_out_reject(uuid, uuid, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_approve(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_approve(uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_approve(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cash_out_approve(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_mark_paid(
  uuid, uuid, text, text, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_mark_paid(
  uuid, uuid, text, text, text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cash_out_mark_paid(
  uuid, uuid, text, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cash_out_mark_paid(
  uuid, uuid, text, text, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_correct_legacy_recognition(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_correct_legacy_recognition(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_correct_legacy_recognition(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_correct_legacy_recognition(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_accrue_for_instance(
  uuid, uuid, integer, integer, integer, text, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_accrue_for_instance(
  uuid, uuid, integer, integer, integer, text, text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_accrue_for_instance(
  uuid, uuid, integer, integer, integer, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_promo_accrue_for_instance(
  uuid, uuid, integer, integer, integer, text, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_recognize_for_redemption(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_recognize_for_redemption(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_recognize_for_redemption(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_promo_recognize_for_redemption(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_reverse_for_redemption(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_reverse_for_redemption(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_reverse_for_redemption(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_promo_reverse_for_redemption(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_settle(uuid, integer, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_settle(uuid, integer, text)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_promo_settle(uuid, integer, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_promo_settle(uuid, integer, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_redemption_is_recognized(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_redemption_is_recognized(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_redemption_is_recognized(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_redemption_is_recognized(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_redemption_recognized_net(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_redemption_recognized_net(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_redemption_recognized_net(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_redemption_recognized_net(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_store_orders_gift_revenue_on_completed()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_store_orders_gift_revenue_on_completed()
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_store_orders_gift_revenue_on_completed()
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trg_store_orders_gift_revenue_on_completed()
  TO service_role;

-- Helpers (not always SECURITY DEFINER) — close client RPC surface drift
REVOKE EXECUTE ON FUNCTION public.gift_certificate_issue_date(timestamp with time zone)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_issue_date(timestamp with time zone)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_issue_date(timestamp with time zone)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_issue_date(timestamp with time zone)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_instance_is_expired(date)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_instance_is_expired(date)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_instance_is_expired(date)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_instance_is_expired(date)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_resolve_validity_at_issue(text, integer, date, date)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_resolve_validity_at_issue(text, integer, date, date)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_resolve_validity_at_issue(text, integer, date, date)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_resolve_validity_at_issue(text, integer, date, date)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_instance_allows_checkout_store(text, uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_instance_allows_checkout_store(text, uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_instance_allows_checkout_store(text, uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_instance_allows_checkout_store(text, uuid, uuid)
  TO service_role;

COMMIT;
