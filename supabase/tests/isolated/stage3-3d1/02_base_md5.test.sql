-- Base check (before the 3-D1 migration): the definitions loaded from the repo are byte-identical to production
-- (md5(prosrc) read from production pg_proc, read-only, 2026-10-21). The 3-D1 migration is a minimal diff on these.
DO $$
DECLARE
  r record;
  v_bad text := '';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('ensure_business_cash_account', '884c4957c4e4ae3a41571fdd612507e2'),
      ('delivery_ad_campaign_funding_allows_active', 'a75f6323925b8bcd0b88d629be7cb021'),
      ('business_cash_delivery_ad_spend', 'a06219b984fe0bc444abd09f03042614'),
      ('business_cash_delivery_ad_refund', '9d80e9acf5d29d3abb312c3d4860d84d'),
      ('admin_delivery_ad_transition', 'c93d346fce96859931231969081f0046'),
      ('delivery_ad_system_schedule_transition', 'ca29308b9cf8fe9692c2a0c715510211'),
      ('owner_delivery_ad_transition', '27c0218065edc80c708242b3bd34b05a'),
      ('owner_submit_delivery_ad_with_business_cash', '66ea22a4ef48d9b8e3f1661bb68b1fcc'),
      ('admin_delivery_ad_reject_with_refund', '3af7c01ff5f0fc4585baac7e9a539427'),
      ('admin_delivery_ad_campaign_index', '3dc39172fdd19f33c25ba2e1afe28450'),
      ('admin_delivery_ad_action_queue_rows', '8592abe41ddd0a8e643fcd2f702271f1'),
      ('admin_delivery_ad_campaigns_page', 'c9f11510baa51fa5b42aa683932e4c5a'),
      ('is_platform_admin', 'cbf602d1b121f7c5e58ad38a7637be87')
    ) AS t(fn, prod_md5)
  LOOP
    IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = r.fn AND pronamespace = 'public'::regnamespace) IS DISTINCT FROM r.prod_md5 THEN
      v_bad := v_bad || ' ' || r.fn;
    END IF;
  END LOOP;
  IF v_bad <> '' THEN RAISE EXCEPTION 'ASSERT FAILED: base differs from prod:%', v_bad; END IF;
  RAISE NOTICE 'PASS base = prod md5 (13 functions)';
END $$;
