-- Baseline BEFORE 20270602140000 (reproduces the audited defects on the prod-like fixture). All changes rolled back.
-- Runner: see 00_fixture.sql header (01_helpers.sql must be loaded first).
BEGIN;
DO $$
DECLARE n bigint;
BEGIN
  -- N-1: owner rewrites the buyer's inquiry text
  n := public.iso_expect_ok('baseline N-1 owner edits inquiry content', 'authenticated', '0000000a-0000-0000-0000-000000000001',
    $q$UPDATE public.store_inquiries SET content = 'tampered' WHERE id = '33333333-0000-0000-0000-000000000001'$q$);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL baseline N-1 expected 1 row, got %', n; END IF;
  -- N-3: owner self-approves business verification
  n := public.iso_expect_ok('baseline N-3 owner self-approve', 'authenticated', '0000000a-0000-0000-0000-000000000001',
    $q$UPDATE public.store_business_verifications SET business_verification_status = 'approved'$q$);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL baseline N-3 expected 1 row, got %', n; END IF;
  -- N-2: member forges canonical_lgu_id
  n := public.iso_expect_ok('baseline N-2 member forges canonical_lgu_id', 'authenticated', 'bbbbbbbb-0000-0000-0000-00000000000b',
    $q$UPDATE public.user_addresses SET canonical_lgu_id = 'ph-forged'$q$);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL baseline N-2 expected 1 row, got %', n; END IF;
  -- N-4A: service_role can rewrite a Coin balance directly
  n := public.iso_expect_ok('baseline N-4A service_role edits coin balance', 'service_role', '',
    $q$UPDATE public.store_economic_point_accounts SET balance = 999999$q$);
  -- N-5: anon direct SELECT fails on the function permission (accidental error)
  PERFORM public.iso_expect_denied('baseline N-5 anon stores select (function error)', 'anon', '',
    $q$SELECT count(*) FROM public.stores$q$);
END $$;
ROLLBACK;
