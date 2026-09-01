-- Stage 1 Production Close — FIRST DIVERGENCE fix
-- Root cause: SECURITY DEFINER finance RPCs remained EXECUTE-able by anon/authenticated
-- after REVOKE FROM PUBLIC (Supabase role grants). Fail-closed: service_role only.

BEGIN;

REVOKE ALL ON FUNCTION public.ensure_store_economic_point_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_business_cash_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_business_cash_conversion_rate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_business_cash_charge_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_business_cash_charge_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_cash_delivery_ad_spend(uuid, uuid, uuid, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_cash_delivery_ad_refund(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_store_economic_points_inflow(uuid, integer, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ensure_store_economic_point_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_business_cash_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_business_cash_conversion_rate() TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_business_cash_charge_request(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_business_cash_charge_request(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_cash_delivery_ad_spend(uuid, uuid, uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_cash_delivery_ad_refund(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_store_economic_points_inflow(uuid, integer, text, text, text, jsonb) TO service_role;

COMMIT;
