-- DIBAY SUPABASE SECURITY LINT — full EXECUTE revoke (advisor CSV 2026-08-26)
-- Project: ckdosyydvgzqwpbwuhon
--
-- Source: Supabase Performance & Security Lints CSV
--   anon_security_definer_function_executable (21)
--   authenticated_security_definer_function_executable (25)
--   function_search_path_mutable (2)
--
-- A. Service-role-only SECURITY DEFINER RPCs (API via getSupabaseServer /
--    tryGetSupabaseForStores — never direct PostgREST from browser):
--      claim_store_coupon, restore_store_coupon_entitlement,
--      gift_certificate_*, store_cash_recovery_clear,
--      ensure_store_browse_scope_policy_revision,
--      save_store_browse_scope_policy_cas (both overloads),
--      ensure_store_composition_policy_surface_state,
--      save_store_composition_policy_surface_cas
--    → REVOKE PUBLIC/anon/authenticated · GRANT service_role
--
-- B. RLS / Realtime helpers (authenticated KEEP — product contract):
--      cm_is_room_admin, cm_is_room_participant,
--      is_admin_user, is_platform_admin
--    → REVOKE PUBLIC/anon · GRANT authenticated, service_role
--    Residual WARN: authenticated_security_definer_function_executable (expected)
--
-- C. HOLD (intentional residual WARN — posts_masked security_invoker view):
--      posts_mask_reserved_buyer_id — KEEP anon + authenticated EXECUTE
--
-- D. Trigger touch helpers — lock search_path; revoke client EXECUTE
--      set_store_browse_scope_policy_updated_at
--      set_store_composition_policy_overrides_updated_at
--
-- OUT OF BAND (Dashboard only — not SQL):
--   auth_leaked_password_protection (HaveIBeenPwned)
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
      ('public.claim_store_coupon(uuid, uuid)'),
      ('public.cm_is_room_admin(uuid)'),
      ('public.cm_is_room_participant(uuid)'),
      ('public.ensure_store_browse_scope_policy_revision()'),
      ('public.ensure_store_composition_policy_surface_state(text)'),
      ('public.gift_certificate_accept(uuid, uuid)'),
      ('public.gift_certificate_cancel(uuid, uuid)'),
      ('public.gift_certificate_conversion_approve(uuid, uuid)'),
      ('public.gift_certificate_conversion_request(uuid, uuid, integer, text)'),
      ('public.gift_certificate_next_ownership_seq(uuid)'),
      ('public.gift_certificate_offer(uuid, uuid, uuid, uuid, text)'),
      ('public.gift_certificate_purchase(uuid, uuid, text)'),
      ('public.gift_certificate_redeem(uuid, uuid, uuid, jsonb, text)'),
      ('public.gift_certificate_redemption_reverse(uuid)'),
      ('public.gift_certificate_refund_order_atomic(uuid, uuid)'),
      ('public.gift_certificate_reject(uuid, uuid)'),
      ('public.gift_certificate_store_revenue_available(uuid)'),
      ('public.is_admin_user()'),
      ('public.is_platform_admin(uuid)'),
      ('public.posts_mask_reserved_buyer_id(uuid)'),
      ('public.restore_store_coupon_entitlement(uuid, boolean)'),
      ('public.save_store_browse_scope_policy_cas(bigint, jsonb, uuid)'),
      ('public.save_store_browse_scope_policy_cas(bigint, jsonb, uuid, text[])'),
      ('public.save_store_composition_policy_surface_cas(text, bigint, jsonb, uuid, text)'),
      ('public.set_store_browse_scope_policy_updated_at()'),
      ('public.set_store_composition_policy_overrides_updated_at()'),
      ('public.store_cash_recovery_clear(uuid, uuid, integer)')
  ) AS expected(expected_signature)
  WHERE to_regprocedure(expected_signature) IS NULL;

  IF missing_functions IS NOT NULL THEN
    RAISE EXCEPTION
      'security_lint_revoke_security_definer_execute: missing functions: %',
      array_to_string(missing_functions, ', ');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- A) Service-role-only RPCs
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.claim_store_coupon(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_store_coupon(uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_store_coupon(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_store_coupon(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.restore_store_coupon_entitlement(uuid, boolean)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_store_coupon_entitlement(uuid, boolean)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_store_coupon_entitlement(uuid, boolean)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_store_coupon_entitlement(uuid, boolean)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_store_revenue_available(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_store_revenue_available(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_store_revenue_available(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_store_revenue_available(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_next_ownership_seq(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_next_ownership_seq(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_next_ownership_seq(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_next_ownership_seq(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_purchase(uuid, uuid, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_purchase(uuid, uuid, text)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_purchase(uuid, uuid, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_purchase(uuid, uuid, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_accept(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_accept(uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_accept(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_accept(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_reject(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_reject(uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_reject(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_reject(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_cancel(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cancel(uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_cancel(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cancel(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_redeem(uuid, uuid, uuid, jsonb, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_redeem(uuid, uuid, uuid, jsonb, text)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_redeem(uuid, uuid, uuid, jsonb, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_redeem(uuid, uuid, uuid, jsonb, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_redemption_reverse(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_redemption_reverse(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_redemption_reverse(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_redemption_reverse(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_refund_order_atomic(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_refund_order_atomic(uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_refund_order_atomic(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_refund_order_atomic(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_conversion_request(uuid, uuid, integer, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_conversion_request(uuid, uuid, integer, text)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_conversion_request(uuid, uuid, integer, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_conversion_request(uuid, uuid, integer, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.gift_certificate_conversion_approve(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_conversion_approve(uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.gift_certificate_conversion_approve(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_conversion_approve(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.store_cash_recovery_clear(uuid, uuid, integer)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.store_cash_recovery_clear(uuid, uuid, integer)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.store_cash_recovery_clear(uuid, uuid, integer)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.store_cash_recovery_clear(uuid, uuid, integer)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.ensure_store_browse_scope_policy_revision()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_store_browse_scope_policy_revision()
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_store_browse_scope_policy_revision()
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_store_browse_scope_policy_revision()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.save_store_browse_scope_policy_cas(bigint, jsonb, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_store_browse_scope_policy_cas(bigint, jsonb, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_store_browse_scope_policy_cas(bigint, jsonb, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_store_browse_scope_policy_cas(bigint, jsonb, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.save_store_browse_scope_policy_cas(bigint, jsonb, uuid, text[])
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_store_browse_scope_policy_cas(bigint, jsonb, uuid, text[])
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_store_browse_scope_policy_cas(bigint, jsonb, uuid, text[])
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_store_browse_scope_policy_cas(bigint, jsonb, uuid, text[])
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.ensure_store_composition_policy_surface_state(text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_store_composition_policy_surface_state(text)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_store_composition_policy_surface_state(text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_store_composition_policy_surface_state(text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.save_store_composition_policy_surface_cas(text, bigint, jsonb, uuid, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_store_composition_policy_surface_cas(text, bigint, jsonb, uuid, text)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_store_composition_policy_surface_cas(text, bigint, jsonb, uuid, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_store_composition_policy_surface_cas(text, bigint, jsonb, uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- B) RLS helpers — anon surface closed; authenticated KEEP
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.cm_is_room_participant(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_is_room_participant(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.cm_is_room_participant(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cm_is_room_admin(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_is_room_admin(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.cm_is_room_admin(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_admin_user()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_user()
  FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user()
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C) posts_mask_reserved_buyer_id — HOLD (reaffirm view contract)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.posts_mask_reserved_buyer_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.posts_mask_reserved_buyer_id(uuid)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- D) Trigger updated_at helpers — search_path + no client EXECUTE
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.set_store_browse_scope_policy_updated_at()
  SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.set_store_browse_scope_policy_updated_at()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_store_browse_scope_policy_updated_at()
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_store_browse_scope_policy_updated_at()
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_store_browse_scope_policy_updated_at()
  TO service_role;

ALTER FUNCTION public.set_store_composition_policy_overrides_updated_at()
  SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.set_store_composition_policy_overrides_updated_at()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_store_composition_policy_overrides_updated_at()
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_store_composition_policy_overrides_updated_at()
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_store_composition_policy_overrides_updated_at()
  TO service_role;

COMMIT;
