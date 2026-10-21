-- FIN-08: admin correction RPCs (super_admin, reason+evidence, ledger+audit, no negative balance)
--         + R-D5 legacy_preserved classification in the integrity report and exception scan.
SET test.jwt_role = 'service_role';

DO $$
DECLARE
  v_store uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  v_super uuid := '55555555-5555-5555-5555-555555555555';
  v_res jsonb; v_bal bigint; v_led bigint; v_aud bigint;
BEGIN
  PERFORM public.t_assert(NOT has_function_privilege('authenticated', 'public.admin_adjust_business_cash(uuid,uuid,text,bigint,text,text,text,boolean)', 'EXECUTE'), 'cash adjust: authenticated no EXECUTE');
  PERFORM public.t_assert(has_function_privilege('service_role', 'public.admin_adjust_business_cash(uuid,uuid,text,bigint,text,text,text,boolean)', 'EXECUTE'), 'cash adjust: service_role EXECUTE');
  PERFORM public.t_assert(NOT has_function_privilege('anon', 'public.admin_adjust_store_coin(uuid,uuid,text,integer,text,text,text,boolean)', 'EXECUTE'), 'coin adjust: anon no EXECUTE');

  SELECT balance_minor INTO v_bal FROM public.business_cash_accounts WHERE store_id = v_store;
  SELECT count(*) INTO v_led FROM public.business_cash_ledger WHERE store_id = v_store;
  SELECT count(*) INTO v_aud FROM public.audit_logs;

  -- non-super_admin (plain admin) refused
  v_res := public.admin_adjust_business_cash('44444444-4444-4444-4444-444444444444', v_store, 'credit', 1000, 'fix', 'TICKET-1', 'adj-1');
  PERFORM public.t_assert(v_res->>'error' = 'super_admin_required', 'admin (not super) refused');
  v_res := public.admin_adjust_business_cash('22222222-2222-2222-2222-222222222222', v_store, 'credit', 1000, 'fix', 'TICKET-1', 'adj-1');
  PERFORM public.t_assert(v_res->>'error' = 'super_admin_required', 'member refused');
  -- reason / evidence required
  v_res := public.admin_adjust_business_cash(v_super, v_store, 'credit', 1000, ' ', 'TICKET-1', 'adj-1');
  PERFORM public.t_assert(v_res->>'error' = 'reason_required', 'reason required');
  v_res := public.admin_adjust_business_cash(v_super, v_store, 'credit', 1000, 'bank mismatch', '', 'adj-1');
  PERFORM public.t_assert(v_res->>'error' = 'evidence_required', 'evidence required');
  -- negative balance refused
  v_res := public.admin_adjust_business_cash(v_super, v_store, 'debit', v_bal + 1, 'over debit', 'TICKET-2', 'adj-neg');
  PERFORM public.t_assert(v_res->>'error' = 'insufficient_balance', 'negative balance refused: ' || v_res::text);
  PERFORM public.t_assert((SELECT count(*) FROM public.business_cash_ledger WHERE store_id = v_store) = v_led
                          AND (SELECT count(*) FROM public.audit_logs) = v_aud, 'refusals wrote nothing');

  -- credit 1,000: balance moves, one ledger row + one audit row
  v_res := public.admin_adjust_business_cash(v_super, v_store, 'credit', 1000, 'bank deposit missed', 'BPI-TX-9', 'adj-1');
  PERFORM public.t_assert(v_res->>'ok' = 'true' AND (v_res->>'balance_after_minor')::bigint = v_bal + 1000, 'credit ok: ' || v_res::text);
  PERFORM public.t_assert((SELECT count(*) FROM public.business_cash_ledger WHERE store_id = v_store AND entry_kind = 'ADMIN_ADJUST') = 1, 'one ADMIN_ADJUST row');
  PERFORM public.t_assert((SELECT count(*) FROM public.audit_logs WHERE action = 'business_cash.admin_adjust' AND target_id = v_store::text
                             AND actor_id = v_super AND after_json->>'evidence_ref' = 'BPI-TX-9') = 1, 'one audit row');
  PERFORM public.t_assert(public.t_ledger_sum(v_store) = (SELECT balance_minor FROM public.business_cash_accounts WHERE store_id = v_store), 'balance = ledger sum after credit');
  -- replay
  v_res := public.admin_adjust_business_cash(v_super, v_store, 'credit', 1000, 'bank deposit missed', 'BPI-TX-9', 'adj-1');
  PERFORM public.t_assert(v_res->>'idempotent' = 'true', 'replay idempotent');
  v_res := public.admin_adjust_business_cash(v_super, v_store, 'debit', 1000, 'bank deposit missed', 'BPI-TX-9', 'adj-1');
  PERFORM public.t_assert(v_res->>'error' = 'idempotency_key_reused', 'same key other direction refused');
  PERFORM public.t_assert((SELECT count(*) FROM public.audit_logs WHERE action = 'business_cash.admin_adjust') = 1, 'replay wrote no audit');

  -- debit back to the previous balance
  v_res := public.admin_adjust_business_cash(v_super, v_store, 'debit', 1000, 'reverse test credit', 'BPI-TX-9', 'adj-2');
  PERFORM public.t_assert(v_res->>'ok' = 'true' AND (v_res->>'balance_after_minor')::bigint = v_bal, 'debit ok');

  -- ledger-only mode: balance unchanged, ledger row recorded (creates a new balance/ledger difference on purpose)
  v_res := public.admin_adjust_business_cash(v_super, v_store, 'credit', 100, 'ledger-only probe', 'TICKET-LO', 'adj-lo', true);
  PERFORM public.t_assert(v_res->>'ok' = 'true' AND (v_res->>'balance_after_minor')::bigint = v_bal, 'ledger-only keeps balance');
  PERFORM public.t_assert(public.t_ledger_sum(v_store) = v_bal + 100, 'ledger-only moved the ledger sum only');
  RAISE NOTICE 'PASS FIN-08 Cash: non-super refused, evidence required, negative refused, ledger+audit written, replay idempotent, ledger-only';
