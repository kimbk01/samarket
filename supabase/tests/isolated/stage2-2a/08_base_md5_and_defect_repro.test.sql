-- Before the migrations: (1) the base bodies are byte-identical to production (md5(prosrc)) - except
--     store_commission_integrity_report, whose base is the 2-B body (07_stage2b_integrity_base.sql, prod base b7871c44...);
-- (2) FIN-02 defect reproduces on the production body (second equal partial settlement -> unique_violation,
--     the whole approval rolls back). Everything here runs in a rolled-back transaction except the md5 check.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('settle_store_sale_fee_obligations', 'e600e0e0256a091371f1da793e067645'),
    ('approve_business_cash_charge_request', '49aa771941ccc7e3ba56858ee52e6cf3'),
    ('reject_business_cash_charge_request', 'ab55edb806414d5c3658dfbeddf5b1bf'),
    ('admin_decide_store_commission_adjustment', '731ad5fe62d7ae8589186ae76c71254a'),
    ('store_cash_position', '698a65c9922963a44cd91c74c0d1c348'),
    ('store_commission_integrity_report', 'e4d32a11b5e3a20729beb319e2f19f2d'),
    ('store_commission_enqueue_exception_notifications', 'f0ddf348b806878d65887c4649c0a7c8')
  ) AS t(fn, md5) LOOP
    PERFORM public.t_assert(
      (SELECT md5(prosrc) FROM pg_proc WHERE proname = r.fn AND pronamespace = 'public'::regnamespace) = r.md5,
      'prod base md5 ' || r.fn);
  END LOOP;
  RAISE NOTICE 'PASS base: 6 production bodies + the 2-B integrity body byte-identical (md5)';
END $$;

BEGIN;
SET LOCAL test.jwt_role = 'service_role';
DO $$
DECLARE
  v_store uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_r1 uuid; v_r2 uuid; v_res jsonb; v_failed boolean := false;
BEGIN
  PERFORM public.t_obligation(v_store, 10000);
  v_r1 := public.t_legacy_request(v_store, 2000);
  v_res := public.approve_business_cash_charge_request('44444444-4444-4444-4444-444444444444', v_r1);
  PERFORM public.t_assert(v_res->>'ok' = 'true', 'base: first partial approval ok');
  v_r2 := public.t_legacy_request(v_store, 2000);
  BEGIN
    v_res := public.approve_business_cash_charge_request('44444444-4444-4444-4444-444444444444', v_r2);
  EXCEPTION WHEN unique_violation THEN
    v_failed := true;
  END;
  PERFORM public.t_assert(v_failed, 'base: second equal partial settlement hits business_cash_ledger_idem_uidx');
  RAISE NOTICE 'PASS repro FIN-02 on prod body: second 2,000 approval -> unique_violation (approval rolled back)';
END $$;
ROLLBACK;
