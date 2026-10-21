-- 2-E ADS-22 + 2-F FIN-15 격리 DB 단언 (run.sh 가 픽스처 + 20270603150000 적용 후 실행)
-- 실패 시 RAISE EXCEPTION → psql ON_ERROR_STOP=1 로 비정상 종료.

SET request.jwt.claim.role = 'service_role';

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: %', label;
  END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;

-- 주문 헬퍼: 픽업 · 상품 p100 x qty · 선택 쿠폰/상품권 · payload 분할은 임의 값 (조작 가능)
CREATE OR REPLACE FUNCTION pg_temp.ord(
  p_key text, p_qty int, p_discount numeric, p_campaign uuid, p_ent uuid,
  p_sf numeric, p_pf numeric, p_gift uuid, p_gift_amt numeric,
  p_store uuid DEFAULT '00000000-0000-0000-0000-0000000000a1',
  p_product uuid DEFAULT '00000000-0000-0000-0000-00000000e001',
  p_unit numeric DEFAULT 100
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_store_order_atomic(
    '00000000-0000-0000-0000-0000000000e1'::uuid,
    p_store,
    p_key,
    jsonb_strip_nulls(jsonb_build_object(
      'order_no', 'ISO-' || p_key,
      'fulfillment_type', 'pickup',
      'total_amount', p_unit * p_qty,
      'discount_amount', p_discount,
      'payment_amount', p_unit * p_qty - p_discount - p_gift_amt,
      'coupon_campaign_id', p_campaign,
      'user_coupon_id', p_ent,
      'store_funded_amount', p_sf,
      'platform_funded_amount', p_pf,
      'gift_instance_ids', CASE WHEN p_gift IS NULL THEN NULL ELSE jsonb_build_array(p_gift) END
    )),
    jsonb_build_array(jsonb_build_object(
      'product_id', p_product, 'qty', p_qty, 'unit', p_unit,
      'base_unit_after_discount', p_unit, 'unit_options_delta', 0,
      'subtotal', p_unit * p_qty, 'title', 'iso'))
  )
$$;

CREATE OR REPLACE FUNCTION pg_temp.ent(p_campaign uuid) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.coupon_user_entitlements (campaign_id, store_id, buyer_user_id)
  VALUES (p_campaign, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1')
  RETURNING id
$$;

CREATE OR REPLACE FUNCTION pg_temp.split(p_res jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT o.discount_amount || '/' || o.store_funded_amount::int || '/' || o.platform_funded_amount::int
    FROM public.store_orders o WHERE o.id = (p_res->'order'->>'id')::uuid
$$;

-- ── 스키마 ────────────────────────────────────────────────────
SELECT pg_temp.ok(
  (SELECT NOT convalidated FROM pg_constraint WHERE conname = 'store_orders_coupon_funding_split_check'),
  'split CHECK exists and is NOT VALID (no history scan, D-5)');
SELECT pg_temp.ok(
  (SELECT store_funded_amount = 0 AND platform_funded_amount = 0 AND discount_amount = 50
     FROM public.store_orders WHERE id = '00000000-0000-0000-0000-00000000aa01'),
  'legacy violating coupon row untouched');
SELECT pg_temp.ok(
  position('point_commerce_blocked' in (SELECT prosrc FROM pg_proc WHERE proname = 'create_store_order_atomic')) = 0,
  'FIN-15: create_store_order_atomic no longer reads point_commerce_blocked');

-- ── ADS-22: 조작된 분할 payload → 저장값은 캠페인 기준 ──────────────
DO $$
DECLARE r jsonb; e uuid;
BEGIN
  -- STORE_FUNDED fixed 30: payload claims platform 30
  e := pg_temp.ent('00000000-0000-0000-0000-0000000c0001');
  r := pg_temp.ord('ads22-store', 2, 30, '00000000-0000-0000-0000-0000000c0001', e, 0, 30, NULL, 0);
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'STORE_FUNDED order ok ' || r::text);
  PERFORM pg_temp.ok(pg_temp.split(r) = '30/30/0', 'STORE_FUNDED manipulated split corrected -> 30/30/0 got ' || pg_temp.split(r));

  -- PLATFORM_FUNDED 10% of 300 = 30: payload claims store 30 / platform 999
  e := pg_temp.ent('00000000-0000-0000-0000-0000000c0002');
  r := pg_temp.ord('ads22-platform', 3, 30, '00000000-0000-0000-0000-0000000c0002', e, 30, 999, NULL, 0);
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'PLATFORM_FUNDED order ok ' || r::text);
  PERFORM pg_temp.ok(pg_temp.split(r) = '30/0/30', 'PLATFORM_FUNDED split -> 30/0/30 got ' || pg_temp.split(r));

  -- SHARED_FUNDED fixed 100, store share 60: payload claims 0/100
  e := pg_temp.ent('00000000-0000-0000-0000-0000000c0003');
  r := pg_temp.ord('ads22-shared', 2, 100, '00000000-0000-0000-0000-0000000c0003', e, 0, 100, NULL, 0);
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'SHARED_FUNDED order ok ' || r::text);
  PERFORM pg_temp.ok(pg_temp.split(r) = '100/60/40', 'SHARED_FUNDED split -> 100/60/40 got ' || pg_temp.split(r));

  -- SHARED_FUNDED fixed 50, store share 60 -> clamp to discount
  e := pg_temp.ent('00000000-0000-0000-0000-0000000c0004');
  r := pg_temp.ord('ads22-shared-clamp', 1, 50, '00000000-0000-0000-0000-0000000c0004', e, 60, 60, NULL, 0);
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'SHARED_FUNDED clamp order ok ' || r::text);
  PERFORM pg_temp.ok(pg_temp.split(r) = '50/50/0', 'SHARED_FUNDED clamp -> 50/50/0 got ' || pg_temp.split(r));

  -- no coupon: payload claims platform 500 (Coin mint input) -> 0/0
  r := pg_temp.ord('ads22-nocoupon', 1, 0, NULL, NULL, 0, 500, NULL, 0);
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'no-coupon order ok ' || r::text);
  PERFORM pg_temp.ok(pg_temp.split(r) = '0/0/0', 'no-coupon payload platform_funded ignored -> 0/0/0 got ' || pg_temp.split(r));
