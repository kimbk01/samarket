-- GFT-01 assertions: gift_certificate_redemption_reverse order-status guard + service_role EXECUTE revoked.
-- Requires 00_fixture.sql + supabase/migrations/20270603140000_gift_redemption_reverse_terminal_guard.sql loaded.
-- Run with psql -v ON_ERROR_STOP=1 (each DO block RAISEs on a failed assertion).

CREATE OR REPLACE FUNCTION public.t_assert(p_cond boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT FAILED: %', p_msg; END IF;
  RAISE NOTICE 'PASS: %', p_msg;
END $$;

INSERT INTO public.gift_certificate_products(id, store_id, title, face_value, purchase_price)
VALUES ('bbbbbbbb-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000001', 'REDEEM P', 1000, 1000);

-- order with one redemption: instance face 1000, used 300 + forfeited 700 (one-time full consumption)
CREATE OR REPLACE FUNCTION public.t_gift_order(p_order_status text, p_payment_status text DEFAULT 'paid')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_order uuid; v_inst uuid;
BEGIN
  INSERT INTO public.store_orders(store_id, buyer_user_id, payment_status, order_status, gift_redemption_amount)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
          p_payment_status, p_order_status, 300)
  RETURNING id INTO v_order;
  INSERT INTO public.gift_certificate_instances(product_id, store_id, purchaser_user_id, current_owner_user_id,
    face_value, purchase_price, remaining_balance, status, fully_redeemed_at)
  VALUES ('bbbbbbbb-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000001',
          '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
          1000, 1000, 0, 'FULLY_REDEEMED', now())
  RETURNING id INTO v_inst;
  UPDATE public.gift_certificate_products SET issued_count = issued_count + 1
   WHERE id = 'bbbbbbbb-0000-0000-0000-0000000000f1';
  INSERT INTO public.gift_certificate_redemptions(order_id, instance_id, store_id, buyer_user_id,
    redeemed_amount, merchant_net_amount, idempotency_key, forfeited_amount)
  VALUES (v_order, v_inst, 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
          300, 270, 'red:' || v_order::text, 700);
  RETURN v_order;
END $$;

SET test.jwt_role = 'service_role';

-- 1) pending order -> order_not_terminal, nothing reversed
DO $$
DECLARE v_o uuid := public.t_gift_order('pending'); r jsonb;
BEGIN
  r := public.gift_certificate_redemption_reverse(v_o);
  PERFORM public.t_assert(r->>'ok' = 'false' AND r->>'error' = 'order_not_terminal'
    AND r->>'order_status' = 'pending', 'pending order -> order_not_terminal (' || r::text || ')');
  PERFORM public.t_assert((SELECT NOT reversed FROM gift_certificate_redemptions WHERE order_id = v_o), 'pending: redemption untouched');
  PERFORM public.t_assert((SELECT remaining_balance = 0 AND status = 'FULLY_REDEEMED' FROM gift_certificate_instances i
    JOIN gift_certificate_redemptions r ON r.instance_id = i.id WHERE r.order_id = v_o), 'pending: instance untouched');
  PERFORM public.t_assert((SELECT gift_redemption_amount = 300 FROM store_orders WHERE id = v_o), 'pending: order gift amount untouched');
  PERFORM public.t_assert(NOT EXISTS (SELECT 1 FROM gift_certificate_ledger WHERE entry_type = 'REDEEM_REVERSE'
    AND related_id = (SELECT id::text FROM gift_certificate_redemptions WHERE order_id = v_o)), 'pending: no REDEEM_REVERSE ledger');
END $$;

-- 2) other in-progress statuses are refused too
DO $$
DECLARE s text; r jsonb;
BEGIN
  FOREACH s IN ARRAY ARRAY['accepted','preparing','ready_for_pickup','delivering','completed','cancel_requested'] LOOP
    r := public.gift_certificate_redemption_reverse(public.t_gift_order(s));
    PERFORM public.t_assert(r->>'error' = 'order_not_terminal', s || ' -> order_not_terminal');
  END LOOP;
END $$;

