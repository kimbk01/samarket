-- Stage 2-B assertions. Requires 00_fixture.sql, 05_legacy_rows.sql and the four 20270603120xxx migrations.
-- Run with psql -v ON_ERROR_STOP=1 (each DO block RAISEs on a failed assertion).

\set owner  '''11111111-1111-1111-1111-111111111111'''
\set buyer  '''33333333-3333-3333-3333-333333333333'''
\set admin  '''44444444-4444-4444-4444-444444444444'''
\set staff  '''55555555-5555-5555-5555-555555555555'''
\set store  '''aaaaaaaa-0000-0000-0000-000000000001'''
\set store2 '''aaaaaaaa-0000-0000-0000-000000000002'''

CREATE OR REPLACE FUNCTION public.t_assert(p_cond boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT FAILED: %', p_msg; END IF;
END $$;

INSERT INTO public.admin_memberships(user_id, role, status) VALUES (:admin, 'admin', 'active');
INSERT INTO public.admin_memberships(user_id, role, status) VALUES (:staff, 'admin', 'revoked');
INSERT INTO public.stores(id, owner_user_id, store_name) VALUES (:store2, :owner, 'other store');

-- 0) permissions -----------------------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.gift_certificate_admin_store_payout(uuid,uuid,integer,text,text,text,text)',
    'public.gift_certificate_store_payout_summary(uuid)'
  ] LOOP
    PERFORM public.t_assert(NOT has_function_privilege('anon', f, 'EXECUTE'), 'anon has no EXECUTE ' || f);
    PERFORM public.t_assert(NOT has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated has no EXECUTE ' || f);
    PERFORM public.t_assert(has_function_privilege('service_role', f, 'EXECUTE'), 'service_role EXECUTE ' || f);
  END LOOP;
  PERFORM public.t_assert(NOT has_table_privilege('anon', 'public.gift_certificate_store_payouts', 'SELECT'), 'anon no SELECT payouts');
  PERFORM public.t_assert(NOT has_table_privilege('authenticated', 'public.gift_certificate_store_payouts', 'SELECT'), 'authenticated no SELECT payouts');
  PERFORM public.t_assert(has_table_privilege('service_role', 'public.gift_certificate_store_payouts', 'SELECT'), 'service_role SELECT payouts');
  PERFORM public.t_assert(NOT has_table_privilege('service_role', 'public.gift_certificate_store_payouts', 'INSERT'), 'service_role no INSERT payouts');
  PERFORM public.t_assert(NOT has_table_privilege('service_role', 'public.gift_certificate_store_payouts', 'UPDATE'), 'service_role no UPDATE payouts');
  RAISE NOTICE 'PASS 0 permissions';
END $$;

SET test.jwt_role = 'service_role';

-- 1) H section 2 example: 1,000 + delivery 50, store coupon 100, platform coupon 40, gift 300 (10%), direct 610 --
INSERT INTO public.store_orders(id, order_no, buyer_user_id, store_id, order_status, total_amount, discount_amount,
  payment_amount, delivery_fee_amount, store_funded_amount, platform_funded_amount, gift_redemption_amount)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'H-1', :buyer, :store, 'completed', 1050, 140,
  610, 50, 100, 40, 300);
INSERT INTO public.gift_certificate_redemptions(order_id, store_id, redeemed_amount, platform_fee_amount, merchant_net_amount)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', :store, 300, 30, 270);

