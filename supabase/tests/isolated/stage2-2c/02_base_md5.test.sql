-- Base check (before the 2-C migration): the definitions loaded from the repo are byte-identical to production
-- (md5(prosrc) read from production pg_proc, read-only, 2026-10-21). The 2-C migration is a minimal diff on these.
DO $$
DECLARE
  r record;
  v_bad text := '';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('gift_certificate_refund_order_atomic', 'cb3267c206e2da28ee69aa5a3d31bef5'),
      ('restore_store_coupon_entitlement', 'ac77b283ccb6e199e1622968948446d5'),
      ('store_order_owner_cancel_atomic', '2cceb2c3a5bdff181519dfe1c76a8a55'),
      ('store_order_cancel_request_decide_atomic', 'e9e6ba25b0f24e777c16abc23ffdad5b'),
      ('admin_store_coupon_campaign_page', 'c2c07dfcf8d4565f9a3bdcd8d77cfeab'),
      ('reverse_coin_credits_for_order', 'd4b9c896ff27db5dd4ed87bcbe56690f'),
      ('gift_certificate_cancel_order_restore', 'd3b8126d739a4161edeafaf57f41cc49'),
      ('gift_certificate_redemption_reverse', 'da8e00cd131551f5454712b7571513df'),
      ('ensure_store_economic_point_account', 'c09eef653f1f3da98820059a5e349442'),
      ('gift_certificate_instance_is_expired', 'dab25425e9daa032bee6b76dc5874a45'),
      ('gift_certificate_issue_date', '8305781d62578ebc102cafeace0897a3')
    ) AS t(fn, prod_md5)
  LOOP
    IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = r.fn AND pronamespace = 'public'::regnamespace) IS DISTINCT FROM r.prod_md5 THEN
      v_bad := v_bad || ' ' || r.fn;
    END IF;
  END LOOP;
  IF v_bad <> '' THEN RAISE EXCEPTION 'ASSERT FAILED: base differs from prod:%', v_bad; END IF;
  RAISE NOTICE 'PASS base = prod md5 (11 functions)';
END $$;
