-- FIN-02 (settlement key) + FIN-12 (commission refund settles other arrears). Requires migrations 110000-110300.
SET test.jwt_role = 'service_role';

-- FIN-02: two equal partial settlements on the same obligation both succeed.
DO $$
DECLARE
  v_store uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_admin uuid := '44444444-4444-4444-4444-444444444444';
  v_ob uuid; v_res jsonb; v_req uuid; i int; v_row public.store_sale_fee_obligations%ROWTYPE;
BEGIN
  v_ob := public.t_obligation(v_store, 10000);
  FOR i IN 1..2 LOOP
    v_res := public.owner_create_business_cash_charge_request(v_owner, v_store, 2000, 'gcash', 'GC-FIN02-' || i, NULL, 'fin02-key-' || i);
    PERFORM public.t_assert(v_res->>'ok' = 'true', 'fin02 create ' || i || ': ' || v_res::text);
    v_req := (v_res->>'request_id')::uuid;
    v_res := public.approve_business_cash_charge_request(v_admin, v_req, 'deposit checked ' || i);
    PERFORM public.t_assert(v_res->>'ok' = 'true', 'fin02 approve ' || i || ': ' || v_res::text);
    PERFORM public.t_assert((v_res->'obligation_settle'->>'settled_count')::int = 1, 'fin02 settled ' || i);
  END LOOP;
  SELECT * INTO v_row FROM public.store_sale_fee_obligations WHERE id = v_ob;
  PERFORM public.t_assert(v_row.fee_paid_minor = 4000 AND v_row.fee_outstanding_minor = 6000, 'fin02 paid 4000 / outstanding 6000');
  PERFORM public.t_assert(v_row.fee_paid_minor + v_row.fee_outstanding_minor = v_row.fee_due_minor, 'fin02 paid+outstanding=due');
  PERFORM public.t_assert((SELECT count(*) FROM public.business_cash_ledger
                            WHERE entry_kind = 'SALE_FEE_SETTLEMENT' AND related_id = v_ob::text) = 2, 'fin02 two SETTLEMENT rows');
  PERFORM public.t_assert((SELECT array_agg(idempotency_key ORDER BY created_at, idempotency_key) FROM public.business_cash_ledger
                            WHERE entry_kind = 'SALE_FEE_SETTLEMENT' AND related_id = v_ob::text)
                          = ARRAY['sale_fee_settle:' || v_ob || ':0:2000', 'sale_fee_settle:' || v_ob || ':2000:2000'],
                          'fin02 keys carry cumulative paid before settlement');
  PERFORM public.t_assert((SELECT balance_minor FROM public.business_cash_accounts WHERE store_id = v_store) = 0, 'fin02 cash fully used');
  PERFORM public.t_assert(public.t_ledger_sum(v_store) = 0, 'fin02 balance = ledger sum');
  PERFORM public.t_assert((public.store_commission_integrity_report(ARRAY[v_store]) -> 'cash_ledger_eq_fee_paid' ->> 'violations')::int = 0,
                          'fin02 integrity I2 (cash ledger = fee paid) 0 violations');
  RAISE NOTICE 'PASS FIN-02 two equal partial settlements (2,000 x2) both succeed, keys unique, I2 = 0';
END $$;

-- FIN-12: approving a commission refund settles the store's other open obligation in the same transaction.
INSERT INTO public.stores(id, owner_user_id, store_name)
VALUES ('aaaaaaaa-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Store D');
DO $$
DECLARE
  v_store uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  v_admin uuid := '44444444-4444-4444-4444-444444444444';
  v_x uuid; v_y uuid; v_order uuid; v_res jsonb;