END
$$;

-- ── 기존 동작 불변: 쿠폰 할인 검증 · 중복 사용 · price_changed · 상품권 · 재고 ──
DO $$
DECLARE r jsonb; e uuid;
BEGIN
  -- discount payload mismatch still fail-closed
  e := pg_temp.ent('00000000-0000-0000-0000-0000000c0001');
  r := pg_temp.ord('keep-invalid-discount', 2, 40, '00000000-0000-0000-0000-0000000c0001', e, 40, 0, NULL, 0);
  PERFORM pg_temp.ok(r->>'error' = 'invalid_discount', 'coupon discount mismatch -> invalid_discount got ' || r::text);

  -- entitlement already redeemed (reuse the STORE_FUNDED one used above)
  r := pg_temp.ord('keep-redeemed', 2, 30, '00000000-0000-0000-0000-0000000c0001',
                   (SELECT id FROM public.coupon_user_entitlements WHERE status = 'redeemed' AND campaign_id = '00000000-0000-0000-0000-0000000c0001' LIMIT 1),
                   30, 0, NULL, 0);
  PERFORM pg_temp.ok(r->>'error' = 'coupon_already_redeemed', 'redeemed entitlement -> coupon_already_redeemed got ' || r::text);
  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.store_coupon_redemptions) = 4
    AND (SELECT count(*) FROM public.coupon_user_entitlements WHERE status = 'redeemed') = 4,
    'coupon redemption + entitlement lock in same TX (4 coupon orders)');

  -- price_changed: client unit differs from live price
  r := pg_temp.ord('keep-price', 1, 0, NULL, NULL, 0, 0, NULL, 0, p_unit => 90);
  PERFORM pg_temp.ok(r->>'error' = 'price_changed', 'stale unit -> price_changed got ' || r::text);

  -- gift: 200 face, order 300 -> gift 200, pay 100, merchant net 180
  r := pg_temp.ord('keep-gift', 3, 0, NULL, NULL, 0, 0, '00000000-0000-0000-0000-00000000f101', 200);
  PERFORM pg_temp.ok((r->>'ok')::boolean AND (r->'order'->>'payment_amount')::int = 100, 'gift order ok, pay 100 got ' || r::text);
  PERFORM pg_temp.ok(
    (SELECT gift_redemption_amount = 200 AND amount_before_gift = 300 FROM public.store_orders WHERE order_no = 'ISO-keep-gift')
    AND (SELECT merchant_net_amount = 180 FROM public.gift_certificate_redemptions)
    AND (SELECT amount = 180 FROM public.gift_certificate_revenue_ledger WHERE entry_type = 'REVENUE_CREATE')
    AND (SELECT status = 'FULLY_REDEEMED' FROM public.gift_certificate_instances WHERE id = '00000000-0000-0000-0000-00000000f101'),
    'gift redemption / revenue ledger / instance unchanged');

  -- stock: 1 left, qty 2 -> insufficient; qty 1 -> sold_out (reason stock)
  r := pg_temp.ord('keep-stock-over', 2, 0, NULL, NULL, 0, 0, NULL, 0, p_product => '00000000-0000-0000-0000-00000000e002');
  PERFORM pg_temp.ok(r->>'error' = 'insufficient_stock', 'qty > stock -> insufficient_stock got ' || r::text);
  r := pg_temp.ord('keep-stock-last', 1, 0, NULL, NULL, 0, 0, NULL, 0, p_product => '00000000-0000-0000-0000-00000000e002');
  PERFORM pg_temp.ok((r->>'ok')::boolean AND jsonb_array_length(r->'sold_out_products') = 1, 'last unit -> ok + sold_out_products');
  PERFORM pg_temp.ok(
    (SELECT stock_qty = 0 AND product_status = 'sold_out' AND sold_out_reason = 'stock'
       FROM public.store_products WHERE id = '00000000-0000-0000-0000-00000000e002'),
    'stock -> 0, sold_out, reason stock');

  -- idempotent replay
  r := pg_temp.ord('ads22-nocoupon', 1, 0, NULL, NULL, 0, 500, NULL, 0);
  PERFORM pg_temp.ok((r->>'idempotent')::boolean, 'same client_order_key -> idempotent');
