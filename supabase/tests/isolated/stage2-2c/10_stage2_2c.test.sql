-- Stage 2-C assertions (FIN-05 / ADS-21 / GFT-05 / ADS-25). Requires 00_fixture + 01_prod_base + ORD-06 migration
-- + 20270603130000_stage2_2c_cancel_refund_money_atomic.sql loaded. psql -v ON_ERROR_STOP=1 (each DO RAISEs on failure).

INSERT INTO auth.users(id) VALUES ('33333333-3333-3333-3333-333333333333'), ('55555555-5555-5555-5555-555555555555');
INSERT INTO public.stores(id, owner_user_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');

CREATE OR REPLACE FUNCTION public.t_assert(p_cond boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT FAILED: %', p_msg; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.t_new_order(p_status text, p_delivery text DEFAULT NULL, p_buyer uuid DEFAULT '33333333-3333-3333-3333-333333333333')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.store_orders(order_no, buyer_user_id, store_id, payment_status, order_status, fulfillment_type, payment_amount)
  VALUES ('T-' || substr(md5(random()::text), 1, 8), p_buyer, 'aaaaaaaa-0000-0000-0000-000000000001',
          CASE WHEN p_status = 'pending' THEN 'pending' ELSE 'paid' END, p_status,
          CASE WHEN p_delivery IS NULL THEN 'pickup' ELSE 'local_delivery' END, 610)
  RETURNING id INTO v;
  IF p_delivery IS NOT NULL THEN
    INSERT INTO public.store_order_deliveries(order_id, store_id, buyer_user_id, delivery_status)
    VALUES (v, 'aaaaaaaa-0000-0000-0000-000000000001', p_buyer, p_delivery);
  END IF;
  INSERT INTO public.store_payments(order_id, amount, status) VALUES (v, 610, 'succeeded');
  RETURN v;
END $$;

-- campaign (+ optional lifecycle) / entitlement redeemed by the order / redemption row (what create_store_order_atomic writes)
CREATE OR REPLACE FUNCTION public.t_campaign(p_lifecycle text DEFAULT 'active') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.store_coupon_campaigns(store_id, lifecycle_state, reserved_spend_php)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', p_lifecycle, 1000) RETURNING id INTO v;
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION public.t_coupon(p_order uuid, p_campaign uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid; b uuid;
BEGIN
  SELECT buyer_user_id INTO b FROM public.store_orders WHERE id = p_order;
  INSERT INTO public.coupon_user_entitlements(campaign_id, store_id, buyer_user_id, status, reserved_php, redeemed_order_id)
  VALUES (p_campaign, 'aaaaaaaa-0000-0000-0000-000000000001', b, 'redeemed', 40, p_order) RETURNING id INTO v;
  INSERT INTO public.store_coupon_redemptions(campaign_id, store_id, buyer_user_id, order_id, discount_amount_applied, user_coupon_id)
  VALUES (p_campaign, 'aaaaaaaa-0000-0000-0000-000000000001', b, p_order, 40, v);
  RETURN v;
END $$;
-- gift certificate fully redeemed by the order (one-time consumption), optionally already expired
CREATE OR REPLACE FUNCTION public.t_gift(p_order uuid, p_expired boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid; r uuid;
BEGIN
  INSERT INTO public.gift_certificate_instances(current_owner_user_id, face_value, remaining_balance, status, valid_from, valid_until)
  VALUES ('33333333-3333-3333-3333-333333333333', 500, 0, 'FULLY_REDEEMED', current_date - 60,
          CASE WHEN p_expired THEN current_date - 10 ELSE current_date + 300 END)
  RETURNING id INTO i;
  INSERT INTO public.gift_certificate_redemptions(order_id, instance_id, store_id, buyer_user_id, redeemed_amount,
    platform_fee_amount, merchant_net_amount, forfeited_amount, idempotency_key)
  VALUES (p_order, i, 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 300, 30, 270, 200,
          'order:' || p_order::text || ':gift:1')
  RETURNING id INTO r;
  INSERT INTO public.gift_certificate_revenue_ledger(store_id, redemption_id, entry_type, amount)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', r, 'REVENUE_AVAILABLE', 270);
  UPDATE public.store_orders SET gift_redemption_amount = 300 WHERE id = p_order;
  RETURN i;
END $$;
-- Coin minted for the order (whatever the mint formula was): SALE_EARN by meta.order_id + GIFT_REDEMPTION_EARN by redemption
CREATE OR REPLACE FUNCTION public.t_coin(p_order uuid, p_sale integer, p_gift integer DEFAULT 0) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r uuid;
BEGIN
  INSERT INTO public.store_economic_point_accounts(store_id, balance) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 0)
  ON CONFLICT (store_id) DO NOTHING;
  UPDATE public.store_economic_point_accounts SET balance = balance + p_sale + p_gift WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  IF p_sale > 0 THEN
    INSERT INTO public.store_economic_point_ledger(store_id, entry_kind, amount, balance_after, related_type, related_id, idempotency_key, meta)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'SALE_EARN', p_sale, 0, 'store_order', p_order::text, 'sale_coin:' || p_order::text,
            jsonb_build_object('order_id', p_order));
  END IF;
  IF p_gift > 0 THEN
    SELECT id INTO r FROM public.gift_certificate_redemptions WHERE order_id = p_order LIMIT 1;
    INSERT INTO public.store_economic_point_ledger(store_id, entry_kind, amount, balance_after, related_type, related_id, idempotency_key)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'GIFT_REDEMPTION_EARN', p_gift, 0, 'gift_redemption', r::text, 'gift_coin:' || r::text);
  END IF;
END $$;

-- 0) permissions + ASCII bodies
DO $$
BEGIN
  PERFORM public.t_assert(NOT has_function_privilege('service_role', 'public.store_order_apply_cancel_side_effects(uuid)', 'EXECUTE'), 'side effects: internal only (service_role)');
  PERFORM public.t_assert(NOT has_function_privilege('anon', 'public.store_order_apply_cancel_side_effects(uuid)', 'EXECUTE'), 'side effects: internal only (anon)');
  PERFORM public.t_assert(NOT has_function_privilege('authenticated', 'public.store_order_apply_cancel_side_effects(uuid)', 'EXECUTE'), 'side effects: internal only (authenticated)');
  PERFORM public.t_assert(has_function_privilege('service_role', 'public.store_order_cancel_direct_atomic(uuid,text,text,text)', 'EXECUTE'), 'direct cancel: service_role');
  PERFORM public.t_assert(NOT has_function_privilege('authenticated', 'public.store_order_cancel_direct_atomic(uuid,text,text,text)', 'EXECUTE'), 'direct cancel: not authenticated');
  PERFORM public.t_assert(NOT has_function_privilege('anon', 'public.store_order_cancel_direct_atomic(uuid,text,text,text)', 'EXECUTE'), 'direct cancel: not anon');
  PERFORM public.t_assert(has_function_privilege('service_role', 'public.gift_certificate_refund_order_atomic(uuid,uuid)', 'EXECUTE'), 'refund: service_role kept');
  PERFORM public.t_assert(NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
       AND proname IN ('store_order_apply_cancel_side_effects', 'store_order_cancel_direct_atomic', 'store_order_owner_cancel_atomic',
                       'store_order_cancel_request_decide_atomic', 'gift_certificate_refund_order_atomic', 'restore_store_coupon_entitlement',
                       'admin_store_coupon_campaign_page')
       AND prosrc ~ '[^\x01-\x7f]'), 'function bodies ASCII only');
  RAISE NOTICE 'PASS 0 permissions + ascii';
