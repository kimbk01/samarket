-- 3단계 OPS-08 + LOC-004 격리 DB 단언 (run.sh 가 픽스처 + 20270604110000 + 20270604110100 적용 후 실행)
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

-- 주문 헬퍼: 상품 p100 x1 · fulfillment · 추가 payload 키 병합
CREATE OR REPLACE FUNCTION pg_temp.ord(p_key text, p_fulfillment text, p_extra jsonb DEFAULT '{}'::jsonb,
                                       p_unit numeric DEFAULT 100)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_store_order_atomic(
    '00000000-0000-0000-0000-0000000000e1'::uuid,
    '00000000-0000-0000-0000-0000000000a1'::uuid,
    p_key,
    jsonb_build_object(
      'order_no', 'ISO3-' || p_key,
      'fulfillment_type', p_fulfillment,
      'total_amount', 100,
      'payment_amount', 100,
      'delivery_fee_amount', 0
    ) || p_extra,
    jsonb_build_array(jsonb_build_object(
      'product_id', '00000000-0000-0000-0000-00000000e001', 'qty', 1, 'unit', p_unit,
      'base_unit_after_discount', p_unit, 'unit_options_delta', 0, 'subtotal', p_unit, 'title', 'p100'))
  )
$$;

CREATE OR REPLACE FUNCTION pg_temp.order_count() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.store_orders
$$;

-- Manila HH:MM offset from now (for schedule / break windows around the current instant)
CREATE OR REPLACE FUNCTION pg_temp.mnl(p_offset interval) RETURNS text LANGUAGE sql AS $$
  SELECT to_char((now() + p_offset) AT TIME ZONE 'Asia/Manila', 'HH24:MI')
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_store() RETURNS void LANGUAGE sql AS $$
  UPDATE public.stores
     SET is_open = true, pickup_available = true, delivery_available = false, business_hours_json = '{}'::jsonb
   WHERE id = '00000000-0000-0000-0000-0000000000a1'
$$;

-- ── baseline: pickup order still OK ─────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.reset_store();
  r := pg_temp.ord('pk-ok', 'pickup');
  PERFORM pg_temp.ok((r->>'ok')::boolean AND (r->>'idempotent')::boolean = false, 'pickup order created (baseline unchanged) ' || r::text);
  PERFORM pg_temp.ok(
    (SELECT checkout_serviceability_reason IS NULL AND checkout_store_latitude IS NULL
       FROM public.store_orders WHERE order_no = 'ISO3-pk-ok'),
    'pickup order without snapshot keys stores NULL snapshot');
END $$;

-- ── OPS-08 (2): pickup_available = false → store_pickup_disabled, no mutation ──
DO $$
DECLARE r jsonb; n0 bigint := pg_temp.order_count();
BEGIN
  PERFORM pg_temp.reset_store();
  UPDATE public.stores SET pickup_available = false WHERE id = '00000000-0000-0000-0000-0000000000a1';
  r := pg_temp.ord('pk-off', 'pickup');
  PERFORM pg_temp.ok(r->>'error' = 'store_pickup_disabled' AND (r->>'http_status')::int = 400,
                     'pickup_available=false -> store_pickup_disabled ' || r::text);
  PERFORM pg_temp.ok(pg_temp.order_count() = n0, 'pickup disabled: no order row');
  -- existing earlier checks keep precedence (new checks run last)
  r := pg_temp.ord('pk-off-price', 'pickup', '{}'::jsonb, 90);
  PERFORM pg_temp.ok(r->>'error' = 'price_changed', 'pickup disabled + stale price -> price_changed first ' || r::text);
  -- pickup disabled does not block delivery
  UPDATE public.stores SET delivery_available = true WHERE id = '00000000-0000-0000-0000-0000000000a1';
  r := pg_temp.ord('pk-off-dlv', 'local_delivery');
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'pickup disabled, delivery on -> local_delivery OK ' || r::text);
END $$;

-- ── OPS-08 (3): delivery_available = false → store_delivery_disabled ──
DO $$
DECLARE r jsonb; n0 bigint := pg_temp.order_count();
BEGIN
  PERFORM pg_temp.reset_store();
  r := pg_temp.ord('dl-off', 'local_delivery');
  PERFORM pg_temp.ok(r->>'error' = 'store_delivery_disabled' AND (r->>'http_status')::int = 400,
                     'delivery_available=false -> store_delivery_disabled ' || r::text);
  PERFORM pg_temp.ok(pg_temp.order_count() = n0, 'delivery disabled: no order row');
  -- is_open=false keeps the original early store_closed
  UPDATE public.stores SET is_open = false WHERE id = '00000000-0000-0000-0000-0000000000a1';
  r := pg_temp.ord('dl-off-closed', 'local_delivery');
  PERFORM pg_temp.ok(r->>'error' = 'store_closed', 'is_open=false -> store_closed (original early check) ' || r::text);
