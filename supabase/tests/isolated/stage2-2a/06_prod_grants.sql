-- Function grants as in production (has_function_privilege, 2026-10-21): service_role only.
REVOKE ALL ON FUNCTION public.settle_store_sale_fee_obligations(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_store_sale_fee_obligations(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.approve_business_cash_charge_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_business_cash_charge_request(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reject_business_cash_charge_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_business_cash_charge_request(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_decide_store_commission_adjustment(uuid, uuid, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_store_commission_adjustment(uuid, uuid, text, bigint, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.store_cash_position(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_cash_position(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.store_commission_integrity_report(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_commission_integrity_report(uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.store_commission_enqueue_exception_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_commission_enqueue_exception_notifications() TO service_role;