BEGIN
  -- X: paid 3,000 from Cash, order cancelled after cooking -> review_required.
  v_x := public.t_obligation(v_store, 3000);
  SELECT order_id INTO v_order FROM public.store_sale_fee_obligations WHERE id = v_x;
  INSERT INTO public.business_cash_accounts(store_id, balance_minor) VALUES (v_store, 0);
  INSERT INTO public.business_cash_ledger(store_id, entry_kind, direction, amount_minor, balance_after_minor, related_type, related_id, idempotency_key)
  VALUES (v_store, 'TOP_UP', 'credit', 3000, 3000, 'test', 'seed', 'seed:d:topup'),
         (v_store, 'SALE_FEE', 'debit', 3000, 0, 'store_order', v_order::text, 'seed:d:fee');
  UPDATE public.store_sale_fee_obligations
     SET fee_paid_minor = 3000, fee_outstanding_minor = 0, status = 'settled', settled_at = now(),
         adjustment_status = 'review_required', adjustment_trigger = 'cancelled', review_flagged_at = now()
   WHERE id = v_x;
  UPDATE public.store_orders SET order_status = 'cancelled' WHERE id = v_order;
  -- Y: unpaid 1,500 (Cash was 0 when charged).
  v_y := public.t_obligation(v_store, 1500);

  v_res := public.admin_decide_store_commission_adjustment(v_admin, v_order, 'approve', NULL, 'cancelled after cooking', 'fin12-key');
  PERFORM public.t_assert(v_res->>'ok' = 'true', 'fin12 decide ok: ' || v_res::text);
  PERFORM public.t_assert((v_res->>'cash_refund_minor')::bigint = 3000, 'fin12 refund 3000');
  PERFORM public.t_assert((v_res->'obligation_settle'->>'settled_count')::int = 1, 'fin12 settle ran in decide');
  PERFORM public.t_assert((SELECT status FROM public.store_sale_fee_obligations WHERE id = v_y) = 'settled', 'fin12 other arrears settled');
  PERFORM public.t_assert((SELECT count(*) FROM public.business_cash_ledger WHERE entry_kind = 'SALE_FEE_SETTLEMENT' AND related_id = v_y::text) = 1,
                          'fin12 one SETTLEMENT row for Y');
  PERFORM public.t_assert((SELECT balance_minor FROM public.business_cash_accounts WHERE store_id = v_store) = 1500, 'fin12 balance 3000-1500');
  PERFORM public.t_assert(public.t_ledger_sum(v_store) = 1500, 'fin12 balance = ledger sum');
  PERFORM public.t_assert((public.store_commission_integrity_report(ARRAY[v_store]) -> 'cash_ledger_eq_fee_paid' ->> 'violations')::int = 0,
                          'fin12 integrity I2 0 violations');
  -- Replay returns the recorded decision and does not settle twice.
  v_res := public.admin_decide_store_commission_adjustment(v_admin, v_order, 'approve', NULL, 'cancelled after cooking', 'fin12-key');
  PERFORM public.t_assert(v_res->>'idempotent' = 'true', 'fin12 replay idempotent');
  PERFORM public.t_assert((SELECT count(*) FROM public.business_cash_ledger WHERE store_id = v_store) = 4, 'fin12 replay wrote nothing');
  RAISE NOTICE 'PASS FIN-12 refund approval (3,000) settles other arrears (1,500) in the same TX; replay idempotent';
END $$;

-- FIN-12: a reject decision (no refund) does not move Cash.
DO $$
DECLARE
  v_store uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  v_ob uuid; v_order uuid; v_res jsonb; v_cnt bigint;
BEGIN
  v_ob := public.t_obligation(v_store, 700);
  SELECT order_id INTO v_order FROM public.store_sale_fee_obligations WHERE id = v_ob;
  UPDATE public.store_sale_fee_obligations SET adjustment_status = 'review_required' WHERE id = v_ob;
  UPDATE public.store_orders SET order_status = 'refunded' WHERE id = v_order;
  SELECT count(*) INTO v_cnt FROM public.business_cash_ledger WHERE store_id = v_store;
  v_res := public.admin_decide_store_commission_adjustment('44444444-4444-4444-4444-444444444444', v_order, 'reject', NULL, 'keep fee', 'fin12-reject');
  PERFORM public.t_assert(v_res->>'ok' = 'true' AND v_res->'obligation_settle' = 'null'::jsonb, 'fin12 reject: no settle call');
  PERFORM public.t_assert((SELECT count(*) FROM public.business_cash_ledger WHERE store_id = v_store) = v_cnt, 'fin12 reject: ledger unchanged');
  RAISE NOTICE 'PASS FIN-12 reject decision leaves Cash untouched';
END $$;
