-- GFT-08 assertions: gift_certificate_issued_count_integrity_report classifies legacy (pre-cutoff) vs new mismatches.
-- Requires 00_fixture.sql + the earlier test files + supabase/migrations/20270603140200_gift_issued_count_integrity_report.sql.

-- OLD: prod-like legacy row (issued 26, 46 instances all before cutoff, product untouched since 2026-08-28)
INSERT INTO public.gift_certificate_products(id, store_id, title, face_value, purchase_price, issued_count, active,
  archived_at, created_at, updated_at)
VALUES ('dddddddd-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'OLD', 1000, 1000, 26, false,
  '2026-08-28 06:11:44+00', '2026-08-26 21:48:28+00', '2026-08-28 20:43:12+00');
INSERT INTO public.gift_certificate_instances(product_id, store_id, purchaser_user_id, current_owner_user_id,
  face_value, purchase_price, remaining_balance, created_at)
SELECT 'dddddddd-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001',
       'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 1000, 1000, 1000,
       timestamptz '2026-09-17 14:23:14+00' - (g || ' hours')::interval
  FROM generate_series(0, 45) g;

-- NEW: counter drift after the cutoff (issued 5, 3 instances created now)
INSERT INTO public.gift_certificate_products(id, store_id, title, face_value, purchase_price, issued_count)
VALUES ('dddddddd-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001', 'NEW', 1000, 1000, 5);
INSERT INTO public.gift_certificate_instances(product_id, store_id, purchaser_user_id, current_owner_user_id,
  face_value, purchase_price, remaining_balance)
SELECT 'dddddddd-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001',
       'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 1000, 1000, 1000
  FROM generate_series(1, 3);

-- OLD2: pre-cutoff product with mismatch that also got an instance after the cutoff -> reported as mismatch
INSERT INTO public.gift_certificate_products(id, store_id, title, face_value, purchase_price, issued_count, created_at, updated_at)
VALUES ('dddddddd-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000001', 'OLD2', 1000, 1000, 0,
  '2026-08-01', '2026-08-01');
INSERT INTO public.gift_certificate_instances(product_id, store_id, purchaser_user_id, current_owner_user_id,
  face_value, purchase_price, remaining_balance, created_at)
VALUES ('dddddddd-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 1000, 1000, 1000, '2026-10-21 00:00:00+00');

-- OK: consistent pre-cutoff product -> not listed
INSERT INTO public.gift_certificate_products(id, store_id, title, face_value, purchase_price, issued_count, created_at, updated_at)
VALUES ('dddddddd-0000-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-000000000001', 'OK', 1000, 1000, 1,
  '2026-08-01', '2026-08-01');
INSERT INTO public.gift_certificate_instances(product_id, store_id, purchaser_user_id, current_owner_user_id,
  face_value, purchase_price, remaining_balance, created_at)
VALUES ('dddddddd-0000-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 1000, 1000, 1000, '2026-08-02');

DO $$
DECLARE r jsonb; v_rows jsonb;
BEGIN
  r := public.gift_certificate_issued_count_integrity_report();
  RAISE NOTICE 'report: %', r::text;
  v_rows := r->'rows';
  PERFORM public.t_assert(r->>'ok' = 'true' AND (r->>'cutoff_at')::timestamptz = '2026-10-20 20:30:00+00', 'report ok + cutoff');
  PERFORM public.t_assert((r->>'legacy_preserved_count')::int = 1, 'legacy_preserved_count = 1');
  PERFORM public.t_assert((r->>'mismatch_count')::int = 2, 'mismatch_count = 2 (NEW, OLD2)');
  PERFORM public.t_assert(jsonb_array_length(v_rows) = 3, 'only mismatched products listed');
  PERFORM public.t_assert(EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) x
    WHERE x->>'product_id' = 'dddddddd-0000-0000-0000-0000000000a1' AND x->>'classification' = 'legacy_preserved'
      AND (x->>'issued_count')::int = 26 AND (x->>'instance_count')::int = 46 AND (x->>'delta')::int = -20),
    'OLD -> legacy_preserved, delta -20');
  PERFORM public.t_assert(EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) x
    WHERE x->>'product_id' = 'dddddddd-0000-0000-0000-0000000000a2' AND x->>'classification' = 'mismatch'
      AND (x->>'delta')::int = 2), 'NEW -> mismatch, delta 2');
  PERFORM public.t_assert(EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) x
    WHERE x->>'product_id' = 'dddddddd-0000-0000-0000-0000000000a3' AND x->>'classification' = 'mismatch'
      AND (x->>'post_cutoff_instance_count')::int = 1), 'OLD2 with post-cutoff instance -> mismatch');
  PERFORM public.t_assert(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) x
    WHERE x->>'product_id' IN ('dddddddd-0000-0000-0000-0000000000a4', 'bbbbbbbb-0000-0000-0000-0000000000a7',
                               'bbbbbbbb-0000-0000-0000-0000000000a8')), 'consistent products (incl. GFT-07 purchases) not listed');
  PERFORM public.t_assert(has_function_privilege('service_role', 'public.gift_certificate_issued_count_integrity_report()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.gift_certificate_issued_count_integrity_report()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.gift_certificate_issued_count_integrity_report()', 'EXECUTE'),
    'report grants: service_role only');
  PERFORM public.t_assert((SELECT provolatile = 's' FROM pg_proc
    WHERE oid = 'public.gift_certificate_issued_count_integrity_report()'::regprocedure), 'report is STABLE (read-only)');
END $$;
