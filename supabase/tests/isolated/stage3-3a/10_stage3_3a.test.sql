-- Stage 3-A assertions (LOC-005 trigger 4 cases + preservation, LOC-006 RPC contract + failure rollback).
SET ROLE service_role;

-- ---------- LOC-005 ----------
-- Case 1: INSERT delivery ON + NULL coords -> rejected.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.stores (owner_user_id, lat, lng, delivery_available)
    VALUES ('11111111-1111-1111-1111-111111111111', NULL, NULL, true);
    RAISE EXCEPTION 'ASSERT FAILED: insert violation passed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'store_delivery_requires_canonical_geo' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS LOC-005 case1 insert violation rejected';
END $$;

-- Case 2: turning delivery ON for a store without coords -> rejected.
DO $$
BEGIN
  UPDATE public.stores SET lat = NULL, lng = NULL WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
  BEGIN
    UPDATE public.stores SET delivery_available = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'ASSERT FAILED: delivery-on violation passed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'store_delivery_requires_canonical_geo' THEN RAISE; END IF;
  END;
  UPDATE public.stores SET lat = 14.55, lng = 121.02 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
  UPDATE public.stores SET delivery_available = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
  RAISE NOTICE 'PASS LOC-005 case2 delivery-on without coords rejected; with coords allowed';
END $$;

-- Case 3: clearing coords of a delivery-ON store -> rejected (either coordinate).
DO $$
BEGIN
  BEGIN
    UPDATE public.stores SET lat = NULL WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'ASSERT FAILED: coord removal passed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'store_delivery_requires_canonical_geo' THEN RAISE; END IF;
  END;
  -- S1 (legacy NULL geo, delivery ON): setting only lat still leaves lng NULL and changes lat -> rejected
  BEGIN
    UPDATE public.stores SET lat = 14.5 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'ASSERT FAILED: partial coords passed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'store_delivery_requires_canonical_geo' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS LOC-005 case3 coord removal / partial coords rejected';
END $$;

-- Case 4 (preservation, D-5): unrelated column UPDATE on the legacy NULL-geo delivery-ON store passes,
-- re-sending the same NULL coords passes, turning delivery OFF passes, setting both coords passes.
DO $$
DECLARE v_phone text;
BEGIN
  UPDATE public.stores SET phone = '+639170000000' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  UPDATE public.stores SET phone = '+639170000001', lat = NULL, lng = NULL, delivery_available = true
    WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  SELECT phone INTO v_phone FROM public.stores WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  IF v_phone <> '+639170000001' THEN RAISE EXCEPTION 'ASSERT FAILED: unrelated update lost'; END IF;

  RAISE NOTICE 'PASS LOC-005 case4 unrelated / same-value updates pass on legacy row';
END $$;
DO $$
BEGIN
  UPDATE public.stores SET delivery_available = false WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  UPDATE public.stores SET delivery_available = true, lat = 14.5, lng = 121.0 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  -- delivery OFF stores may have NULL coords
  UPDATE public.stores SET delivery_available = false WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  UPDATE public.stores SET lat = NULL, lng = NULL WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO public.stores (owner_user_id, lat, lng, delivery_available)
    VALUES ('11111111-1111-1111-1111-111111111111', NULL, NULL, false);
  RAISE NOTICE 'PASS LOC-005 delivery OFF / both coords transitions pass';
END $$;

-- ---------- LOC-006 ----------
-- Version conflict: stale expected version -> conflict, rows untouched.
DO $$
DECLARE r jsonb; n int;
BEGIN
  r := public.replace_store_delivery_service_areas('aaaaaaaa-0000-0000-0000-000000000003',
        ARRAY['lgu-c'], ARRAY['C City'], 'lgu-c', false, 'owner', '2026-09-01 00:00:00+00', true);
  IF r->>'error' IS DISTINCT FROM 'service_areas_version_conflict' THEN
    RAISE EXCEPTION 'ASSERT FAILED: expected conflict, got %', r;
  END IF;
  SELECT count(*) INTO n FROM public.store_delivery_service_areas WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000003';
  IF n <> 2 THEN RAISE EXCEPTION 'ASSERT FAILED: rows changed on conflict (%)', n; END IF;
  RAISE NOTICE 'PASS LOC-006 version conflict leaves rows';
END $$;

