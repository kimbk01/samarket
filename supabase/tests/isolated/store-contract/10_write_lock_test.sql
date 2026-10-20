-- AFTER 20270602140000: N-1 · N-3 · N-2 · N-4A · N-5 assertions. All data changes rolled back.
-- Runner: see 00_fixture.sql header.
BEGIN;
DO $$
DECLARE
  n bigint;
  msg text;
  owner1 constant text := '0000000a-0000-0000-0000-000000000001';
  buyer constant text := 'bbbbbbbb-0000-0000-0000-00000000000b';
  t text;
BEGIN
  -- privilege table: client roles have SELECT only on the locked tables
  FOREACH t IN ARRAY ARRAY['store_inquiries','store_business_verifications','user_addresses','store_economic_point_accounts',
    'store_economic_point_ledger','coin_withdrawal_requests','gift_certificate_revenue_ledger','business_cash_charge_requests',
    'business_cash_conversion_rate_policies','store_settlements']
  LOOP
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT') OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'DELETE') OR has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE')
       OR has_table_privilege('anon', 'public.' || t, 'UPDATE') OR has_table_privilege('service_role', 'public.' || t, 'TRUNCATE') THEN
      RAISE EXCEPTION 'FAIL privileges still open on %', t;
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'FAIL SELECT lost on % for authenticated', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS privilege table (client roles SELECT only, no TRUNCATE for service_role)';

  -- N-1 store_inquiries
  PERFORM public.iso_expect_denied('N-1 owner UPDATE inquiry', 'authenticated', owner1,
    $q$UPDATE public.store_inquiries SET content = 'tampered' WHERE id = '33333333-0000-0000-0000-000000000001'$q$);
  PERFORM public.iso_expect_denied('N-1 buyer INSERT inquiry', 'authenticated', buyer,
    $q$INSERT INTO public.store_inquiries (store_id, from_user_id, subject, content) VALUES ('11111111-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 's', 'c')$q$);
  PERFORM public.iso_expect_denied('N-1 anon DELETE inquiry', 'anon', '', $q$DELETE FROM public.store_inquiries$q$);
  n := public.iso_expect_ok('N-1 buyer still SELECTs own inquiry', 'authenticated', buyer,
    $q$SELECT 1 FROM public.store_inquiries WHERE content = 'original text'$q$);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL N-1 buyer select rows=%', n; END IF;
  n := public.iso_expect_ok('N-1 service_role owner answer (API path)', 'service_role', '',
    $q$UPDATE public.store_inquiries SET answer = 'ok', status = 'answered' WHERE id = '33333333-0000-0000-0000-000000000001'$q$);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL N-1 service answer rows=%', n; END IF;
  n := public.iso_expect_ok('N-1 service_role buyer create (API path)', 'service_role', '',
    $q$INSERT INTO public.store_inquiries (store_id, from_user_id, subject, content) VALUES ('11111111-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 's2', 'c2')$q$);
  IF (SELECT content FROM public.store_inquiries WHERE id = '33333333-0000-0000-0000-000000000001') <> 'original text' THEN
    RAISE EXCEPTION 'FAIL N-1 original text changed';
  END IF;

  -- N-3 store_business_verifications
  PERFORM public.iso_expect_denied('N-3 owner self-approve', 'authenticated', owner1,
    $q$UPDATE public.store_business_verifications SET business_verification_status = 'approved'$q$);
  PERFORM public.iso_expect_denied('N-3 owner INSERT', 'authenticated', owner1,
    $q$INSERT INTO public.store_business_verifications (store_id, owner_user_id) VALUES ('11111111-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001')$q$);
  n := public.iso_expect_ok('N-3 service_role write', 'service_role', '',
    $q$UPDATE public.store_business_verifications SET review_memo = 'x'$q$);

  -- N-2 user_addresses
  PERFORM public.iso_expect_denied('N-2 member forges canonical_lgu_id', 'authenticated', buyer,
    $q$UPDATE public.user_addresses SET canonical_lgu_id = 'ph-forged'$q$);
  PERFORM public.iso_expect_denied('N-2 member INSERT address', 'authenticated', buyer,
    $q$INSERT INTO public.user_addresses (user_id, canonical_lgu_id) VALUES ('bbbbbbbb-0000-0000-0000-00000000000b', 'ph-x')$q$);
  PERFORM public.iso_expect_denied('N-2 member DELETE address', 'authenticated', buyer, $q$DELETE FROM public.user_addresses$q$);
  n := public.iso_expect_ok('N-2 member still SELECTs own address', 'authenticated', buyer,
    $q$SELECT 1 FROM public.user_addresses WHERE canonical_lgu_id = 'ph-qc'$q$);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL N-2 select rows=%', n; END IF;
  n := public.iso_expect_ok('N-2 service_role address write (API path)', 'service_role', '',
    $q$UPDATE public.user_addresses SET canonical_lgu_id = 'ph-qc-derived'$q$);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL N-2 service rows=%', n; END IF;

  -- N-4A money tables
  PERFORM public.iso_expect_denied('N-4A authenticated INSERT coin ledger', 'authenticated', owner1,
    $q$INSERT INTO public.store_economic_point_ledger (store_id, amount) VALUES ('11111111-0000-0000-0000-000000000001', 1)$q$);
  PERFORM public.iso_expect_denied('N-4A service_role UPDATE coin balance', 'service_role', '',
    $q$UPDATE public.store_economic_point_accounts SET balance = 999999$q$);
  PERFORM public.iso_expect_denied('N-4A service_role INSERT coin ledger', 'service_role', '',
    $q$INSERT INTO public.store_economic_point_ledger (store_id, amount) VALUES ('11111111-0000-0000-0000-000000000001', 1)$q$);
  PERFORM public.iso_expect_denied('N-4A service_role UPDATE withdrawal', 'service_role', '',
    $q$UPDATE public.coin_withdrawal_requests SET status = 'PAID'$q$);
  PERFORM public.iso_expect_denied('N-4A service_role DELETE gift revenue', 'service_role', '',
    $q$DELETE FROM public.gift_certificate_revenue_ledger$q$);
  PERFORM public.iso_expect_denied('N-4A service_role TRUNCATE charge requests', 'service_role', '',
    $q$TRUNCATE public.business_cash_charge_requests$q$);
  PERFORM public.iso_expect_denied('N-4A service_role TRUNCATE settlements', 'service_role', '',
    $q$TRUNCATE public.store_settlements$q$);
  PERFORM public.iso_expect_denied('N-4A authenticated TRUNCATE coin ledger', 'authenticated', owner1,
    $q$TRUNCATE public.store_economic_point_ledger$q$);
  -- kept service_role writers (N-4B later)
  n := public.iso_expect_ok('N-4A keep service_role INSERT charge request', 'service_role', '',
    $q$INSERT INTO public.business_cash_charge_requests (owner_user_id, amount) VALUES ('0000000a-0000-0000-0000-000000000001', 100)$q$);
  n := public.iso_expect_ok('N-4A keep service_role UPDATE settlements', 'service_role', '',
    $q$UPDATE public.store_settlements SET commission_reversal_amount = 5$q$);
  n := public.iso_expect_ok('N-4A keep service_role UPDATE conversion policy', 'service_role', '',
    $q$UPDATE public.business_cash_conversion_rate_policies SET rate = 2$q$);
  -- SECURITY DEFINER writer (postgres-owned RPC path) still works for service_role
  n := public.iso_expect_ok('N-4A DEFINER RPC writes coin/gift/withdrawal', 'service_role', '',
    $q$SELECT public.iso_coin_definer_credit('11111111-0000-0000-0000-000000000001', 50, 'sale_coin:x')$q$);
  IF (SELECT balance FROM public.store_economic_point_accounts WHERE store_id = '11111111-0000-0000-0000-000000000001') <> 150 THEN
    RAISE EXCEPTION 'FAIL N-4A DEFINER credit balance';
  END IF;
  -- duplicate idempotency key through the RPC still fails on the ledger UNIQUE (no silent double credit)
  BEGIN
    PERFORM public.iso_coin_definer_credit('11111111-0000-0000-0000-000000000001', 50, 'sale_coin:x');
    RAISE EXCEPTION 'FAIL N-4A duplicate credit accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS [N-4A duplicate idempotency key rejected]';
  END;

  -- defense in depth: even if a later migration re-grants ALL and re-adds an owner write policy,
  -- the trigger still blocks client roles
  GRANT ALL ON public.store_inquiries, public.user_addresses, public.store_economic_point_ledger TO authenticated;
  CREATE POLICY iso_regression_all ON public.store_inquiries TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY iso_regression_all ON public.user_addresses TO authenticated USING (true) WITH CHECK (true);
  CREATE POLICY iso_regression_all ON public.store_economic_point_ledger TO authenticated USING (true) WITH CHECK (true);
  msg := public.iso_expect_denied('trigger blocks after accidental re-GRANT (inquiries)', 'authenticated', owner1,
    $q$UPDATE public.store_inquiries SET content = 'tampered'$q$);
  IF msg NOT LIKE 'client_role_direct_write_forbidden:store_inquiries%' THEN RAISE EXCEPTION 'FAIL trigger msg %', msg; END IF;
  msg := public.iso_expect_denied('trigger blocks after accidental re-GRANT (addresses)', 'authenticated', buyer,
    $q$UPDATE public.user_addresses SET canonical_lgu_id = 'ph-forged'$q$);
  IF msg NOT LIKE 'client_role_direct_write_forbidden:user_addresses%' THEN RAISE EXCEPTION 'FAIL trigger msg %', msg; END IF;
  msg := public.iso_expect_denied('trigger blocks after accidental re-GRANT (coin ledger)', 'authenticated', owner1,
    $q$INSERT INTO public.store_economic_point_ledger (store_id, amount) VALUES ('11111111-0000-0000-0000-000000000001', 1)$q$);
  IF msg NOT LIKE 'client_role_direct_write_forbidden:store_economic_point_ledger%' THEN RAISE EXCEPTION 'FAIL trigger msg %', msg; END IF;

  -- N-5: anon SELECT is now an explicit table-privilege denial (no exposure change); authenticated unchanged
  msg := public.iso_expect_denied('N-5 anon stores select', 'anon', '', $q$SELECT count(*) FROM public.stores$q$);
  IF msg NOT LIKE 'permission denied for table stores%' THEN RAISE EXCEPTION 'FAIL N-5 msg %', msg; END IF;
  msg := public.iso_expect_denied('N-5 anon store_products select', 'anon', '', $q$SELECT count(*) FROM public.store_products$q$);
  IF msg NOT LIKE 'permission denied for table store_products%' THEN RAISE EXCEPTION 'FAIL N-5 msg %', msg; END IF;
  PERFORM public.iso_expect_denied('N-5 anon cannot execute internal.is_admin_user', 'anon', '',
    $q$SELECT internal.is_admin_user()$q$);
  n := public.iso_expect_ok('N-5 authenticated owner sees own + public stores', 'authenticated', '0000000a-0000-0000-0000-000000000002',
    $q$SELECT 1 FROM public.stores$q$);
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL N-5 authenticated rows=% (expected approved+own rejected=2)', n; END IF;
  n := public.iso_expect_ok('N-5 service_role reads stores', 'service_role', '', $q$SELECT 1 FROM public.stores$q$);
END $$;
ROLLBACK;
