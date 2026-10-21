-- N-4B: after 20270603110400 service_role cannot write business_cash_charge_requests directly; RPCs still work.
DO $$
BEGIN
  PERFORM public.t_assert(has_table_privilege('service_role', 'public.business_cash_charge_requests', 'SELECT'), 'service_role SELECT kept');
  PERFORM public.t_assert(NOT has_table_privilege('service_role', 'public.business_cash_charge_requests', 'INSERT'), 'service_role INSERT revoked');
  PERFORM public.t_assert(NOT has_table_privilege('service_role', 'public.business_cash_charge_requests', 'UPDATE'), 'service_role UPDATE revoked');
  PERFORM public.t_assert(NOT has_table_privilege('service_role', 'public.business_cash_charge_requests', 'DELETE'), 'service_role DELETE revoked');
  PERFORM public.t_assert((SELECT NOT convalidated FROM pg_constraint WHERE conname = 'business_cash_charge_requests_pending_evidence_chk'),
                          'evidence CHECK is NOT VALID (legacy rows not validated)');
  RAISE NOTICE 'PASS N-4B grants';
END $$;

SET ROLE service_role;
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.business_cash_charge_requests(store_id, owner_user_id, amount_minor, idempotency_key, payment_method, payment_reference)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 100, 'direct', 'gcash', 'D-1');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  PERFORM public.t_assert(v_failed, 'direct INSERT as service_role denied');
  v_failed := false;
  BEGIN
    UPDATE public.business_cash_charge_requests SET status = 'APPROVED' WHERE status = 'PENDING';
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  PERFORM public.t_assert(v_failed, 'direct UPDATE as service_role denied');
  RAISE NOTICE 'PASS N-4B direct service_role writes denied';
END $$;
SET test.jwt_role = 'service_role';
DO $$
DECLARE v_res jsonb;
BEGIN
  v_res := public.owner_create_business_cash_charge_request('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
                                                             500, 'gcash', 'N4B-1', NULL, 'n4b-key');
  PERFORM public.t_assert(v_res->>'ok' = 'true', 'RPC create still works as service_role: ' || v_res::text);
  v_res := public.reject_business_cash_charge_request('44444444-4444-4444-4444-444444444444', (v_res->>'request_id')::uuid, 'cleanup');
  PERFORM public.t_assert(v_res->>'ok' = 'true', 'RPC reject still works as service_role');
  RAISE NOTICE 'PASS N-4B RPC path (SECURITY DEFINER) unaffected';
END $$;
RESET ROLE;
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM public.t_legacy_request('aaaaaaaa-0000-0000-0000-000000000001', 100);
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  PERFORM public.t_assert(v_failed, 'new PENDING row without evidence violates CHECK');
  RAISE NOTICE 'PASS N-4B new PENDING rows must carry evidence';
END $$;