END $$;

SET test.jwt_role = 'authenticated';
DO $$
DECLARE o uuid := public.t_new_order('pending'); r jsonb;
BEGIN
  r := public.store_order_cancel_direct_atomic(o, 'pending', 'cancelled', 'CUSTOMER');
  PERFORM public.t_assert(r->>'error' = 'forbidden', 'non service jwt -> forbidden: ' || r::text);
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'pending', 'unchanged');
  RAISE NOTICE 'PASS 0b jwt gate';
END $$;
SET test.jwt_role = 'service_role';

-- 1) normal refund: status + Coin REVERSAL (mirror of minted 40 + 270) + coupon restored + gift reversed, one TX
DO $$
DECLARE o uuid := public.t_new_order('refund_requested'); c uuid := public.t_campaign(); e uuid; r jsonb; n int;
BEGIN
  e := public.t_coupon(o, c);
  PERFORM public.t_gift(o);
  PERFORM public.t_coin(o, 40, 270);
  r := public.gift_certificate_refund_order_atomic(o, '44444444-4444-4444-4444-444444444444');
  PERFORM public.t_assert((r->>'ok')::boolean AND r->>'idempotent' IS NULL, 'refund ok: ' || r::text);
  PERFORM public.t_assert((SELECT order_status || '/' || payment_status FROM store_orders WHERE id = o) = 'refunded/refunded', 'refunded');
  PERFORM public.t_assert((SELECT status FROM store_payments WHERE order_id = o) = 'refunded', 'payment refunded');
  SELECT count(*) INTO n FROM store_economic_point_ledger
   WHERE entry_kind = 'REVERSAL' AND idempotency_key = 'coin_reversal:order:' || o::text AND amount = -310
     AND meta->>'reason' = 'order_refund';
  PERFORM public.t_assert(n = 1, 'one REVERSAL of exactly the minted 310');
  PERFORM public.t_assert((r->'coin_reversal'->>'reversed_amount')::int = 310, 'result carries coin reversal');
  PERFORM public.t_assert((SELECT status FROM coupon_user_entitlements WHERE id = e) = 'restored', 'entitlement restored');
  PERFORM public.t_assert((SELECT redeemed_order_id FROM coupon_user_entitlements WHERE id = e) IS NULL, 'entitlement detached');
  PERFORM public.t_assert((SELECT reversed_reason FROM store_coupon_redemptions WHERE order_id = o AND reversed_at IS NOT NULL) = 'order_refund', 'redemption kept + reversed (ADS-25)');
  PERFORM public.t_assert((SELECT reserved_spend_php FROM store_coupon_campaigns WHERE id = c) = 1040, 'active campaign budget re-added');
  PERFORM public.t_assert((SELECT reversed FROM gift_certificate_redemptions WHERE order_id = o), 'gift reversed');
  RAISE NOTICE 'PASS 1 refund atomic';
