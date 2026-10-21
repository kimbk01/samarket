-- Stage 3-B assertions (after migrations 20270604120000 + 20270604120100).

-- OPS-07: non-approved stores never get first_listed_at; approved stores keep the prior behavior.
DO $$
DECLARE v_id uuid; v_ts timestamptz; v_ts2 timestamptz; st text;
BEGIN
  FOREACH st IN ARRAY ARRAY['pending','under_review','revision_requested','rejected','suspended'] LOOP
    INSERT INTO public.stores (approval_status) VALUES (st) RETURNING id INTO v_id;
    UPDATE public.stores SET is_visible = true WHERE id = v_id;
    SELECT first_listed_at INTO v_ts FROM public.stores WHERE id = v_id;
    IF v_ts IS NOT NULL THEN RAISE EXCEPTION 'ASSERT FAILED: % store stamped', st; END IF;
  END LOOP;
  RAISE NOTICE 'PASS OPS-07 non-approved visible toggle does not stamp';

  INSERT INTO public.stores (approval_status) VALUES ('approved') RETURNING id INTO v_id;
  UPDATE public.stores SET is_visible = true WHERE id = v_id;
  SELECT first_listed_at INTO v_ts FROM public.stores WHERE id = v_id;
  IF v_ts IS NULL THEN RAISE EXCEPTION 'ASSERT FAILED: approved store not stamped'; END IF;
  UPDATE public.stores SET is_visible = false WHERE id = v_id;
  UPDATE public.stores SET is_visible = true WHERE id = v_id;
  UPDATE public.stores SET first_listed_at = now() + interval '1 day' WHERE id = v_id;
  SELECT first_listed_at INTO v_ts2 FROM public.stores WHERE id = v_id;
  IF v_ts2 IS DISTINCT FROM v_ts THEN RAISE EXCEPTION 'ASSERT FAILED: stamp not preserved'; END IF;
  RAISE NOTICE 'PASS OPS-07 approved store stamped once and preserved';

  -- legacy row: pending + already visible (pre-fix toggle) -> approve_store (approved, is_visible=false) -> owner toggle on
  INSERT INTO public.stores (approval_status, is_visible) VALUES ('pending', true) RETURNING id INTO v_id;
  UPDATE public.stores SET approval_status = 'approved', is_visible = false WHERE id = v_id;
  SELECT first_listed_at INTO v_ts FROM public.stores WHERE id = v_id;
  IF v_ts IS NOT NULL THEN RAISE EXCEPTION 'ASSERT FAILED: approve with hidden stamped'; END IF;
  UPDATE public.stores SET is_visible = true WHERE id = v_id;
  SELECT first_listed_at INTO v_ts FROM public.stores WHERE id = v_id;
  IF v_ts IS NULL THEN RAISE EXCEPTION 'ASSERT FAILED: first approved listing not stamped'; END IF;

  -- resume_store: suspended -> approved + visible in one UPDATE
  INSERT INTO public.stores (approval_status) VALUES ('suspended') RETURNING id INTO v_id;
  UPDATE public.stores SET approval_status = 'approved', is_visible = true WHERE id = v_id;
  SELECT first_listed_at INTO v_ts FROM public.stores WHERE id = v_id;
  IF v_ts IS NULL THEN RAISE EXCEPTION 'ASSERT FAILED: resume+visible not stamped'; END IF;
  RAISE NOTICE 'PASS OPS-07 approve/resume paths';
END $$;