DO $$
DECLARE r jsonb; v_bal integer; v_row jsonb; v_sum jsonb;
BEGIN
  r := public.gift_certificate_recognize_revenue_for_completed_order('bbbbbbbb-0000-0000-0000-000000000001');
  PERFORM public.t_assert((r->>'recognized_count')::int = 1, 'gift revenue recognized once: ' || r::text);
  PERFORM public.t_assert(public.gift_certificate_store_revenue_available('aaaaaaaa-0000-0000-0000-000000000001') = 270,
    'gift rail available = merchant net 270');

  -- Coin = platform coupon only (40), sale_coin:{order}
  r := public.credit_coin_from_confirmed_sale('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
        NULL, 40, 'sale_coin:bbbbbbbb-0000-0000-0000-000000000001');
  PERFORM public.t_assert((r->>'ok')::boolean AND NOT (r->>'idempotent')::boolean, 'coin 40 minted: ' || r::text);
  SELECT balance INTO v_bal FROM public.store_economic_point_accounts WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  PERFORM public.t_assert(v_bal = 340 + 40, 'coin balance = legacy 340 + 40');
  r := public.credit_coin_from_confirmed_sale('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
        NULL, 40, 'sale_coin:bbbbbbbb-0000-0000-0000-000000000001');
  PERFORM public.t_assert((r->>'idempotent')::boolean, 'second mint idempotent');
  PERFORM public.t_assert((SELECT count(*) FROM public.store_economic_point_ledger
                            WHERE idempotency_key = 'sale_coin:bbbbbbbb-0000-0000-0000-000000000001') = 1, 'one sale_coin row');

  -- payable identity: direct + gift rail net + coin = sale after gift fee; platform owes 310 = 270 + 40
  r := public.store_platform_payable_page(ARRAY['aaaaaaaa-0000-0000-0000-000000000001']::uuid[], NULL, NULL, 'all', 100, 0);
  SELECT x INTO v_row FROM jsonb_array_elements(r->'rows') x WHERE x->>'order_no' = 'H-1';
  PERFORM public.t_assert((v_row->>'direct_php')::int = 610, 'direct 610');
  PERFORM public.t_assert((v_row->>'gift_rail_php')::int = 300, 'gift gross 300');
  PERFORM public.t_assert((v_row->>'gift_rail_net_php')::int = 270, 'gift rail net 270');
  PERFORM public.t_assert((v_row->>'gift_fee_php')::int = 30, 'gift fee 30');
  PERFORM public.t_assert((v_row->>'coin_due_php')::int = 40, 'coin due 40');
  PERFORM public.t_assert((v_row->>'held_paid_by_coin_php')::int = 40, 'coin paid 40');
  PERFORM public.t_assert((v_row->>'platform_owes_php')::int = 310, 'platform owes 310');
  PERFORM public.t_assert((v_row->>'payable_php')::int = 0, 'coin rail payable 0 after mint');
  PERFORM public.t_assert((v_row->>'coin_over_credit')::int = 0, 'no over credit');
  PERFORM public.t_assert(v_row->>'class' = 'gift_rail', 'class gift_rail');
  PERFORM public.t_assert(NOT (v_row->>'legacy_preserved')::boolean, 'H-1 is not legacy');
  PERFORM public.t_assert((v_row->>'direct_php')::int + (v_row->>'gift_rail_net_php')::int + (v_row->>'coin_due_php')::int
                          = 1050 - 100 - 30, 'identity 610 + 270 + 40 = 1050 - store coupon 100 - gift fee 30');
  PERFORM public.t_assert((v_row->>'platform_owes_php')::int = (v_row->>'gift_rail_net_php')::int + (v_row->>'held_paid_by_coin_php')::int,
                          'store payable 310 = gift 270 (rail) + coin 40');

  -- legacy L1 (minted 340 the old way): preserved, old over-credit rule (340 - (340 - 300) = 300)
  SELECT x INTO v_row FROM jsonb_array_elements(r->'rows') x WHERE x->>'order_no' = 'L-1';
  PERFORM public.t_assert((v_row->>'legacy_preserved')::boolean, 'L-1 legacy_preserved');
  PERFORM public.t_assert((v_row->>'coin_over_credit')::int = 300, 'L-1 over credit by the pre-stage-2 rule: ' || v_row::text);
  v_sum := r->'summary';
  PERFORM public.t_assert((v_sum->>'legacy_preserved_orders')::int = 1, 'summary legacy count 1');
  PERFORM public.t_assert((r->'gift_rail'->>'available_php')::int = 270, 'summary gift rail available 270');
  RAISE NOTICE 'PASS 1 H example (coin 40, gift rail 270, platform owes 310)';
END $$;

-- 2) GFT-02 mint cap -----------------------------------------------------------------------------------------
INSERT INTO public.store_orders(id, order_no, buyer_user_id, store_id, order_status, payment_amount,
  platform_funded_amount, gift_redemption_amount)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'G-2', :buyer, :store, 'completed', 0, 0, 300),
       ('bbbbbbbb-0000-0000-0000-000000000003', 'G-3', :buyer, :store, 'completed', 500, 40, 0);

