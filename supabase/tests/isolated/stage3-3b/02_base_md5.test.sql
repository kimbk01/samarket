-- Base check: definitions loaded above are byte-identical to production (md5(prosrc), read-only 2026-10-21).
DO $$
DECLARE
  r record;
  v_bad text := '';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('stores_protect_first_listed_at', '11677f396ce2e2225a9e8656b1a2a954'),
      ('block_client_role_direct_writes', 'a9781f53647a2de2d1ebf28bfeccf216')
    ) AS t(fn, prod_md5)
  LOOP
    IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = r.fn AND pronamespace = 'public'::regnamespace) IS DISTINCT FROM r.prod_md5 THEN
      v_bad := v_bad || ' ' || r.fn;
    END IF;
  END LOOP;
  IF v_bad <> '' THEN RAISE EXCEPTION 'ASSERT FAILED: base differs from prod:%', v_bad; END IF;
  RAISE NOTICE 'PASS base = prod md5 (2 functions)';
END $$;

-- Baseline defect reproduction (OPS-07): a pending store toggled visible gets first_listed_at stamped.
DO $$
DECLARE v_id uuid; v_ts timestamptz;
BEGIN
  INSERT INTO public.stores (approval_status) VALUES ('pending') RETURNING id INTO v_id;
  UPDATE public.stores SET is_visible = true WHERE id = v_id;
  SELECT first_listed_at INTO v_ts FROM public.stores WHERE id = v_id;
  IF v_ts IS NULL THEN RAISE EXCEPTION 'ASSERT FAILED: base defect not reproduced'; END IF;
  DELETE FROM public.stores WHERE id = v_id;
  RAISE NOTICE 'PASS base defect reproduced (pending store stamped before fix)';
END $$;