END $$;

-- 2) refund with forced coupon-restore failure -> whole refund rolled back (status, Coin, gift)
DO $$
DECLARE o uuid := public.t_new_order('refund_requested'); c uuid := public.t_campaign(); e uuid; failed boolean := false;
BEGIN
  e := public.t_coupon(o, c);
  PERFORM public.t_gift(o);
  PERFORM public.t_coin(o, 40);
  INSERT INTO test_coupon_fail VALUES (o);
  BEGIN
    PERFORM public.gift_certificate_refund_order_atomic(o, NULL);
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM LIKE '%forced_coupon_restore_failure%';
  END;
  PERFORM public.t_assert(failed, 'coupon failure surfaced');
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'refund_requested', 'status rolled back');
  PERFORM public.t_assert(NOT EXISTS (SELECT 1 FROM store_economic_point_ledger WHERE idempotency_key = 'coin_reversal:order:' || o::text), 'no REVERSAL');
  PERFORM public.t_assert(NOT (SELECT reversed FROM gift_certificate_redemptions WHERE order_id = o), 'gift not reversed');
  PERFORM public.t_assert((SELECT status FROM coupon_user_entitlements WHERE id = e) = 'redeemed', 'coupon untouched');
  PERFORM public.t_assert((SELECT status FROM store_payments WHERE order_id = o) = 'succeeded', 'payment untouched');
  DELETE FROM test_coupon_fail WHERE order_id = o;
  RAISE NOTICE 'PASS 2 refund rollback on coupon failure';
END $$;