-- Matching version: replace + activate atomically; dedupe; home flag; new version returned.
DO $$
DECLARE r jsonb; n int; v_home int; v_auth text; v_ver timestamptz;
BEGIN
  r := public.replace_store_delivery_service_areas('aaaaaaaa-0000-0000-0000-000000000003',
        ARRAY['lgu-c', 'lgu-d', 'lgu-c', ' '], ARRAY['C City', NULL, 'dup', 'blank'], 'lgu-c', true, 'owner',
        '2026-10-01 00:00:00+00', true);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED: replace failed %', r; END IF;
  SELECT count(*), count(*) FILTER (WHERE is_store_home), max(updated_at) INTO n, v_home, v_ver
    FROM public.store_delivery_service_areas WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000003';
  SELECT delivery_service_area_authority INTO v_auth FROM public.stores WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';
  IF n <> 2 OR v_home <> 1 OR v_auth <> 'v2_lgu' THEN
    RAISE EXCEPTION 'ASSERT FAILED: state n=% home=% auth=%', n, v_home, v_auth;
  END IF;
  IF (r->>'version')::timestamptz IS DISTINCT FROM v_ver THEN RAISE EXCEPTION 'ASSERT FAILED: version mismatch %', r; END IF;
  IF (SELECT display_name_snapshot FROM public.store_delivery_service_areas
        WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000003' AND geo_identity = 'lgu-d') <> 'lgu-d' THEN
    RAISE EXCEPTION 'ASSERT FAILED: display fallback';
  END IF;
  IF (SELECT display_name_snapshot FROM public.store_delivery_service_areas
        WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000003' AND geo_identity = 'lgu-c') <> 'C City' THEN
    RAISE EXCEPTION 'ASSERT FAILED: first occurrence wins';
  END IF;
  -- old version is now stale
  r := public.replace_store_delivery_service_areas('aaaaaaaa-0000-0000-0000-000000000003',
        ARRAY['lgu-e'], ARRAY['E'], NULL, false, 'owner', '2026-10-01 00:00:00+00', true);
  IF r->>'error' IS DISTINCT FROM 'service_areas_version_conflict' THEN RAISE EXCEPTION 'ASSERT FAILED: stale accepted %', r; END IF;
  -- returned version is accepted as the next expected value
  r := public.replace_store_delivery_service_areas('aaaaaaaa-0000-0000-0000-000000000003',
        ARRAY[]::text[], ARRAY[]::text[], NULL, false, 'admin', v_ver, true);
  IF (r->>'ok')::boolean IS NOT TRUE OR r->'version' <> 'null'::jsonb THEN RAISE EXCEPTION 'ASSERT FAILED: clear %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.store_delivery_service_areas WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'ASSERT FAILED: clear left rows';
  END IF;
  -- empty set version = NULL
  r := public.replace_store_delivery_service_areas('aaaaaaaa-0000-0000-0000-000000000003',
        ARRAY['lgu-a'], ARRAY['A'], 'lgu-a', false, 'admin', NULL, true);
  IF (r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED: null-version save %', r; END IF;
  RAISE NOTICE 'PASS LOC-006 replace/activate/dedupe/version chain';
END $$;

-- Argument errors and unknown store.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.replace_store_delivery_service_areas('aaaaaaaa-0000-0000-0000-000000000003',
        ARRAY['x'], ARRAY['x'], NULL, false, 'migration_proposal', NULL, false);
  IF r->>'error' IS DISTINCT FROM 'invalid_source' THEN RAISE EXCEPTION 'ASSERT FAILED: source %', r; END IF;
  r := public.replace_store_delivery_service_areas('aaaaaaaa-0000-0000-0000-000000000003',
        ARRAY['x', 'y'], ARRAY['x'], NULL, false, 'owner', NULL, false);
  IF r->>'error' IS DISTINCT FROM 'display_names_length_mismatch' THEN RAISE EXCEPTION 'ASSERT FAILED: len %', r; END IF;
  r := public.replace_store_delivery_service_areas('aaaaaaaa-0000-0000-0000-00000000ffff',
        ARRAY['x'], ARRAY['x'], NULL, false, 'owner', NULL, false);
  IF r->>'error' IS DISTINCT FROM 'store_not_found' THEN RAISE EXCEPTION 'ASSERT FAILED: nf %', r; END IF;
  RAISE NOTICE 'PASS LOC-006 argument errors';
END $$;

RESET ROLE;

-- Failure injection: an INSERT failure inside the RPC rolls back the DELETE (old rows survive).
CREATE OR REPLACE FUNCTION public.t_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.geo_identity = 'boom' THEN RAISE EXCEPTION 'injected_insert_failure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER t_fail_insert BEFORE INSERT ON public.store_delivery_service_areas
  FOR EACH ROW EXECUTE FUNCTION public.t_fail_insert();
SET ROLE service_role;
DO $$
DECLARE n int; v_auth_before text; v_auth_after text;
BEGIN
  SELECT delivery_service_area_authority INTO v_auth_before FROM public.stores WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
  INSERT INTO public.store_delivery_service_areas (store_id, geo_identity) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000002', 'keep-1'), ('aaaaaaaa-0000-0000-0000-000000000002', 'keep-2');
  BEGIN
    PERFORM public.replace_store_delivery_service_areas('aaaaaaaa-0000-0000-0000-000000000002',
      ARRAY['ok-1', 'boom'], ARRAY['a', 'b'], NULL, true, 'owner', NULL, false);
    RAISE EXCEPTION 'ASSERT FAILED: injected failure did not raise';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'injected_insert_failure' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO n FROM public.store_delivery_service_areas
    WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000002' AND geo_identity IN ('keep-1', 'keep-2');
  SELECT delivery_service_area_authority INTO v_auth_after FROM public.stores WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
  IF n <> 2 OR v_auth_after <> v_auth_before THEN
    RAISE EXCEPTION 'ASSERT FAILED: partial write survived n=% auth=%', n, v_auth_after;
  END IF;
  RAISE NOTICE 'PASS LOC-006 failure injection: old rows + authority kept';
END $$;
RESET ROLE;
DROP TRIGGER t_fail_insert ON public.store_delivery_service_areas;

-- Privileges: anon / authenticated cannot execute the RPC.
DO $$
BEGIN
  IF has_function_privilege('authenticated',
       'public.replace_store_delivery_service_areas(uuid, text[], text[], text, boolean, text, timestamptz, boolean)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.replace_store_delivery_service_areas(uuid, text[], text[], text, boolean, text, timestamptz, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: client roles can execute RPC';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.replace_store_delivery_service_areas(uuid, text[], text[], text, boolean, text, timestamptz, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT FAILED: service_role cannot execute RPC';
  END IF;
  RAISE NOTICE 'PASS LOC-006 EXECUTE = service_role only';
END $$;
