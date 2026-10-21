-- Stage 3-C assertions (after the migration). Throwaway local PostgreSQL 16 only.
SET client_min_messages = notice;

-- 1. Legacy rows untouched by the migration; new columns NULL on them (D-5).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.t_legacy_snapshot s
      JOIN public.store_coupon_campaigns c ON c.id = s.id
     WHERE s.h IS DISTINCT FROM md5(concat_ws('|', c.lifecycle_state, c.is_active, c.end_at, c.updated_at, c.max_uses_per_user, c.title))
  ) THEN RAISE EXCEPTION 'ASSERT FAILED: legacy row changed by migration'; END IF;
  IF EXISTS (SELECT 1 FROM public.store_coupon_campaigns
              WHERE paused_by IS NOT NULL OR source_campaign_id IS NOT NULL OR client_request_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ASSERT FAILED: new columns not NULL on legacy rows';
  END IF;
  RAISE NOTICE 'PASS 1 legacy rows unchanged, new columns NULL';
END $$;

-- 2. paused_by domain.
DO $$
BEGIN
  BEGIN
    UPDATE public.store_coupon_campaigns SET paused_by = 'buyer' WHERE id = 'c0000000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'ASSERT FAILED: paused_by accepted buyer';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.store_coupon_campaigns SET paused_by = 'admin' WHERE id = 'c0000000-0000-0000-0000-000000000003';
  UPDATE public.store_coupon_campaigns SET paused_by = NULL WHERE id = 'c0000000-0000-0000-0000-000000000003';
  RAISE NOTICE 'PASS 2 paused_by CHECK (owner|admin|NULL)';
END $$;

-- 3. ADS-24: new rows must have max_uses_per_user = 1 (NOT VALID: the legacy value-2 row was not re-validated).
DO $$
BEGIN
  BEGIN
    INSERT INTO public.store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at, max_uses_per_user)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'multi', 'fixed_amount', 10, now(), now() + interval '1 day', 2);
    RAISE EXCEPTION 'ASSERT FAILED: max_uses_per_user 2 accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT convalidated FROM pg_constraint WHERE conname = 'store_coupon_campaigns_max_uses_one_chk') THEN
    RAISE EXCEPTION 'ASSERT FAILED: max uses check should be NOT VALID';
  END IF;
  IF (SELECT max_uses_per_user FROM public.store_coupon_campaigns WHERE id = 'c0000000-0000-0000-0000-000000000006') <> 2 THEN
    RAISE EXCEPTION 'ASSERT FAILED: legacy multi-use row changed';
  END IF;
  RAISE NOTICE 'PASS 3 max_uses_per_user = 1 for new rows, legacy untouched';
END $$;

-- 4. IA-05: one reissue per (store, source, client_request_id); NULL keys unconstrained; key length 8..128.
DO $$
DECLARE
  v_src uuid := 'c0000000-0000-0000-0000-000000000004';
  v_store uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at, source_campaign_id, client_request_id)
  VALUES (v_store, 'reissue 1', 'fixed_amount', 50, now(), now() + interval '30 days', v_src, 'form-key-0001');
  BEGIN
    INSERT INTO public.store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at, source_campaign_id, client_request_id)
    VALUES (v_store, 'reissue 1 dup', 'fixed_amount', 50, now(), now() + interval '30 days', v_src, 'form-key-0001');
    RAISE EXCEPTION 'ASSERT FAILED: duplicate reissue key accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO public.store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at, source_campaign_id, client_request_id)
  VALUES (v_store, 'reissue 2', 'fixed_amount', 50, now(), now() + interval '30 days', v_src, 'form-key-0002');
  INSERT INTO public.store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at)
  VALUES (v_store, 'plain a', 'fixed_amount', 50, now(), now() + interval '30 days'),
         (v_store, 'plain b', 'fixed_amount', 50, now(), now() + interval '30 days');
  BEGIN
    INSERT INTO public.store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at, source_campaign_id, client_request_id)
    VALUES (v_store, 'short key', 'fixed_amount', 50, now(), now() + interval '30 days', v_src, 'x');
    RAISE EXCEPTION 'ASSERT FAILED: short client_request_id accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.store_coupon_campaigns WHERE source_campaign_id = v_src) <> 2 THEN
    RAISE EXCEPTION 'ASSERT FAILED: expected 2 reissues';
  END IF;
  RAISE NOTICE 'PASS 4 reissue idempotency index';
END $$;

-- 5. IA-04 CAS semantics as issued by the owner route (UPDATE ... WHERE id AND lifecycle_state IN (from) [AND guards]).
DO $$
DECLARE
  v_n int;
  v_id uuid;
