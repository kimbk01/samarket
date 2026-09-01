-- DIBAY THREE-CURRENCY reconstruction
-- Historical rows remain; legacy product mutations are permanently revoked.

BEGIN;

-- Former store-credit product (historical tables remain read-only).
REVOKE ALL ON FUNCTION public.charge_store_points_on_order_accept(uuid, uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_store_point_charge_request(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.adjust_store_point_balance(uuid, integer, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Former Gift Store Cash conversion and parallel gift cash-out product.
REVOKE ALL ON FUNCTION public.gift_certificate_conversion_request(uuid, uuid, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gift_certificate_conversion_approve(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gift_certificate_cash_out_request(
  uuid, uuid, integer, text, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gift_certificate_cash_out_cancel(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gift_certificate_cash_out_reject(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gift_certificate_cash_out_approve(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gift_certificate_cash_out_mark_paid(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.store_cash_recovery_clear(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;

-- Former ads-specific wallets. Canonical commercial debits use business_cash_*.
REVOKE ALL ON FUNCTION public.store_cash_delivery_ad_spend(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.store_cash_delivery_ad_refund(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.owner_fund_delivery_ad_campaign(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delivery_ad_business_cash_ensure_account(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_delivery_ad_business_cash_credit(uuid, uuid, bigint, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_refund_delivery_ad_campaign_funding(uuid, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delivery_ad_reconcile_charge(
  uuid, text, uuid, uuid, text, text, text, uuid, uuid, bigint, text, uuid, bigint, integer, timestamptz, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delivery_ad_reconcile_refund(uuid, text, text, bigint, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.store_point_ledger IS
  'Historical accounting evidence only. Not a product balance or active writer authority.';
COMMENT ON TABLE public.store_cash_ledger IS
  'Historical accounting evidence only. Not a product balance or active writer authority.';
COMMENT ON TABLE public.delivery_ad_accounts IS
  'Historical ads wallet evidence only. Canonical Cash authority is business_cash_accounts.';

COMMIT;