-- 3) cancelled order -> reversed; 4) duplicate reverse idempotent
DO $$
DECLARE v_o uuid := public.t_gift_order('cancelled', 'cancelled'); r jsonb; r2 jsonb; v_led int;
BEGIN
  r := public.gift_certificate_redemption_reverse(v_o);
  PERFORM public.t_assert(r->>'ok' = 'true' AND (r->>'reversed_count')::int = 1, 'cancelled -> ok reversed_count 1');
  PERFORM public.t_assert((SELECT reversed AND reversed_at IS NOT NULL FROM gift_certificate_redemptions WHERE order_id = v_o), 'cancelled: redemption reversed');
  PERFORM public.t_assert((SELECT remaining_balance = 1000 AND status = 'ACTIVE' AND fully_redeemed_at IS NULL
    FROM gift_certificate_instances i JOIN gift_certificate_redemptions r ON r.instance_id = i.id WHERE r.order_id = v_o),
    'cancelled: instance restored to face (redeemed + forfeited) ACTIVE');
  PERFORM public.t_assert((SELECT gift_redemption_amount = 0 FROM store_orders WHERE id = v_o), 'cancelled: order gift amount recomputed 0');
  SELECT count(*) INTO v_led FROM gift_certificate_ledger
   WHERE related_id = (SELECT id::text FROM gift_certificate_redemptions WHERE order_id = v_o);
  PERFORM public.t_assert(v_led = 2, 'cancelled: REDEEM_REVERSE + FORFEIT_REVERSE ledger rows');
  r2 := public.gift_certificate_redemption_reverse(v_o);
  PERFORM public.t_assert(r2->>'ok' = 'true' AND (r2->>'reversed_count')::int = 0 AND r2->>'idempotent' = 'true',
    'duplicate reverse -> ok idempotent reversed_count 0');
  PERFORM public.t_assert((SELECT count(*) FROM gift_certificate_ledger
    WHERE related_id = (SELECT id::text FROM gift_certificate_redemptions WHERE order_id = v_o)) = v_led,
    'duplicate reverse: no extra ledger rows');
  PERFORM public.t_assert((SELECT remaining_balance = 1000 FROM gift_certificate_instances i
    JOIN gift_certificate_redemptions r ON r.instance_id = i.id WHERE r.order_id = v_o), 'duplicate reverse: balance not double restored');
END $$;

-- 5) refunded / payment failed allowed; unknown order -> order_not_found; non-service JWT -> forbidden
DO $$
DECLARE r jsonb;
BEGIN
  r := public.gift_certificate_redemption_reverse(public.t_gift_order('refunded', 'refunded'));
  PERFORM public.t_assert(r->>'ok' = 'true' AND (r->>'reversed_count')::int = 1, 'refunded -> ok');
  r := public.gift_certificate_redemption_reverse(public.t_gift_order('pending', 'failed'));
  PERFORM public.t_assert(r->>'ok' = 'true' AND (r->>'reversed_count')::int = 1, 'payment_status failed -> ok');
  r := public.gift_certificate_redemption_reverse(gen_random_uuid());
  PERFORM public.t_assert(r->>'error' = 'order_not_found', 'unknown order -> order_not_found');
  PERFORM set_config('test.jwt_role', 'authenticated', true);
  r := public.gift_certificate_redemption_reverse(public.t_gift_order('cancelled', 'cancelled'));
  PERFORM public.t_assert(r->>'error' = 'forbidden', 'non service JWT -> forbidden');
  PERFORM set_config('test.jwt_role', 'service_role', true);
END $$;

-- 6) grants: service_role has no EXECUTE on reverse; wrappers keep EXECUTE
DO $$
BEGIN
  PERFORM public.t_assert(NOT has_function_privilege('service_role', 'public.gift_certificate_redemption_reverse(uuid)', 'EXECUTE'),
    'service_role EXECUTE on reverse revoked');
  PERFORM public.t_assert(NOT has_function_privilege('anon', 'public.gift_certificate_redemption_reverse(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.gift_certificate_redemption_reverse(uuid)', 'EXECUTE'),
    'anon/authenticated EXECUTE on reverse absent');
  PERFORM public.t_assert(has_function_privilege('service_role', 'public.gift_certificate_cancel_order_restore(uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.gift_certificate_refund_order_atomic(uuid, uuid)', 'EXECUTE'),
    'service_role keeps EXECUTE on both wrappers');
  PERFORM public.t_assert((SELECT prosecdef AND pg_get_userbyid(proowner) = 'postgres' FROM pg_proc
    WHERE oid = 'public.gift_certificate_redemption_reverse(uuid)'::regprocedure), 'reverse stays SECURITY DEFINER owned by postgres');
END $$;

-- test orders used by the role-switched checks below
CREATE TABLE public.t_ids (k text PRIMARY KEY, id uuid);
INSERT INTO public.t_ids VALUES
  ('direct_cancelled', public.t_gift_order('cancelled', 'cancelled')),
  ('wrap_cancelled', public.t_gift_order('cancelled', 'cancelled')),
  ('wrap_refund', public.t_gift_order('refund_requested', 'paid')),
  ('wrap_pending', public.t_gift_order('pending', 'paid'));
GRANT SELECT ON public.t_ids TO service_role;
GRANT EXECUTE ON FUNCTION public.t_assert(boolean, text) TO service_role;