END
$$;

-- ── FIN-15: point_commerce_blocked=true 매장 → 주문 성공 (캐시 게이트 OFF) ──
UPDATE public.stores SET point_commerce_blocked = true WHERE id = '00000000-0000-0000-0000-0000000000a1';
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.ord('fin15-blocked-flag', 1, 0, NULL, NULL, 0, 0, NULL, 0);
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'point_commerce_blocked=true store -> order ok (legacy gate removed) got ' || r::text);
END
$$;

-- 캐시 게이트 ON + 주문 불가 매장 → 거부 (단일 게이트). 주문 행 없음.
SET test.cash_gate = 'block_when_not_positive';
INSERT INTO public.t_cash_position (store_id, orderable, net_minor) VALUES ('00000000-0000-0000-0000-0000000000a1', false, -500);
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.ord('fin15-cash-gate', 1, 0, NULL, NULL, 0, 0, NULL, 0);
  PERFORM pg_temp.ok(coalesce((r->>'ok')::boolean, false) = false
                     AND NOT EXISTS (SELECT 1 FROM public.store_orders WHERE order_no = 'ISO-fin15-cash-gate'),
                     'cash gate ON + not orderable -> rejected, no order row (rpc error=' || coalesce(r->>'error', 'null') || ')');
END
$$;
UPDATE public.t_cash_position SET orderable = true;
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.ord('fin15-cash-gate-ok', 1, 0, NULL, NULL, 0, 0, NULL, 0);
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'cash gate ON + orderable -> ok');
END
$$;
RESET test.cash_gate;

-- ── CHECK: 레거시 위반 행은 계속 갱신 가능 · 신규 위반 행은 거부 ──
UPDATE public.store_orders SET order_status = 'cancelled' WHERE id = '00000000-0000-0000-0000-00000000aa01';
SELECT pg_temp.ok(
  (SELECT order_status = 'cancelled' FROM public.store_orders WHERE id = '00000000-0000-0000-0000-00000000aa01'),
  'legacy violating pending row can still change status (auto-cancel not blocked)');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.store_orders (order_no, buyer_user_id, store_id, total_amount, discount_amount, payment_amount,
                                     coupon_campaign_id, store_funded_amount, platform_funded_amount)
    VALUES ('NEW-BAD-SPLIT', gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', 300, 50, 250,
            '00000000-0000-0000-0000-0000000c0001', 0, 0);
    RAISE EXCEPTION 'FAIL: new coupon row with split <> discount accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: new coupon row with split <> discount rejected';
  END;
  BEGIN
    UPDATE public.store_orders SET platform_funded_amount = platform_funded_amount + 1 WHERE order_no = 'ISO-ads22-shared';
    RAISE EXCEPTION 'FAIL: post-cutoff coupon row split corruption accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: post-cutoff coupon row split corruption rejected';
  END;
END
$$;
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.store_orders
    WHERE coupon_campaign_id IS NOT NULL AND order_no LIKE 'ISO-%'
      AND store_funded_amount + platform_funded_amount <> discount_amount) = 0,
  'all RPC coupon orders: store + platform = discount');