END $$;

DO $$
DECLARE
  v_store uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  v_super uuid := '55555555-5555-5555-5555-555555555555';
  v_res jsonb;
BEGIN
  v_res := public.admin_adjust_store_coin('44444444-4444-4444-4444-444444444444', v_store, 'credit', 50, 'fix', 'T-C', 'coin-1');
  PERFORM public.t_assert(v_res->>'error' = 'super_admin_required', 'coin: admin refused');
  v_res := public.admin_adjust_store_coin(v_super, v_store, 'debit', 1, 'over', 'T-C', 'coin-neg');
  PERFORM public.t_assert(v_res->>'error' = 'insufficient_balance', 'coin: negative refused');
  v_res := public.admin_adjust_store_coin(v_super, v_store, 'credit', 50, 'sale coin missed', 'ORDER-123', 'coin-1');
  PERFORM public.t_assert(v_res->>'ok' = 'true' AND (v_res->>'balance_after')::int = 50, 'coin credit ok');
  PERFORM public.t_assert((SELECT amount FROM public.store_economic_point_ledger WHERE idempotency_key = 'admin_adjust_coin:coin-1') = 50, 'coin ledger signed +50');
  v_res := public.admin_adjust_store_coin(v_super, v_store, 'debit', 20, 'partial reverse', 'ORDER-123', 'coin-2');
  PERFORM public.t_assert((v_res->>'balance_after')::int = 30
                          AND (SELECT amount FROM public.store_economic_point_ledger WHERE idempotency_key = 'admin_adjust_coin:coin-2') = -20, 'coin debit signed -20');
  PERFORM public.t_assert((SELECT count(*) FROM public.audit_logs WHERE action = 'store_coin.admin_adjust') = 2, 'coin audit rows');
  RAISE NOTICE 'PASS FIN-08 Coin: admin refused, negative refused, signed ledger + audit';
END $$;