DO $$
DECLARE r jsonb; v_err text;
BEGIN
  -- old formula (gift gross) is refused
  BEGIN
    r := public.credit_coin_from_confirmed_sale('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
          NULL, 300, 'sale_coin:bbbbbbbb-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'ASSERT FAILED: gift-only mint must raise';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM public.t_assert(v_err LIKE 'coin_mint_exceeds_platform_held%', 'gift mint refused: ' || v_err);
  END;
  -- above the coupon is refused
  BEGIN
    r := public.credit_coin_from_confirmed_sale('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003',
          NULL, 41, 'sale_coin:bbbbbbbb-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'ASSERT FAILED: 41 > 40 must raise';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM public.t_assert(v_err LIKE 'coin_mint_exceeds_platform_held%', 'over-coupon mint refused: ' || v_err);
  END;
  -- wrong store is refused (cap 0)
  BEGIN
    r := public.credit_coin_from_confirmed_sale('aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000003',
          NULL, 40, 'sale_coin:bbbbbbbb-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'ASSERT FAILED: other store mint must raise';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    PERFORM public.t_assert(v_err LIKE 'coin_mint_exceeds_platform_held%', 'other-store mint refused: ' || v_err);
  END;
  PERFORM public.t_assert((SELECT count(*) FROM public.store_economic_point_ledger
                            WHERE idempotency_key IN ('sale_coin:bbbbbbbb-0000-0000-0000-000000000002',
                                                      'sale_coin:bbbbbbbb-0000-0000-0000-000000000003')) = 0, 'no refused mint written');
  -- exactly the coupon is allowed
  r := public.credit_coin_from_confirmed_sale('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003',
        NULL, 40, 'sale_coin:bbbbbbbb-0000-0000-0000-000000000003');
  PERFORM public.t_assert((r->>'ok')::boolean, 'coupon mint ok');
  -- legacy over-mint stays idempotent (no exception, no clawback, no re-mint)
  r := public.credit_coin_from_confirmed_sale('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000a',
        NULL, 40, 'sale_coin:bbbbbbbb-0000-0000-0000-00000000000a');
  PERFORM public.t_assert((r->>'ok')::boolean AND (r->>'idempotent')::boolean, 'legacy key idempotent: ' || r::text);
  PERFORM public.t_assert((SELECT amount FROM public.store_economic_point_ledger
                            WHERE idempotency_key = 'sale_coin:bbbbbbbb-0000-0000-0000-00000000000a') = 340, 'legacy 340 unchanged');
  RAISE NOTICE 'PASS 2 mint cap';
END $$;

-- 3) integrity report: legacy_preserved vs new violation -----------------------------------------------------
DO $$
DECLARE r jsonb;
BEGIN
  r := public.store_commission_integrity_report(NULL) -> 'sale_coin_le_platform_coupon';
  PERFORM public.t_assert((r->>'violations')::int = 0, 'no new violation: ' || r::text);
  PERFORM public.t_assert((r->>'legacy_preserved')::int = 1, 'legacy over-mint preserved: ' || r::text);
  PERFORM public.t_assert(r->'legacy_ids' ? 'bbbbbbbb-0000-0000-0000-00000000000a', 'legacy id listed');
  -- a post-cutoff over-mint that bypassed the RPC (direct write) is reported as a violation
  INSERT INTO public.store_economic_point_ledger(store_id, entry_kind, amount, balance_after, related_type, related_id, idempotency_key)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'SALE_EARN', 300, 0, 'store_order', 'bbbbbbbb-0000-0000-0000-000000000002',
          'sale_coin:bbbbbbbb-0000-0000-0000-000000000002');
  r := public.store_commission_integrity_report(NULL) -> 'sale_coin_le_platform_coupon';
  PERFORM public.t_assert((r->>'violations')::int = 1 AND r->'ids' ? 'bbbbbbbb-0000-0000-0000-000000000002', 'new over-mint reported: ' || r::text);
  r := public.store_commission_integrity_report(ARRAY['aaaaaaaa-0000-0000-0000-000000000002']::uuid[]) -> 'sale_coin_le_platform_coupon';
  PERFORM public.t_assert((r->>'violations')::int = 0 AND (r->>'legacy_preserved')::int = 0, 'store filter applies');
  DELETE FROM public.store_economic_point_ledger WHERE idempotency_key = 'sale_coin:bbbbbbbb-0000-0000-0000-000000000002';
  RAISE NOTICE 'PASS 3 integrity sale_coin cap (legacy_preserved)';
END $$;

-- 4) gift rail payout ------------------------------------------------------------------------------------------
DO $$
DECLARE r jsonb; s jsonb;
BEGIN
  r := public.gift_certificate_admin_store_payout('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001',
        100, 'bank_transfer', 'BANK-001', 'Oct batch', 'payout-key-1');
  PERFORM public.t_assert((r->>'ok')::boolean AND NOT (r->>'idempotent')::boolean, 'payout ok: ' || r::text);
  PERFORM public.t_assert((r->>'available_before')::int = 270 AND (r->>'available_after')::int = 170, 'available 270 -> 170');
  PERFORM public.t_assert(public.gift_certificate_store_revenue_available('aaaaaaaa-0000-0000-0000-000000000001') = 170, 'available now 170');
  PERFORM public.t_assert((SELECT count(*) FROM public.gift_certificate_revenue_ledger
                            WHERE entry_type = 'PAYOUT_PAID' AND amount = -100 AND related_type = 'gift_store_payout'
                              AND related_id = r->>'payout_id') = 1, 'one PAYOUT_PAID -100 ledger row');
  PERFORM public.t_assert((SELECT count(*) FROM public.audit_logs
                            WHERE action = 'gift_certificate.store_payout' AND target_id = r->>'payout_id'
                              AND actor_id = '44444444-4444-4444-4444-444444444444') = 1, 'one audit row');

  -- duplicate key (retry) -> idempotent, single row
  r := public.gift_certificate_admin_store_payout('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001',
        100, 'bank_transfer', 'BANK-001', 'Oct batch', 'payout-key-1');
  PERFORM public.t_assert((r->>'ok')::boolean AND (r->>'idempotent')::boolean, 'retry idempotent: ' || r::text);
  PERFORM public.t_assert((SELECT count(*) FROM public.gift_certificate_store_payouts) = 1, 'single payout row');
  PERFORM public.t_assert((SELECT count(*) FROM public.gift_certificate_revenue_ledger WHERE entry_type = 'PAYOUT_PAID') = 1, 'single ledger row');
  PERFORM public.t_assert((SELECT count(*) FROM public.audit_logs WHERE action = 'gift_certificate.store_payout') = 1, 'single audit row');

  -- same key, other amount -> conflict ; new key, same reference (case/space-insensitive) -> duplicate
  r := public.gift_certificate_admin_store_payout('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001',
        50, 'bank_transfer', 'BANK-001', NULL, 'payout-key-1');
  PERFORM public.t_assert(r->>'error' = 'idempotency_key_conflict', 'key conflict: ' || r::text);
  r := public.gift_certificate_admin_store_payout('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001',
        50, 'bank_transfer', ' bank-001 ', NULL, 'payout-key-2');
  PERFORM public.t_assert(r->>'error' = 'payout_reference_duplicate', 'reference duplicate: ' || r::text);

  -- above available -> refused, nothing written
  r := public.gift_certificate_admin_store_payout('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001',
        171, 'bank_transfer', 'BANK-002', NULL, 'payout-key-3');
  PERFORM public.t_assert(r->>'error' = 'payout_exceeds_available' AND (r->>'available')::int = 170, 'over available refused: ' || r::text);

  -- reference / method required
  r := public.gift_certificate_admin_store_payout('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001',
        10, 'bank_transfer', '  ', NULL, 'payout-key-4');
  PERFORM public.t_assert(r->>'error' = 'payout_reference_required', 'reference required: ' || r::text);
  r := public.gift_certificate_admin_store_payout('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001',
        10, '', 'BANK-009', NULL, 'payout-key-4');
  PERFORM public.t_assert(r->>'error' = 'payout_method_required', 'method required: ' || r::text);
  r := public.gift_certificate_admin_store_payout('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001',
        0, 'bank_transfer', 'BANK-009', NULL, 'payout-key-4');
  PERFORM public.t_assert(r->>'error' = 'invalid_args', 'zero amount invalid: ' || r::text);

  -- non-admin (no membership / revoked membership) -> refused
  r := public.gift_certificate_admin_store_payout('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
        10, 'bank_transfer', 'BANK-010', NULL, 'payout-key-5');
  PERFORM public.t_assert(r->>'error' = 'not_admin', 'owner is not admin: ' || r::text);
  r := public.gift_certificate_admin_store_payout('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001',
        10, 'bank_transfer', 'BANK-011', NULL, 'payout-key-6');
  PERFORM public.t_assert(r->>'error' = 'not_admin', 'revoked admin refused: ' || r::text);
  PERFORM public.t_assert((SELECT count(*) FROM public.gift_certificate_store_payouts) = 1, 'still one payout row');

  -- summary reader (Admin + Owner)
  s := public.gift_certificate_store_payout_summary('aaaaaaaa-0000-0000-0000-000000000001');
  PERFORM public.t_assert((s->>'available')::int = 170 AND (s->>'paid_out')::int = 100 AND (s->>'payout_count')::int = 1,
    'summary available 170 / paid 100: ' || s::text);
  PERFORM public.t_assert((public.store_platform_payable_page(NULL, NULL, NULL, 'all', 10, 0)->'gift_rail'->>'paid_out_php')::int = 100,
    'payable page paid out 100');

  -- payouts are immutable
  BEGIN
    UPDATE public.gift_certificate_store_payouts SET amount = 1;
    RAISE EXCEPTION 'ASSERT FAILED: payout row update must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 4 payout (success, idempotent, conflict, reference dup, over available, non-admin, summary)';
