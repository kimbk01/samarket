-- DIBAY Currency CUT G — RPC ACL harden (Coin mint + sale fee service_role only)

BEGIN;

REVOKE ALL ON FUNCTION public.credit_coin_from_settlement(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_coin_from_gift_revenue(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_coin_from_confirmed_sale(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.charge_sale_fee_for_order(uuid, uuid, uuid, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_sale_fee_for_order(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_store_sale_fee_obligations(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_coin_credits_for_order(uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.credit_coin_from_settlement(uuid, uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_coin_from_gift_revenue(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_coin_from_confirmed_sale(uuid, uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.charge_sale_fee_for_order(uuid, uuid, uuid, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_sale_fee_for_order(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_store_sale_fee_obligations(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_coin_credits_for_order(uuid, text, text) TO service_role;

COMMIT;
