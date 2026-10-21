-- FIN-11: store_cash_position is the single SQL source for the owner finance totals (adds open_count only).
SET test.jwt_role = 'service_role';
DO $$
DECLARE v_pos jsonb; v_store uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
BEGIN
  v_pos := public.store_cash_position(v_store);
  PERFORM public.t_assert((v_pos->>'outstanding_minor')::bigint =
    (SELECT sum(fee_outstanding_minor) FROM public.store_sale_fee_obligations WHERE store_id = v_store AND status = 'open'), 'outstanding = SQL sum');
  PERFORM public.t_assert((v_pos->>'open_count')::bigint =
    (SELECT count(*) FROM public.store_sale_fee_obligations WHERE store_id = v_store AND status = 'open'), 'open_count = SQL count');
  PERFORM public.t_assert(v_pos ?& ARRAY['store_id','balance_minor','outstanding_minor','net_minor','gate_mode','orderable'], 'existing keys kept');
  v_pos := public.store_cash_position('aaaaaaaa-0000-0000-0000-0000000000ff');
  PERFORM public.t_assert((v_pos->>'open_count')::int = 0 AND (v_pos->>'outstanding_minor')::int = 0, 'unknown store -> zeros');
  RAISE NOTICE 'PASS FIN-11 store_cash_position open_count / outstanding from one SQL function';
END $$;