-- 3) duplicate refund call -> idempotent, no second REVERSAL / budget
DO $$
DECLARE o uuid := public.t_new_order('refund_requested'); c uuid := public.t_campaign(); r jsonb; n int;
BEGIN
  PERFORM public.t_coupon(o, c);
  PERFORM public.t_coin(o, 40);
  r := public.gift_certificate_refund_order_atomic(o, NULL);
  PERFORM public.t_assert((r->>'ok')::boolean, 'first refund');
  r := public.gift_certificate_refund_order_atomic(o, NULL);
  PERFORM public.t_assert((r->>'ok')::boolean AND (r->>'idempotent')::boolean, 'second idempotent: ' || r::text);
  SELECT count(*) INTO n FROM store_economic_point_ledger WHERE entry_kind = 'REVERSAL' AND meta->>'order_id' = o::text;
  PERFORM public.t_assert(n = 1, 'one REVERSAL');
  PERFORM public.t_assert((SELECT reserved_spend_php FROM store_coupon_campaigns WHERE id = c) = 1040, 'budget re-added once');
  RAISE NOTICE 'PASS 3 refund idempotent';
END $$;

-- 4) owner direct cancel: status + coupon + gift restore (expired flagged) + delivery row closed, one TX
DO $$
DECLARE o uuid := public.t_new_order('preparing', 'waiting_rider'); c uuid := public.t_campaign(); e uuid; g uuid; r jsonb;
BEGIN
  e := public.t_coupon(o, c);
  g := public.t_gift(o, true);
  r := public.store_order_owner_cancel_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'preparing', 'sold out', null);
  PERFORM public.t_assert((r->>'ok')::boolean AND r ? 'request_id', 'owner cancel ok: ' || r::text);
  PERFORM public.t_assert((SELECT order_status || '/' || payment_status FROM store_orders WHERE id = o) = 'cancelled/cancelled', 'cancelled');
  PERFORM public.t_assert((SELECT status FROM coupon_user_entitlements WHERE id = e) = 'restored', 'coupon restored');
  PERFORM public.t_assert((SELECT reversed_reason FROM store_coupon_redemptions WHERE order_id = o) = 'order_cancel', 'redemption reversed (cancel)');
  PERFORM public.t_assert((SELECT status || '/' || remaining_balance FROM gift_certificate_instances WHERE id = g) = 'ACTIVE/500', 'gift restored (expired kept, D-20)');
  PERFORM public.t_assert((r->'side_effects'->>'restored_expired')::boolean, 'restored_expired flagged');
  PERFORM public.t_assert((SELECT delivery_status || '/' || failure_note FROM store_order_deliveries WHERE order_id = o) = 'delivery_failed/order_cancelled', 'delivery closed');
  PERFORM public.t_assert((r->'side_effects'->>'delivery_closed')::boolean, 'result delivery_closed');
  PERFORM public.t_assert(EXISTS (SELECT 1 FROM test_commission_log WHERE order_id = o AND to_status = 'cancelled'), 'commission trigger same TX');
  RAISE NOTICE 'PASS 4 owner cancel side effects';
END $$;

-- 4b) owner cancel forced coupon failure -> status + ledger rolled back
DO $$
DECLARE o uuid := public.t_new_order('accepted'); c uuid := public.t_campaign(); failed boolean := false;
BEGIN
  PERFORM public.t_coupon(o, c);
  PERFORM public.t_gift(o);
  INSERT INTO test_coupon_fail VALUES (o);
  BEGIN
    PERFORM public.store_order_owner_cancel_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'accepted', 'x', null);
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM LIKE '%forced_coupon_restore_failure%';
  END;
  PERFORM public.t_assert(failed, 'failure surfaced');
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'accepted', 'status rolled back');
  PERFORM public.t_assert(NOT EXISTS (SELECT 1 FROM store_order_cancel_requests WHERE order_id = o), 'ledger rolled back');
  PERFORM public.t_assert(NOT (SELECT reversed FROM gift_certificate_redemptions WHERE order_id = o), 'gift not restored');
  DELETE FROM test_coupon_fail WHERE order_id = o;
  RAISE NOTICE 'PASS 4b owner cancel rollback';
END $$;

