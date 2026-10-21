-- Base check: the reused definitions loaded from the repo are byte-identical to production
-- (md5(prosrc) read from production pg_proc, read-only, 2026-10-21). The 3-D2 migrations call them unchanged.
DO $$
DECLARE
  r record;
  v_bad text := '';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('ensure_business_cash_account', '884c4957c4e4ae3a41571fdd612507e2'),
      ('business_cash_delivery_ad_spend', 'a06219b984fe0bc444abd09f03042614'),
      ('business_cash_delivery_ad_refund', '9d80e9acf5d29d3abb312c3d4860d84d')
    ) AS t(fn, prod_md5)
  LOOP
    IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = r.fn AND pronamespace = 'public'::regnamespace) IS DISTINCT FROM r.prod_md5 THEN
      v_bad := v_bad || ' ' || r.fn;
    END IF;
  END LOOP;
  IF v_bad <> '' THEN RAISE EXCEPTION 'ASSERT FAILED: base differs from prod:%', v_bad; END IF;
  RAISE NOTICE 'PASS base = prod md5 (3 functions)';
END $$;
