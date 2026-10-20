-- AFTER 20270602140100: ND-2 core info re-verification flag (columns, constraints, owner set / admin CAS clear).
-- The "approved + real core change only" decision itself is the TS rule (lib/stores/store-core-info-reverification.ts, vitest);
-- here we prove the DB contract the two server writers rely on. All changes rolled back. Runner: see 00_fixture.sql header.
BEGIN;
DO $$
DECLARE
  n bigint;
  st text;
  v_changed timestamptz;
BEGIN
  -- existing rows get the constant default (no rewrite of old values, D-5)
  IF EXISTS (SELECT 1 FROM public.stores WHERE core_info_review_status <> 'none' OR core_info_changed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL ND-2 existing rows not defaulted to none';
  END IF;
  RAISE NOTICE 'PASS [ND-2 existing rows default none]';

  -- constraints
  BEGIN
    UPDATE public.stores SET core_info_review_status = 'whatever' WHERE id = '11111111-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL ND-2 invalid status accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS [ND-2 invalid status rejected]';
  END;
  BEGIN
    UPDATE public.stores SET core_info_review_status = 'pending_reverification' WHERE id = '11111111-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL ND-2 pending without changed_at accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS [ND-2 pending requires changed_at]';
  END;

  -- client roles cannot set or clear the flag directly (P0 stores lock)
  PERFORM public.iso_expect_denied('ND-2 owner direct flag clear', 'authenticated', '0000000a-0000-0000-0000-000000000001',
    $q$UPDATE public.stores SET core_info_review_status = 'none'$q$);

  -- owner PATCH path (service_role): address change + flag in ONE update
  n := public.iso_expect_ok('ND-2 owner PATCH sets flag atomically', 'service_role', '',
    $q$UPDATE public.stores SET address_line1 = '9 New St', lat = 14.70,
         core_info_review_status = 'pending_reverification', core_info_changed_at = '2026-10-21T01:00:00Z',
         core_info_changed_fields = ARRAY['address_line1','lat']
       WHERE id = '11111111-0000-0000-0000-000000000001'$q$);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL ND-2 set rows=%', n; END IF;

  -- admin clear with a STALE expected changed_at (owner changed again after the admin loaded) -> 0 rows (409)
  n := public.iso_expect_ok('ND-2 admin clear stale expected -> 0 rows', 'service_role', '',
    $q$UPDATE public.stores SET core_info_review_status = 'none', core_info_verified_at = now()
       WHERE id = '11111111-0000-0000-0000-000000000001' AND core_info_review_status = 'pending_reverification'
         AND core_info_changed_at = '2026-10-20T00:00:00Z'$q$);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL ND-2 stale clear rows=%', n; END IF;

  -- admin clear with the current changed_at -> 1 row
  n := public.iso_expect_ok('ND-2 admin clear (CAS) ok', 'service_role', '',
    $q$UPDATE public.stores SET core_info_review_status = 'none', core_info_verified_at = now(),
         core_info_verified_by = 'aaaaaaaa-0000-0000-0000-00000000000a'
       WHERE id = '11111111-0000-0000-0000-000000000001' AND core_info_review_status = 'pending_reverification'
         AND core_info_changed_at = '2026-10-21T01:00:00Z'$q$);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL ND-2 clear rows=%', n; END IF;

  -- duplicate clear (double click / second admin) -> 0 rows (409 status_changed), state unchanged
  n := public.iso_expect_ok('ND-2 duplicate clear -> 0 rows', 'service_role', '',
    $q$UPDATE public.stores SET core_info_review_status = 'none'
       WHERE id = '11111111-0000-0000-0000-000000000001' AND core_info_review_status = 'pending_reverification'$q$);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL ND-2 duplicate clear rows=%', n; END IF;
  SELECT core_info_review_status, core_info_changed_at INTO st, v_changed
  FROM public.stores WHERE id = '11111111-0000-0000-0000-000000000001';
  IF st <> 'none' OR v_changed IS NULL THEN RAISE EXCEPTION 'FAIL ND-2 final state % %', st, v_changed; END IF;
  RAISE NOTICE 'PASS [ND-2 final state none, changed_at kept for history]';
END $$;
ROLLBACK;
