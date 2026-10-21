-- N-4B store_settlements: 20270603150100 적용 후 service_role 은 SELECT 만, 쓰기는 거부. 기존 행 무변.
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: %', label;
  END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;

SELECT pg_temp.ok(has_table_privilege('service_role', 'public.store_settlements', 'SELECT'), 'service_role keeps SELECT');
SELECT pg_temp.ok(NOT has_table_privilege('service_role', 'public.store_settlements', 'INSERT'), 'service_role INSERT revoked');
SELECT pg_temp.ok(NOT has_table_privilege('service_role', 'public.store_settlements', 'UPDATE'), 'service_role UPDATE revoked');
SELECT pg_temp.ok(NOT has_table_privilege('service_role', 'public.store_settlements', 'DELETE'), 'service_role DELETE revoked');
SELECT pg_temp.ok(has_table_privilege('authenticated', 'public.store_settlements', 'SELECT'), 'other grants untouched');
SELECT pg_temp.ok((SELECT count(*) FROM public.store_settlements) = 1, 'legacy rows untouched');

SET ROLE service_role;
DO $$
BEGIN
  PERFORM count(*) FROM public.store_settlements;
  RAISE NOTICE 'PASS: service_role SELECT works';
  BEGIN
    UPDATE public.store_settlements SET settlement_status = 'cancelled';
    RAISE EXCEPTION 'FAIL: service_role UPDATE accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: service_role UPDATE -> permission denied';
  END;
  BEGIN
    INSERT INTO public.store_settlements (store_id, order_id) VALUES (gen_random_uuid(), gen_random_uuid());
    RAISE EXCEPTION 'FAIL: service_role INSERT accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: service_role INSERT -> permission denied';
  END;
END
$$;
RESET ROLE;