BEGIN
  INSERT INTO public.store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'cas', 'fixed_amount', 50, now() - interval '1 day', now() + interval '10 days')
  RETURNING id INTO v_id;
  -- admin pause (route writes paused_by = admin)
  UPDATE public.store_coupon_campaigns SET lifecycle_state = 'paused', is_active = false, paused_by = 'admin'
   WHERE id = v_id AND lifecycle_state IN ('active', 'scheduled');
  -- owner resume CAS: paused AND paused_by is not admin -> 0 rows
  UPDATE public.store_coupon_campaigns SET lifecycle_state = 'active', is_active = true, paused_by = NULL
   WHERE id = v_id AND lifecycle_state IN ('paused') AND (paused_by IS NULL OR paused_by = 'owner');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: owner resumed an admin-paused coupon'; END IF;
  -- owner end from paused -> 1 row
  UPDATE public.store_coupon_campaigns SET lifecycle_state = 'ended', is_active = false
   WHERE id = v_id AND lifecycle_state IN ('active', 'scheduled', 'paused', 'draft');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: owner end from paused'; END IF;
  -- owner pause / resume on ended -> 0 rows (no revival)
  UPDATE public.store_coupon_campaigns SET lifecycle_state = 'paused', is_active = false, paused_by = 'owner'
   WHERE id = v_id AND lifecycle_state IN ('active', 'scheduled') AND is_active = true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: owner paused an ended coupon'; END IF;
  -- legacy paused row (paused_by NULL) -> owner resume still allowed (design field 7)
  UPDATE public.store_coupon_campaigns SET lifecycle_state = 'active', is_active = true, paused_by = NULL
   WHERE id = 'c0000000-0000-0000-0000-000000000003' AND lifecycle_state IN ('paused') AND (paused_by IS NULL OR paused_by = 'owner')
   RETURNING 1 INTO v_n;
  IF v_n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'ASSERT FAILED: legacy paused row should be resumable'; END IF;
  -- restore the legacy row so the snapshot check in 6 stays meaningful
  UPDATE public.store_coupon_campaigns SET lifecycle_state = 'paused', is_active = false, updated_at = '2026-09-01'
   WHERE id = 'c0000000-0000-0000-0000-000000000003';
  RAISE NOTICE 'PASS 5 owner CAS: admin-paused not resumable, ended not revivable, legacy paused resumable';
END $$;

-- 6. ADS-23 auto end: only end_at in [apply_from, now()]; legacy expired rows untouched; idempotent; audited.
DO $$
DECLARE
  v_store uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_a uuid; v_b uuid; v_c uuid; v_d uuid;
  v_res jsonb;
BEGIN
  INSERT INTO public.store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at, lifecycle_state, is_active)
  VALUES (v_store, 'expired active', 'fixed_amount', 50, '2026-10-21 00:00:00+00', now() - interval '1 second', 'active', true)
  RETURNING id INTO v_a;
  INSERT INTO public.store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at, lifecycle_state, is_active, paused_by)
  VALUES (v_store, 'expired paused', 'fixed_amount', 50, '2026-10-21 00:00:00+00', now() - interval '1 second', 'paused', false, 'admin')
  RETURNING id INTO v_b;
  INSERT INTO public.store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at, lifecycle_state, is_active)
  VALUES (v_store, 'future', 'fixed_amount', 50, now(), now() + interval '5 days', 'active', true)
  RETURNING id INTO v_c;
  INSERT INTO public.store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at, lifecycle_state, is_active)
  VALUES (v_store, 'expired revoked', 'fixed_amount', 50, '2026-10-21 00:00:00+00', now() - interval '1 second', 'revoked', false)
  RETURNING id INTO v_d;

  SET LOCAL ROLE service_role;
  v_res := public.store_coupon_campaigns_auto_end_expired(500);
  RESET ROLE;
  IF (v_res->>'ended')::int <> 2 THEN RAISE EXCEPTION 'ASSERT FAILED: auto end count %', v_res; END IF;
  IF (SELECT lifecycle_state || '/' || is_active FROM public.store_coupon_campaigns WHERE id = v_a) <> 'ended/false'
     OR (SELECT lifecycle_state FROM public.store_coupon_campaigns WHERE id = v_b) <> 'ended'
     OR (SELECT lifecycle_state FROM public.store_coupon_campaigns WHERE id = v_c) <> 'active'
     OR (SELECT lifecycle_state FROM public.store_coupon_campaigns WHERE id = v_d) <> 'revoked' THEN
    RAISE EXCEPTION 'ASSERT FAILED: auto end states';
  END IF;
  IF (SELECT count(*) FROM public.coupon_audit_events WHERE action = 'system_auto_end' AND campaign_id IN (v_a, v_b)) <> 2 THEN
    RAISE EXCEPTION 'ASSERT FAILED: auto end audit rows';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.t_legacy_snapshot s
      JOIN public.store_coupon_campaigns c ON c.id = s.id
     WHERE s.h IS DISTINCT FROM md5(concat_ws('|', c.lifecycle_state, c.is_active, c.end_at, c.updated_at, c.max_uses_per_user, c.title))
  ) THEN RAISE EXCEPTION 'ASSERT FAILED: legacy row changed by auto end'; END IF;
  SET LOCAL ROLE service_role;
  v_res := public.store_coupon_campaigns_auto_end_expired(500);
  RESET ROLE;
  IF (v_res->>'ended')::int <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: auto end not idempotent %', v_res; END IF;
  RAISE NOTICE 'PASS 6 auto end (2 new rows ended, legacy expired untouched, idempotent, audited)';
END $$;

-- 7. Grants: only service_role may run the auto end.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.store_coupon_campaigns_auto_end_expired(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.store_coupon_campaigns_auto_end_expired(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: auto end executable by client roles';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.store_coupon_campaigns_auto_end_expired(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: service_role cannot run auto end';
  END IF;
  RAISE NOTICE 'PASS 7 grants';
END $$;
