-- Stage 3-E assertions (PRD-11 reorder RPC, PRD-15 client_request_id). Runs as superuser unless SET ROLE.

-- 1) reorder: sort_order = array position (0-based)
SELECT public.reorder_store_menu_sections(
  'aaaaaaaa-0000-0000-0000-000000000001',
  ARRAY['5ec00000-0000-0000-0000-000000000003','5ec00000-0000-0000-0000-000000000001','5ec00000-0000-0000-0000-000000000002']::uuid[]
);
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(name || '=' || sort_order, ',' ORDER BY sort_order) INTO v
    FROM store_menu_sections WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  IF v <> 'C=0,A=1,B=2' THEN RAISE EXCEPTION 'FAIL reorder: %', v; END IF;
  RAISE NOTICE 'reorder ok: %', v;
END $$;

-- 2) idempotent re-run updates 0 rows
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reorder_store_menu_sections(
    'aaaaaaaa-0000-0000-0000-000000000001',
    ARRAY['5ec00000-0000-0000-0000-000000000003','5ec00000-0000-0000-0000-000000000001','5ec00000-0000-0000-0000-000000000002']::uuid[]);
  IF (r->>'updated')::int <> 0 THEN RAISE EXCEPTION 'FAIL rerun updated=%', r; END IF;
  RAISE NOTICE 'rerun ok: %', r;
END $$;

-- 3) foreign section id -> exception, nothing changes (all-or-nothing)
DO $$
DECLARE v text;
BEGIN
  BEGIN
    PERFORM public.reorder_store_menu_sections(
      'aaaaaaaa-0000-0000-0000-000000000001',
      ARRAY['5ec00000-0000-0000-0000-000000000001','5ec00000-0000-0000-0000-000000000009']::uuid[]);
    RAISE EXCEPTION 'FAIL foreign id accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'section_not_in_store' THEN RAISE; END IF;
  END;
  SELECT string_agg(name || '=' || sort_order, ',' ORDER BY sort_order) INTO v
    FROM store_menu_sections WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  IF v <> 'C=0,A=1,B=2' THEN RAISE EXCEPTION 'FAIL foreign id changed rows: %', v; END IF;
  IF (SELECT sort_order FROM store_menu_sections WHERE id = '5ec00000-0000-0000-0000-000000000009') <> 0 THEN
    RAISE EXCEPTION 'FAIL other store row changed';
  END IF;
  RAISE NOTICE 'foreign id rejected ok';
END $$;

-- 4) duplicates / empty / null rejected
DO $$
BEGIN
  BEGIN
    PERFORM public.reorder_store_menu_sections('aaaaaaaa-0000-0000-0000-000000000001',
      ARRAY['5ec00000-0000-0000-0000-000000000001','5ec00000-0000-0000-0000-000000000001']::uuid[]);
    RAISE EXCEPTION 'FAIL duplicate accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM <> 'duplicate_section_ids' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.reorder_store_menu_sections('aaaaaaaa-0000-0000-0000-000000000001', ARRAY[]::uuid[]);
    RAISE EXCEPTION 'FAIL empty accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.reorder_store_menu_sections('aaaaaaaa-0000-0000-0000-000000000001', ARRAY[NULL]::uuid[]);
    RAISE EXCEPTION 'FAIL null id accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  RAISE NOTICE 'invalid input rejected ok';
END $$;

-- 5) partial list: only listed rows change, others untouched
SELECT public.reorder_store_menu_sections('aaaaaaaa-0000-0000-0000-000000000001',
  ARRAY['5ec00000-0000-0000-0000-000000000002']::uuid[]);
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(name || '=' || sort_order, ',' ORDER BY name) INTO v
    FROM store_menu_sections WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  IF v <> 'A=1,B=0,C=0' THEN RAISE EXCEPTION 'FAIL partial: %', v; END IF;
  RAISE NOTICE 'partial ok: %', v;
END $$;

-- 6) privileges: anon / authenticated cannot execute; service_role can; SECURITY DEFINER
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.reorder_store_menu_sections(uuid, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon can execute';
  END IF;
  IF has_function_privilege('authenticated', 'public.reorder_store_menu_sections(uuid, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL authenticated can execute';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.reorder_store_menu_sections(uuid, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL service_role cannot execute';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE proname = 'reorder_store_menu_sections') THEN
    RAISE EXCEPTION 'FAIL not security definer';
  END IF;
  RAISE NOTICE 'privileges ok';
END $$;
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.reorder_store_menu_sections('aaaaaaaa-0000-0000-0000-000000000001',
      ARRAY['5ec00000-0000-0000-0000-000000000001']::uuid[]);
    RAISE EXCEPTION 'FAIL authenticated executed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET ROLE service_role;
SELECT public.reorder_store_menu_sections('aaaaaaaa-0000-0000-0000-000000000001',
  ARRAY['5ec00000-0000-0000-0000-000000000001','5ec00000-0000-0000-0000-000000000002','5ec00000-0000-0000-0000-000000000003']::uuid[]);
RESET ROLE;

-- 7) client_request_id: legacy rows NULL (no backfill), unique per store, NULL repeatable, other store free
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM store_products WHERE client_request_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL legacy rows got a client_request_id';
  END IF;
  INSERT INTO store_products (store_id, title, client_request_id)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'k1', 'form-key-0001');
  BEGIN
    INSERT INTO store_products (store_id, title, client_request_id)
      VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'k1-again', 'form-key-0001');
    RAISE EXCEPTION 'FAIL duplicate client_request_id accepted';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%store_products_store_client_request_id_key%' THEN RAISE; END IF;
  END;
  INSERT INTO store_products (store_id, title, client_request_id)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000002', 'k1-other-store', 'form-key-0001');
  INSERT INTO store_products (store_id, title)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'nokey-1'), ('aaaaaaaa-0000-0000-0000-000000000001', 'nokey-2');
  RAISE NOTICE 'client_request_id ok';
END $$;