END $$;

-- ── OPS-08 (1): effective opening state (schedule / break) → store_closed ──
DO $$
DECLARE r jsonb; n0 bigint;
BEGIN
  PERFORM pg_temp.reset_store();
  n0 := pg_temp.order_count();
  -- schedule window that excludes now (opens in 2h, closes in 3h)
  UPDATE public.stores SET business_hours_json = jsonb_build_object('auto_business_hours', jsonb_build_object(
      'enabled', true, 'schedule_enforced', true, 'timezone', 'Asia/Manila',
      'open', pg_temp.mnl(interval '2 hours'), 'close', pg_temp.mnl(interval '3 hours')))
   WHERE id = '00000000-0000-0000-0000-0000000000a1';
  r := pg_temp.ord('sch-out', 'pickup');
  PERFORM pg_temp.ok(r->>'error' = 'store_closed', 'outside auto schedule -> store_closed ' || r::text);
  PERFORM pg_temp.ok(pg_temp.order_count() = n0, 'outside schedule: no order row');

  -- same schedule not enforced (legacy enabled only) -> open
  UPDATE public.stores SET business_hours_json = jsonb_set(business_hours_json, '{auto_business_hours,schedule_enforced}', 'false')
   WHERE id = '00000000-0000-0000-0000-0000000000a1';
  r := pg_temp.ord('sch-not-enforced', 'pickup');
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'schedule_enforced=false -> schedule ignored, order OK ' || r::text);

  -- schedule that contains now
  UPDATE public.stores SET business_hours_json = jsonb_build_object('auto_business_hours', jsonb_build_object(
      'enabled', true, 'schedule_enforced', true, 'timezone', 'Asia/Manila',
      'open', pg_temp.mnl(interval '-1 hour'), 'close', pg_temp.mnl(interval '1 hour')))
   WHERE id = '00000000-0000-0000-0000-0000000000a1';
  r := pg_temp.ord('sch-in', 'pickup');
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'inside auto schedule -> order OK ' || r::text);

  -- break window around now
  UPDATE public.stores SET business_hours_json = jsonb_build_object('break_hours', jsonb_build_object(
      'start', pg_temp.mnl(interval '-30 minutes'), 'end', pg_temp.mnl(interval '30 minutes')))
   WHERE id = '00000000-0000-0000-0000-0000000000a1';
  n0 := pg_temp.order_count();
  r := pg_temp.ord('brk-in', 'pickup');
  PERFORM pg_temp.ok(r->>'error' = 'store_closed', 'inside break -> store_closed ' || r::text);
  PERFORM pg_temp.ok(pg_temp.order_count() = n0, 'inside break: no order row');
END $$;