-- 4c) owner cancel after pickup -> picked_up, nothing touched (DLV-02 lock semantics kept)
DO $$
DECLARE o uuid := public.t_new_order('ready_for_pickup', 'pickup_in_progress'); c uuid := public.t_campaign(); e uuid; r jsonb;
BEGIN
  e := public.t_coupon(o, c);
  r := public.store_order_owner_cancel_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ready_for_pickup', 'x', null);
  PERFORM public.t_assert(r->>'error' = 'picked_up', 'picked_up: ' || r::text);
  PERFORM public.t_assert((SELECT status FROM coupon_user_entitlements WHERE id = e) = 'redeemed', 'coupon untouched');
  RAISE NOTICE 'PASS 4c picked_up kept';
END $$;

-- 5) cancel request decide approve -> side effects; reject -> none
DO $$
DECLARE o uuid := public.t_new_order('cancel_requested', 'rider_assigned'); o2 uuid := public.t_new_order('cancel_requested');
        c uuid := public.t_campaign(); e uuid; e2 uuid; g uuid; r jsonb;
BEGIN
  e := public.t_coupon(o, c);
  g := public.t_gift(o);
  INSERT INTO store_order_cancel_requests(order_id, previous_order_status, requested_by, requested_role, reason, status, refund_status)
  VALUES (o, 'accepted', '33333333-3333-3333-3333-333333333333', 'buyer', 'r', 'pending', 'pending');
  r := public.store_order_cancel_request_decide_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner', 'cancel_requested', 'approve', null, null, null);
  PERFORM public.t_assert((r->>'ok')::boolean AND r->>'order_status' = 'cancelled', 'approve ok: ' || r::text);
  PERFORM public.t_assert((SELECT status FROM coupon_user_entitlements WHERE id = e) = 'restored', 'coupon restored');
  PERFORM public.t_assert((SELECT status FROM gift_certificate_instances WHERE id = g) = 'ACTIVE', 'gift restored');
  PERFORM public.t_assert(NOT (r->'side_effects'->>'restored_expired')::boolean, 'not expired');
  PERFORM public.t_assert((SELECT delivery_status FROM store_order_deliveries WHERE order_id = o) = 'delivery_failed', 'delivery closed');
  PERFORM public.t_assert((SELECT status FROM store_order_cancel_requests WHERE order_id = o) = 'approved', 'ledger approved');

  e2 := public.t_coupon(o2, public.t_campaign());
  INSERT INTO store_order_cancel_requests(order_id, previous_order_status, requested_by, requested_role, reason, status, refund_status)
  VALUES (o2, 'preparing', '33333333-3333-3333-3333-333333333333', 'buyer', 'r', 'pending', 'pending');
  r := public.store_order_cancel_request_decide_atomic(o2, 'aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'admin', 'cancel_requested', 'reject', 'preparing', 'no', null);
  PERFORM public.t_assert((r->>'ok')::boolean AND r->>'order_status' = 'preparing' AND r->'side_effects' = 'null'::jsonb, 'reject ok: ' || r::text);
  PERFORM public.t_assert((SELECT status FROM coupon_user_entitlements WHERE id = e2) = 'redeemed', 'reject: coupon untouched');
  RAISE NOTICE 'PASS 5 decide approve/reject';
END $$;

-- 6) direct cancel: buyer pre-accept / SYSTEM accept_timeout / SYSTEM payment_failure / ADMIN mid-flow
DO $$
DECLARE o uuid; c uuid; e uuid; g uuid; r jsonb;
BEGIN
  -- buyer pending cancel
  o := public.t_new_order('pending'); c := public.t_campaign(); e := public.t_coupon(o, c); g := public.t_gift(o);
  r := public.store_order_cancel_direct_atomic(o, 'pending', 'cancelled', 'CUSTOMER');
  PERFORM public.t_assert((r->>'ok')::boolean AND r->>'previous_order_status' = 'pending', 'buyer cancel: ' || r::text);
  PERFORM public.t_assert((SELECT order_status || '/' || payment_status FROM store_orders WHERE id = o) = 'cancelled/cancelled', 'buyer: cancelled');
  PERFORM public.t_assert((SELECT status FROM coupon_user_entitlements WHERE id = e) = 'restored', 'buyer: coupon');
  PERFORM public.t_assert((SELECT status FROM gift_certificate_instances WHERE id = g) = 'ACTIVE', 'buyer: gift');
  -- SYSTEM accept_timeout (delivery row open)
  o := public.t_new_order('pending', 'waiting_rider'); c := public.t_campaign(); e := public.t_coupon(o, c); g := public.t_gift(o);
  r := public.store_order_cancel_direct_atomic(o, 'pending', 'cancelled', 'SYSTEM');
  PERFORM public.t_assert((r->>'ok')::boolean, 'timeout cancel');
  PERFORM public.t_assert((SELECT status FROM coupon_user_entitlements WHERE id = e) = 'restored', 'timeout: coupon');
  PERFORM public.t_assert((SELECT status FROM gift_certificate_instances WHERE id = g) = 'ACTIVE', 'timeout: gift');
  PERFORM public.t_assert((SELECT delivery_status FROM store_order_deliveries WHERE order_id = o) = 'delivery_failed', 'timeout: delivery closed');
  -- SYSTEM payment_failure keeps payment_status failed
  o := public.t_new_order('pending'); c := public.t_campaign(); e := public.t_coupon(o, c); g := public.t_gift(o);
  r := public.store_order_cancel_direct_atomic(o, 'pending', 'failed', 'SYSTEM');
  PERFORM public.t_assert((SELECT order_status || '/' || payment_status FROM store_orders WHERE id = o) = 'cancelled/failed', 'payment_failure: failed');
  PERFORM public.t_assert((SELECT status FROM coupon_user_entitlements WHERE id = e) = 'restored', 'payment_failure: coupon');
  PERFORM public.t_assert((SELECT status FROM gift_certificate_instances WHERE id = g) = 'ACTIVE', 'payment_failure: gift');
  -- ADMIN mid-flow cancel (needs_admin_attention cleared, auto_complete cleared)
  o := public.t_new_order('arrived');
  UPDATE store_orders SET needs_admin_attention = true, auto_complete_at = now() + interval '1 day' WHERE id = o;
  r := public.store_order_cancel_direct_atomic(o, 'arrived', 'cancelled', 'ADMIN');
  PERFORM public.t_assert((SELECT order_status = 'cancelled' AND NOT needs_admin_attention AND auto_complete_at IS NULL FROM store_orders WHERE id = o), 'admin cancel payload');
  -- CAS conflict / invalid args
  r := public.store_order_cancel_direct_atomic(o, 'arrived', 'cancelled', 'ADMIN');
  PERFORM public.t_assert(r->>'error' = 'transition_conflict', 'conflict: ' || r::text);
  r := public.store_order_cancel_direct_atomic(o, 'refund_requested', 'cancelled', 'ADMIN');
  PERFORM public.t_assert(r->>'error' = 'invalid_args', 'invalid expected: ' || r::text);
  r := public.store_order_cancel_direct_atomic(o, 'pending', 'refunded', 'ADMIN');
  PERFORM public.t_assert(r->>'error' = 'invalid_args', 'invalid payment: ' || r::text);
  r := public.store_order_cancel_direct_atomic(gen_random_uuid(), 'pending', 'cancelled', 'ADMIN');
  PERFORM public.t_assert(r->>'error' = 'order_not_found', 'not found');
  RAISE NOTICE 'PASS 6 direct cancels';