-- R-D5: pre-cutoff violations -> legacy_preserved (values untouched, not alerted); new violations alerted.
DO $$
DECLARE v_rep jsonb; v_scan jsonb; v_new uuid;
BEGIN
  v_rep := public.store_commission_integrity_report(NULL);
  PERFORM public.t_assert((v_rep->'balance_eq_ledger_sum'->>'violations')::int = 2, 'two balance mismatches reported (C legacy, D new): ' || v_rep::text);
  PERFORM public.t_assert((v_rep->'balance_eq_ledger_sum'->>'legacy_preserved')::int = 1, 'store C mismatch legacy_preserved');
  PERFORM public.t_assert(v_rep->'balance_eq_ledger_sum'->'new_ids' = '["aaaaaaaa-0000-0000-0000-000000000004"]'::jsonb, 'store D mismatch is new');
  PERFORM public.t_assert((v_rep->'status_matches_amounts'->>'violations')::int = 1
                          AND (v_rep->'status_matches_amounts'->>'legacy_preserved')::int = 1
                          AND (v_rep->'status_matches_amounts'->>'new_violations')::int = 0, 'legacy obligation status mismatch preserved');
  PERFORM public.t_assert(v_rep ? 'legacy_cutoff', 'cutoff reported');

  -- a new (post-cutoff) obligation violation
  v_new := public.t_obligation('aaaaaaaa-0000-0000-0000-000000000004', 300);
  UPDATE public.store_sale_fee_obligations SET fee_paid_minor = 300, fee_outstanding_minor = 0 WHERE id = v_new;
  -- a new (post-cutoff) payout suspect
  INSERT INTO public.store_orders(id, order_no, store_id, order_status) VALUES
    ('bbbbbbbb-0000-0000-0000-000000000002', 'NEW-COIN', 'aaaaaaaa-0000-0000-0000-000000000004', 'completed');
  INSERT INTO public.test_payable_rows(row) VALUES (jsonb_build_object(
    'order_id', 'bbbbbbbb-0000-0000-0000-000000000002', 'order_no', 'NEW-COIN',
    'store_id', 'aaaaaaaa-0000-0000-0000-000000000004', 'store_name', 'Store D',
    'coin_over_credit', 10, 'class', 'coin_over', 'legacy_net_php', 0));

  v_scan := public.store_commission_enqueue_exception_notifications();
  PERFORM public.t_assert(v_scan->>'ok' = 'true', 'scan ok: ' || v_scan::text);
  PERFORM public.t_assert(NOT EXISTS (SELECT 1 FROM public.admin_notification_outbox WHERE source_key LIKE '%aaaaaaaa-0000-0000-0000-000000000003%'),
                          'no alert for legacy store C mismatch');
  PERFORM public.t_assert(EXISTS (SELECT 1 FROM public.admin_notification_outbox
                                   WHERE source_key = 'settlement_exception:balance_mismatch:aaaaaaaa-0000-0000-0000-000000000004:-100'),
                          'alert for new store D mismatch');
  PERFORM public.t_assert((SELECT count(*) FROM public.admin_notification_outbox WHERE source_key LIKE 'settlement_exception:status_matches_amounts:%') = 1
                          AND EXISTS (SELECT 1 FROM public.admin_notification_outbox WHERE source_key = 'settlement_exception:status_matches_amounts:' || v_new::text),
                          'only the new obligation violation alerted');
  PERFORM public.t_assert(NOT EXISTS (SELECT 1 FROM public.admin_notification_outbox WHERE source_key LIKE '%bbbbbbbb-0000-0000-0000-000000000001%'),
                          'no alert for legacy coin over-credit order');
  PERFORM public.t_assert(EXISTS (SELECT 1 FROM public.admin_notification_outbox WHERE source_key = 'settlement_exception:coin_over_credit:bbbbbbbb-0000-0000-0000-000000000002'),
                          'alert for new coin over-credit order');
  -- Korean copy survives the ASCII escapes byte-for-byte
  PERFORM public.t_assert((SELECT payload->>'title' FROM public.admin_notification_outbox
                            WHERE source_key = 'settlement_exception:coin_over_credit:bbbbbbbb-0000-0000-0000-000000000002')
                          = '[중복 지급 의심] Store D · #NEW-COIN', 'alert copy identical to production text');
  PERFORM public.t_assert((SELECT payload->>'body' FROM public.admin_notification_outbox
                            WHERE source_key = 'settlement_exception:balance_mismatch:aaaaaaaa-0000-0000-0000-000000000004:-100')
                          LIKE '캐시 잔액 % ≠ 원장 합계 % (차이 %) · 근거 확인 전 임의 정정 금지', 'mismatch copy identical');

  -- D-5: every pre-existing row is byte-for-byte unchanged
  PERFORM public.t_assert(NOT EXISTS (
    SELECT * FROM public.t_legacy_snapshot s
     WHERE NOT EXISTS (
       SELECT 1 FROM (
         SELECT 'acct'::text AS k, store_id::text AS id, balance_minor::text AS v FROM public.business_cash_accounts
         UNION ALL SELECT 'ledger', id::text, amount_minor::text || ':' || idempotency_key FROM public.business_cash_ledger
         UNION ALL SELECT 'ob', id::text, fee_paid_minor::text || ':' || fee_outstanding_minor::text || ':' || status FROM public.store_sale_fee_obligations
         UNION ALL SELECT 'req', id::text, status || ':' || amount_minor::text FROM public.business_cash_charge_requests
       ) c WHERE c.k = s.k AND c.id = s.id AND c.v = s.v)), 'D-5: legacy rows untouched');
  RAISE NOTICE 'PASS FIN-08 R-D5: legacy violations preserved and not alerted, new violations alerted, legacy rows unchanged';
END $$;

-- 2-B additions survive the FIN-08 redefinition (sale_coin_le_platform_coupon with its own legacy split).
DO $$
DECLARE v_rep jsonb;
BEGIN
  INSERT INTO public.store_economic_point_ledger(store_id, entry_kind, amount, balance_after, related_type, related_id, idempotency_key, created_at)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000003', 'SALE_EARN', 900, 900, 'store_order', 'bbbbbbbb-0000-0000-0000-000000000001',
          'sale_coin:bbbbbbbb-0000-0000-0000-000000000001', '2026-09-05 00:00:00+00'),
         ('aaaaaaaa-0000-0000-0000-000000000004', 'SALE_EARN', 10, 10, 'store_order', 'bbbbbbbb-0000-0000-0000-000000000002',
          'sale_coin:bbbbbbbb-0000-0000-0000-000000000002', now());
  v_rep := public.store_commission_integrity_report(NULL);
  PERFORM public.t_assert(v_rep ? 'sale_coin_le_platform_coupon', '2-B key kept');
  PERFORM public.t_assert((v_rep->'sale_coin_le_platform_coupon'->>'violations')::int = 1
                          AND (v_rep->'sale_coin_le_platform_coupon'->>'legacy_preserved')::int = 1,
                          '2-B legacy split kept: ' || (v_rep->'sale_coin_le_platform_coupon')::text);
  RAISE NOTICE 'PASS 2-B sale_coin_le_platform_coupon check preserved on top of FIN-08';
END $$;