-- ── LOC-004: serviceability snapshot written by the same INSERT ──
DO $$
DECLARE r jsonb; o record;
BEGIN
  PERFORM pg_temp.reset_store();
  UPDATE public.stores SET delivery_available = true WHERE id = '00000000-0000-0000-0000-0000000000a1';
  r := pg_temp.ord('snap', 'local_delivery', jsonb_build_object(
    'delivery_latitude', 14.6, 'delivery_longitude', 121.0,
    'checkout_straight_distance_meters', 1800, 'checkout_route_distance_meters', 2400,
    'checkout_store_latitude', 14.5995, 'checkout_store_longitude', 120.9842,
    'checkout_serviceability_eligible', true, 'checkout_serviceability_max_km', 5,
    'checkout_serviceability_reason', 'ok'));
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'local_delivery with snapshot -> OK ' || r::text);
  SELECT * INTO o FROM public.store_orders WHERE id = (r->'order'->>'id')::uuid;
  PERFORM pg_temp.ok(o.checkout_store_latitude = 14.5995 AND o.checkout_store_longitude = 120.9842,
                     'snapshot store lat/lng stored');
  PERFORM pg_temp.ok(o.checkout_serviceability_eligible IS TRUE AND o.checkout_serviceability_max_km = 5
                     AND o.checkout_serviceability_reason = 'ok', 'snapshot eligible/max_km/reason stored');
  PERFORM pg_temp.ok(o.checkout_straight_distance_meters = 1800 AND o.checkout_route_distance_meters = 2400,
                     'existing distance keys still stored');

  -- max_km null (no max) stays NULL, reason kept
  r := pg_temp.ord('snap-nomax', 'local_delivery', jsonb_build_object(
    'checkout_store_latitude', 14.5995, 'checkout_store_longitude', 120.9842,
    'checkout_serviceability_eligible', true, 'checkout_serviceability_max_km', NULL,
    'checkout_serviceability_reason', 'policy_disabled'));
  SELECT * INTO o FROM public.store_orders WHERE id = (r->'order'->>'id')::uuid;
  PERFORM pg_temp.ok(o.checkout_serviceability_max_km IS NULL AND o.checkout_serviceability_reason = 'policy_disabled',
                     'snapshot max_km null kept NULL, reason stored');

  -- wrong jsonb types -> NULL, no cast error
  r := pg_temp.ord('snap-bad', 'local_delivery', jsonb_build_object(
    'checkout_store_latitude', 'x', 'checkout_store_longitude', '120.9',
    'checkout_serviceability_eligible', 'yes', 'checkout_serviceability_max_km', 'five',
    'checkout_serviceability_reason', ''));
  PERFORM pg_temp.ok((r->>'ok')::boolean, 'malformed snapshot keys do not fail the order ' || r::text);
  SELECT * INTO o FROM public.store_orders WHERE id = (r->'order'->>'id')::uuid;
  PERFORM pg_temp.ok(o.checkout_store_latitude IS NULL AND o.checkout_store_longitude IS NULL
                     AND o.checkout_serviceability_eligible IS NULL AND o.checkout_serviceability_max_km IS NULL
                     AND o.checkout_serviceability_reason IS NULL, 'malformed snapshot keys stored as NULL');
END $$;

-- ── idempotent replay returns the stored row even after delivery is turned off ──
DO $$
DECLARE r1 jsonb; r2 jsonb;
BEGIN
  PERFORM pg_temp.reset_store();
  UPDATE public.stores SET delivery_available = true WHERE id = '00000000-0000-0000-0000-0000000000a1';
  r1 := pg_temp.ord('idem', 'local_delivery', '{"checkout_serviceability_reason":"ok","checkout_serviceability_eligible":true}'::jsonb);
  UPDATE public.stores SET delivery_available = false WHERE id = '00000000-0000-0000-0000-0000000000a1';
  r2 := pg_temp.ord('idem', 'local_delivery');
  PERFORM pg_temp.ok((r2->>'idempotent')::boolean AND r2->'order'->>'id' = r1->'order'->>'id',
                     'idempotent replay returns first order (snapshot of first request) ' || r2::text);
END $$;

-- ── return shape unchanged (keys) ──
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.reset_store();
  r := pg_temp.ord('shape', 'pickup');
  PERFORM pg_temp.ok(
    (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(r) k)
      = ARRAY['idempotent','ok','order','order_created_event_id','owner_user_id','sold_out_products','store_name'],
    'success return shape keys unchanged');
END $$;

-- ── privileges ──
DO $$
BEGIN
  PERFORM pg_temp.ok(NOT has_function_privilege('anon', 'public.create_store_order_atomic(uuid,uuid,text,jsonb,jsonb)', 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', 'public.create_store_order_atomic(uuid,uuid,text,jsonb,jsonb)', 'EXECUTE')
                     AND has_function_privilege('service_role', 'public.create_store_order_atomic(uuid,uuid,text,jsonb,jsonb)', 'EXECUTE'),
                     'create_store_order_atomic EXECUTE = service_role only');
  PERFORM pg_temp.ok(NOT has_function_privilege('anon', 'public.store_front_commerce_open(jsonb,boolean,timestamptz)', 'EXECUTE')
                     AND NOT has_function_privilege('authenticated', 'public.store_front_commerce_open(jsonb,boolean,timestamptz)', 'EXECUTE')
                     AND NOT has_function_privilege('anon', 'public.store_front_hhmm_to_minutes(text)', 'EXECUTE'),
                     'SQL twin helpers not exposed to anon/authenticated');
  PERFORM pg_temp.ok((SELECT prosecdef FROM pg_proc WHERE oid = 'public.create_store_order_atomic(uuid,uuid,text,jsonb,jsonb)'::regprocedure),
                     'create_store_order_atomic still SECURITY DEFINER');
END $$;