-- OPS-01: table, RLS, grants, triggers.
DO $$
BEGIN
  IF to_regclass('public.store_notices') IS NULL THEN RAISE EXCEPTION 'ASSERT FAILED: store_notices missing'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.store_notices'::regclass) THEN
    RAISE EXCEPTION 'ASSERT FAILED: RLS not enabled';
  END IF;
  IF has_table_privilege('anon', 'public.store_notices', 'INSERT')
     OR has_table_privilege('authenticated', 'public.store_notices', 'INSERT')
     OR has_table_privilege('authenticated', 'public.store_notices', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.store_notices', 'DELETE')
     OR has_table_privilege('anon', 'public.store_notices', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.store_notices', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERT FAILED: client role has write privilege';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.store_notices', 'INSERT') THEN
    RAISE EXCEPTION 'ASSERT FAILED: service_role cannot insert';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.store_notices'::regclass AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'ASSERT FAILED: trigger count';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE tablename = 'store_notices') <> 1 THEN
    RAISE EXCEPTION 'ASSERT FAILED: policy count';
  END IF;
  RAISE NOTICE 'PASS OPS-01 table/RLS/grants/triggers (idempotent re-run)';
END $$;

-- Fixture rows (service_role path = owner API).
SET ROLE service_role;
INSERT INTO public.stores (id, approval_status, is_visible) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'approved', true),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'approved', false),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', 'pending', false);
INSERT INTO public.store_notices (id, store_id, title, placement, is_active, start_at, end_at) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'live', 'store_top', true, NULL, NULL),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'inactive', 'store_top', false, NULL, NULL),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'future', 'menu_top', true, now() + interval '1 day', NULL),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'ended', 'info_tab', true, NULL, now() - interval '1 minute'),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'hidden store', 'store_top', true, NULL, NULL),
  ('bbbbbbbb-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'pending store', 'store_top', true, NULL, NULL);
UPDATE public.store_notices SET title = 'live!', updated_at = now() - interval '1 hour' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF (SELECT updated_at FROM public.store_notices WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001') < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'ASSERT FAILED: updated_at trigger';
  END IF;
  IF (SELECT count(*) FROM public.store_notices) <> 6 THEN RAISE EXCEPTION 'ASSERT FAILED: service_role sees all'; END IF;
  RAISE NOTICE 'PASS OPS-01 service_role write/read + updated_at';
END $$;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.store_notices (store_id, title, placement) VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1', 'x', 'bad');
    RAISE EXCEPTION 'ASSERT FAILED: placement check';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS OPS-01 placement check';
END $$;
RESET ROLE;

-- Client roles: no direct writes; reads only published notices of approved visible stores.
DO $$
DECLARE r text; n int;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I', r);
    BEGIN
      INSERT INTO public.store_notices (store_id, title, placement) VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1', 'x', 'store_top');
      RAISE EXCEPTION 'ASSERT FAILED: % insert allowed', r;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      UPDATE public.store_notices SET title = 'pwn';
      RAISE EXCEPTION 'ASSERT FAILED: % update allowed', r;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      DELETE FROM public.store_notices;
      RAISE EXCEPTION 'ASSERT FAILED: % delete allowed', r;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    IF r = 'anon' THEN
      BEGIN
        SELECT count(*) INTO n FROM public.store_notices;
        RAISE EXCEPTION 'ASSERT FAILED: anon select allowed';
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      RESET ROLE;
      CONTINUE;
    END IF;
    SELECT count(*) INTO n FROM public.store_notices;
    IF n <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: % sees % notices (expected 1)', r, n; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.store_notices WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001') THEN
      RAISE EXCEPTION 'ASSERT FAILED: % does not see live notice', r;
    END IF;
    RESET ROLE;
  END LOOP;
  RAISE NOTICE 'PASS OPS-01 client roles: writes 42501, anon no read, authenticated read = published only';
END $$;

-- Trigger defense in depth: even with a stray grant, client role writes are refused by the trigger (42501).
GRANT INSERT ON public.store_notices TO authenticated;
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.store_notices (store_id, title, placement) VALUES ('aaaaaaaa-0000-0000-0000-0000000000a1', 'x', 'store_top');
    RAISE EXCEPTION 'ASSERT FAILED: trigger did not block';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS OPS-01 block_client_role_direct_writes trigger';
END $$;
REVOKE INSERT ON public.store_notices FROM authenticated;