END $$;

-- 6b) direct cancel forced coupon failure -> status rolled back
DO $$
DECLARE o uuid := public.t_new_order('pending'); failed boolean := false;
BEGIN
  PERFORM public.t_coupon(o, public.t_campaign());
  INSERT INTO test_coupon_fail VALUES (o);
  BEGIN
    PERFORM public.store_order_cancel_direct_atomic(o, 'pending', 'cancelled', 'SYSTEM');
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM LIKE '%forced_coupon_restore_failure%';
  END;
  PERFORM public.t_assert(failed AND (SELECT order_status FROM store_orders WHERE id = o) = 'pending', 'direct cancel rolled back');
  DELETE FROM test_coupon_fail WHERE order_id = o;
  RAISE NOTICE 'PASS 6b direct cancel rollback';
END $$;

-- 7) ADS-25: history kept, same buyer reuses the restored coupon, ended campaign budget unchanged, admin page counts active only
DO $$
DECLARE o uuid := public.t_new_order('pending'); o2 uuid := public.t_new_order('pending'); c uuid := public.t_campaign(); e uuid;
        c2 uuid := public.t_campaign('ended'); o3 uuid := public.t_new_order('pending'); page jsonb;
BEGIN
  e := public.t_coupon(o, c);
  PERFORM public.store_order_cancel_direct_atomic(o, 'pending', 'cancelled', 'CUSTOMER');
  PERFORM public.t_assert((SELECT count(*) FROM store_coupon_redemptions WHERE order_id = o AND reversed_at IS NOT NULL) = 1, 'history row kept');
  -- reuse exactly as create_store_order_atomic does: INSERT redemption + UPDATE entitlement WHERE status IN (available, restored)
  INSERT INTO store_coupon_redemptions(campaign_id, store_id, buyer_user_id, order_id, discount_amount_applied, user_coupon_id)
  VALUES (c, 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', o2, 40, e);
  UPDATE coupon_user_entitlements SET status = 'redeemed', redeemed_order_id = o2 WHERE id = e AND status IN ('available', 'restored');
  PERFORM public.t_assert(FOUND, 'restored entitlement claimable');
  PERFORM public.t_assert((SELECT count(*) FROM store_coupon_redemptions WHERE campaign_id = c) = 2, 'two rows (one reversed, one active)');
  -- a second ACTIVE redemption for the same buyer+campaign is still refused
  BEGIN
    INSERT INTO store_coupon_redemptions(campaign_id, store_id, buyer_user_id, order_id, discount_amount_applied)
    VALUES (c, 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', o3, 40);
    RAISE EXCEPTION 'ASSERT FAILED: duplicate active redemption accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  page := public.admin_store_coupon_campaign_page('all', 'all', NULL, c, 20, 0);
  PERFORM public.t_assert((page->'rows'->0->>'order_count')::int = 1, 'admin page counts active redemptions only: ' || (page->'rows')::text);
  -- ended campaign: restore does not re-add budget
  PERFORM public.t_coupon(o3, c2);
  PERFORM public.store_order_cancel_direct_atomic(o3, 'pending', 'cancelled', 'CUSTOMER');
  PERFORM public.t_assert((SELECT reserved_spend_php FROM store_coupon_campaigns WHERE id = c2) = 1000, 'ended campaign budget unchanged');
  PERFORM public.t_assert((SELECT status FROM coupon_user_entitlements WHERE redeemed_order_id IS NULL AND campaign_id = c2) = 'restored', 'ended: entitlement restored');
  RAISE NOTICE 'PASS 7 ADS-25';
END $$;

-- 8) refund policy kept: first-order scope / restore_on_full_refund=false -> coupon not restored on refund (cancel still restores)
DO $$
DECLARE o uuid := public.t_new_order('refund_requested'); c uuid := public.t_campaign(); e uuid; r jsonb;
BEGIN
  UPDATE store_coupon_campaigns SET restore_on_full_refund = false WHERE id = c;
  e := public.t_coupon(o, c);
  r := public.gift_certificate_refund_order_atomic(o, NULL);
  PERFORM public.t_assert((r->>'ok')::boolean AND r->'coupon_restore'->>'reason' = 'policy_no_restore', 'policy: ' || r::text);
  PERFORM public.t_assert((SELECT status FROM coupon_user_entitlements WHERE id = e) = 'redeemed', 'not restored');
  PERFORM public.t_assert((SELECT reversed_at FROM store_coupon_redemptions WHERE order_id = o) IS NULL, 'redemption active');
  RAISE NOTICE 'PASS 8 refund coupon policy kept';
END $$;

-- 9) side effects function refuses a non-cancelled order (internal guard)
DO $$
DECLARE o uuid := public.t_new_order('preparing'); failed boolean := false;
BEGIN
  BEGIN
    PERFORM public.store_order_apply_cancel_side_effects(o);
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM LIKE 'store_order_cancel_side_effects_not_cancelled%';
  END;
  PERFORM public.t_assert(failed, 'guard');
  RAISE NOTICE 'PASS 9 side effects guard';
END $$;