END $$;

-- 5) caller role: authenticated JWT is refused inside the function too --------------------------------------
SET test.jwt_role = 'authenticated';
DO $$
DECLARE r jsonb;
BEGIN
  r := public.gift_certificate_admin_store_payout('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001',
        10, 'bank_transfer', 'BANK-020', NULL, 'payout-key-7');
  PERFORM public.t_assert(r->>'error' = 'forbidden', 'non service role forbidden: ' || r::text);
  r := public.credit_coin_from_confirmed_sale('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
        NULL, 1, 'sale_coin:bbbbbbbb-0000-0000-0000-000000000002');
  PERFORM public.t_assert(r->>'error' = 'forbidden', 'mint forbidden for non service role');
  RAISE NOTICE 'PASS 5 role gate';
END $$;
SET test.jwt_role = 'service_role';

-- 6) FIN-13 / D-3: delivery_fee_mode = 'percent' refused for new/updated rows; legacy row untouched ----------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.store_fee_policies(policy_name, fee_percent, delivery_fee_mode, delivery_fee_percent)
    VALUES ('new percent', 7, 'percent', 5);
    RAISE EXCEPTION 'ASSERT FAILED: percent insert must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.store_fee_policies SET delivery_fee_mode = 'percent' WHERE policy_name = 'ok none';
    INSERT INTO public.store_fee_policies(policy_name, fee_percent, delivery_fee_mode) VALUES ('ok none', 7, 'none');
    UPDATE public.store_fee_policies SET delivery_fee_mode = 'percent' WHERE policy_name = 'ok none';
    RAISE EXCEPTION 'ASSERT FAILED: percent update must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.store_fee_policies(policy_name, fee_percent, delivery_fee_mode) VALUES ('ok none', 7, 'none');
  PERFORM public.t_assert((SELECT count(*) FROM public.store_fee_policies WHERE delivery_fee_mode = 'percent') = 1,
    'legacy percent row kept (NOT VALID, D-5)');
  PERFORM public.t_assert((SELECT NOT convalidated FROM pg_constraint
                            WHERE conname = 'store_fee_policies_delivery_fee_mode_not_percent_chk'), 'constraint NOT VALID');
  RAISE NOTICE 'PASS 6 delivery_fee_mode percent refused';
END $$;
