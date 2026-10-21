-- Final ND-3 connected scenario (single session). RPCs are called the way the app server calls them:
-- role service_role + request.jwt.claims {"role":"service_role"}. Fixture-only steps run as postgres (RESET ROLE).
-- Each assertion: NOTICE 'PASS <id>' or ERROR 'FAIL <id>: ...' (psql ON_ERROR_STOP -> non-zero exit).
\set S '''aaaaaaaa-0000-0000-0000-000000000001'''
\set OWNER '''11111111-1111-1111-1111-111111111111'''
\set BUYER '''33333333-3333-3333-3333-333333333333'''
SET ROLE service_role;
SET request.jwt.claims = '{"role":"service_role"}';

-- =============================================================== 1. buyer order A (local_delivery + coupon + gift)
DO $$
DECLARE r jsonb; r2 jsonb; o record; v_id uuid; bad jsonb; n_before bigint;
BEGIN
  -- failure variant first: client payment tampered -> price_changed, nothing written
  SELECT count(*) INTO n_before FROM store_orders;
  bad := t_create('nd3-A-bad', 2, 'local_delivery', true, 'ffffffff-0000-0000-0000-000000000001', p_payment_delta => -50);
  PERFORM t_ok('1.0 tampered payment refused (price_changed), no order/coupon/gift write',
    bad->>'error' = 'price_changed'
    AND (SELECT count(*) FROM store_orders) = n_before
    AND (SELECT status FROM coupon_user_entitlements WHERE id = 'dddddddd-0000-0000-0000-000000000001') = 'available'
    AND (SELECT remaining_balance FROM gift_certificate_instances WHERE id = 'ffffffff-0000-0000-0000-000000000001') = 300,
    bad::text);

  r := t_create('nd3-A', 2, 'local_delivery', true, 'ffffffff-0000-0000-0000-000000000001');
  PERFORM t_ok('1.1 create_store_order_atomic ok', (r->>'ok')::boolean AND NOT (r->>'idempotent')::boolean, r::text);
  v_id := t_set('A', (r->'order'->>'id')::uuid);
  SELECT * INTO o FROM store_orders WHERE id = v_id;
  PERFORM t_ok('1.2 order row: pending/paid local_delivery total 1000 discount 100 gift 300 payment 600 store-funded 100',
    o.order_status = 'pending' AND o.payment_status = 'paid' AND o.fulfillment_type = 'local_delivery'
    AND o.total_amount = 1000 AND o.discount_amount = 100 AND o.gift_redemption_amount = 300 AND o.payment_amount = 600
    AND o.amount_before_gift = 900 AND o.store_funded_amount = 100 AND o.platform_funded_amount = 0
    AND o.commission_base_amount = 700, row_to_json(o)::text);
  PERFORM t_ok('1.3 checkout_serviceability_* + store coords snapshot NOT NULL',
    o.checkout_serviceability_eligible IS NOT NULL AND o.checkout_serviceability_max_km IS NOT NULL
    AND o.checkout_serviceability_reason IS NOT NULL AND o.checkout_store_latitude IS NOT NULL
    AND o.checkout_store_longitude IS NOT NULL, row_to_json(o)::text);
  PERFORM t_ok('1.4 coupon claimed (entitlement redeemed -> A, 1 active redemption, budget -100)',
    (SELECT status = 'redeemed' AND redeemed_order_id = v_id FROM coupon_user_entitlements WHERE id = 'dddddddd-0000-0000-0000-000000000001')
    AND (SELECT count(*) FROM store_coupon_redemptions WHERE order_id = v_id AND reversed_at IS NULL AND discount_amount_applied = 100) = 1
    AND (SELECT reserved_spend_php FROM store_coupon_campaigns WHERE id = 'cccccccc-0000-0000-0000-000000000001') = 900);
  PERFORM t_ok('1.5 gift redeemed (instance FULLY_REDEEMED 0, redemption 300, ledger REDEEM -300, revenue REVENUE_CREATE)',
    (SELECT status = 'FULLY_REDEEMED' AND remaining_balance = 0 FROM gift_certificate_instances WHERE id = 'ffffffff-0000-0000-0000-000000000001')
    AND (SELECT count(*) FROM gift_certificate_redemptions WHERE order_id = v_id AND redeemed_amount = 300 AND NOT reversed) = 1
    AND (SELECT count(*) FROM gift_certificate_ledger l JOIN gift_certificate_redemptions g ON l.related_id = g.id::text
          WHERE g.order_id = v_id AND l.entry_type = 'REDEEM' AND l.amount = -300) = 1
    AND (SELECT count(*) FROM gift_certificate_revenue_ledger rl JOIN gift_certificate_redemptions g ON rl.redemption_id = g.id
          WHERE g.order_id = v_id AND rl.entry_type = 'REVENUE_CREATE') = 1);
  PERFORM t_ok('1.6 order_created event + 1 item row',
    (SELECT count(*) FROM store_order_events WHERE order_id = v_id AND event_type = 'order_created') = 1
    AND (SELECT count(*) FROM store_order_items WHERE order_id = v_id AND qty = 2 AND subtotal = 1000) = 1);
  -- duplicate variant: same client_order_key -> idempotent, same order, no second row
  r2 := t_create('nd3-A', 2, 'local_delivery', true, 'ffffffff-0000-0000-0000-000000000001');
  PERFORM t_ok('1.7 duplicate client_order_key -> idempotent same order, still 1 row',
    (r2->>'idempotent')::boolean AND (r2->'order'->>'id')::uuid = v_id
    AND (SELECT count(*) FROM store_orders WHERE client_order_key = 'nd3-A') = 1, r2::text);
END $$;

-- =============================================================== 2. owner rejects A at pending (with reason)
DO $$
DECLARE v_id uuid := t_id('A'); r jsonb; r2 jsonb; bad1 jsonb; bad2 jsonb;
BEGIN
  bad1 := store_order_owner_cancel_atomic(v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'pending', 'x', null);
  bad2 := store_order_owner_cancel_atomic(v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'pending', '   ', null);
  PERFORM t_ok('2.0 wrong owner -> forbidden, blank reason -> invalid_args, no writes',
    bad1->>'error' = 'forbidden' AND bad2->>'error' = 'invalid_args'
    AND (SELECT order_status FROM store_orders WHERE id = v_id) = 'pending'
    AND (SELECT count(*) FROM store_order_cancel_requests WHERE order_id = v_id) = 0, bad1::text || bad2::text);

  r := store_order_owner_cancel_atomic(v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
                                       'pending', '재료 소진', '오늘 마감');
  PERFORM t_ok('2.1 owner reject ok -> order cancelled/payment cancelled',
    (r->>'ok')::boolean AND (SELECT order_status = 'cancelled' AND payment_status = 'cancelled' FROM store_orders WHERE id = v_id), r::text);
  PERFORM t_ok('2.2 store_order_cancel_requests: 1 row, same reason, owner/approved/not_applicable, previous pending',
    (SELECT count(*) FROM store_order_cancel_requests WHERE order_id = v_id) = 1
    AND (SELECT reason = '재료 소진' AND detail_reason = '오늘 마감' AND requested_role = 'owner' AND status = 'approved'
            AND refund_status = 'not_applicable' AND previous_order_status = 'pending' AND id = (r->>'request_id')::uuid
           FROM store_order_cancel_requests WHERE order_id = v_id));
  PERFORM t_ok('2.3 coupon restored: entitlement restored, redemption kept with reversed_at (not deleted), budget back',
    (SELECT status = 'restored' AND redeemed_order_id IS NULL FROM coupon_user_entitlements WHERE id = 'dddddddd-0000-0000-0000-000000000001')
    AND (SELECT count(*) FROM store_coupon_redemptions WHERE order_id = v_id AND reversed_at IS NOT NULL AND reversed_reason = 'order_cancel') = 1
    AND (SELECT reserved_spend_php FROM store_coupon_campaigns WHERE id = 'cccccccc-0000-0000-0000-000000000001') = 1000);
  PERFORM t_ok('2.4 gift restored: instance ACTIVE 300, redemption reversed, REDEEM_REVERSE +300, order gift amount 0',
    (SELECT status = 'ACTIVE' AND remaining_balance = 300 FROM gift_certificate_instances WHERE id = 'ffffffff-0000-0000-0000-000000000001')
    AND (SELECT count(*) FROM gift_certificate_redemptions WHERE order_id = v_id AND reversed AND reversed_at IS NOT NULL) = 1
    AND (SELECT count(*) FROM gift_certificate_ledger l JOIN gift_certificate_redemptions g ON l.related_id = g.id::text
          WHERE g.order_id = v_id AND l.entry_type = 'REDEEM_REVERSE' AND l.amount = 300) = 1
    AND (SELECT gift_redemption_amount FROM store_orders WHERE id = v_id) = 0);
  PERFORM t_ok('2.5 no fee obligation / no Cash debit for a pending reject',
    (SELECT count(*) FROM store_sale_fee_obligations WHERE order_id = v_id) = 0
    AND (SELECT count(*) FROM business_cash_ledger WHERE related_id = v_id::text) = 0);

  r2 := store_order_owner_cancel_atomic(v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
                                        'pending', '재료 소진', null);
  PERFORM t_ok('2.6 duplicate reject -> transition_conflict; still 1 cancel row, 1 coupon reversal, 1 gift reverse',
    r2->>'error' = 'transition_conflict'
    AND (SELECT count(*) FROM store_order_cancel_requests WHERE order_id = v_id) = 1
    AND (SELECT count(*) FROM store_coupon_redemptions WHERE order_id = v_id) = 1
    AND (SELECT count(*) FROM gift_certificate_ledger l JOIN gift_certificate_redemptions g ON l.related_id = g.id::text
          WHERE g.order_id = v_id AND l.entry_type = 'REDEEM_REVERSE') = 1
    AND (SELECT status FROM coupon_user_entitlements WHERE id = 'dddddddd-0000-0000-0000-000000000001') = 'restored', r2::text);
END $$;

-- =============================================================== 3. order B: accept -> preparing (after cutoff) = 7% fee once
DO $$
DECLARE r jsonb; v_id uuid; ob record; led record;
BEGIN
  r := t_create('nd3-B', 2, 'local_delivery', false, null);
  v_id := t_set('B', (r->'order'->>'id')::uuid);
  UPDATE store_orders SET order_status = 'accepted', accepted_at = now() WHERE id = v_id AND order_status = 'pending';
  PERFORM t_ok('3.0 accepted -> no obligation yet', (SELECT count(*) FROM store_sale_fee_obligations WHERE order_id = v_id) = 0);
  UPDATE store_orders SET order_status = 'preparing' WHERE id = v_id AND order_status = 'accepted';
  PERFORM t_ok('3.1 created_at >= 2026-10-20 20:30 UTC', (SELECT created_at >= '2026-10-20 20:30:00+00' FROM store_orders WHERE id = v_id));
  SELECT * INTO ob FROM store_sale_fee_obligations WHERE order_id = v_id;
  PERFORM t_ok('3.2 exactly 1 obligation = 7% of 1000 PHP (policy 식당 a6cd6c19) = 7000 minor, stage preparing',
    (SELECT count(*) FROM store_sale_fee_obligations WHERE order_id = v_id) = 1
    AND ob.fee_due_minor = 7000 AND ob.confirmed_revenue_php = 1000 AND ob.charge_stage = 'preparing'
    AND ob.fee_snapshot->>'policy_id' = 'a6cd6c19-9d56-403b-8f4f-5728ad2a89bf' AND (ob.fee_snapshot->>'fee_percent')::numeric = 7
    AND ob.idempotency_key = 'sale_fee:order:' || v_id::text, row_to_json(ob)::text);
  SELECT * INTO led FROM business_cash_ledger WHERE related_id = v_id::text;
  PERFORM t_ok('3.3 Cash debit 5000 (all available) + outstanding 2000, account 0, obligation open',
    ob.fee_paid_minor = 5000 AND ob.fee_outstanding_minor = 2000 AND ob.status = 'open'
    AND led.entry_kind = 'SALE_FEE' AND led.direction = 'debit' AND led.amount_minor = 5000 AND led.balance_after_minor = 0
    AND (SELECT balance_minor FROM business_cash_accounts WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
    row_to_json(led)::text);
END $$;

-- B': created before the cutoff -> preparing charges nothing (backdating is a fixture-only step, as postgres)
SET ROLE service_role;
DO $$ DECLARE r jsonb; BEGIN
  r := t_create('nd3-Bp', 1, 'pickup', false, null);
  PERFORM t_set('Bp', (r->'order'->>'id')::uuid);
END $$;
RESET ROLE;
UPDATE store_orders SET created_at = '2026-10-20 20:29:59+00' WHERE id = t_id('Bp');
SET ROLE service_role;
DO $$
DECLARE v_id uuid := t_id('Bp');
BEGIN
  UPDATE store_orders SET order_status = 'accepted' WHERE id = v_id;
  UPDATE store_orders SET order_status = 'preparing' WHERE id = v_id;
  UPDATE store_orders SET order_status = 'ready_for_pickup' WHERE id = v_id;
  PERFORM t_ok('3.4 B'' created 20:29:59 UTC -> preparing/ready: 0 obligation rows, 0 Cash rows',
    (SELECT order_status FROM store_orders WHERE id = v_id) = 'ready_for_pickup'
    AND (SELECT count(*) FROM store_sale_fee_obligations WHERE order_id = v_id) = 0
    AND (SELECT count(*) FROM business_cash_ledger WHERE related_id = v_id::text) = 0);
END $$;

-- =============================================================== 4. delivery status walk on B (+ CHECK, failure_reason)
DO $$
DECLARE v_id uuid := t_id('B'); st text; e text;
BEGIN
  INSERT INTO store_order_deliveries (order_id, store_id, buyer_user_id) VALUES
    (v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333');
  UPDATE store_order_deliveries SET delivery_status = 'rider_assigned', assigned_at = now() WHERE order_id = v_id;
  UPDATE store_orders SET order_status = 'ready_for_pickup' WHERE id = v_id;
  UPDATE store_order_deliveries SET delivery_status = 'pickup_in_progress', picked_up_at = now() WHERE order_id = v_id;
  UPDATE store_orders SET order_status = 'delivering' WHERE id = v_id;
  UPDATE store_order_deliveries SET delivery_status = 'delivering' WHERE order_id = v_id;
  UPDATE store_order_deliveries SET delivery_status = 'delivered', delivered_at = now() WHERE order_id = v_id;
  UPDATE store_orders SET order_status = 'arrived' WHERE id = v_id;
  UPDATE store_orders SET order_status = 'completed' WHERE id = v_id;
  SELECT delivery_status INTO st FROM store_order_deliveries WHERE order_id = v_id;
  PERFORM t_ok('4.1 waiting_rider->rider_assigned->pickup_in_progress->delivering->delivered, order completed',
    st = 'delivered' AND (SELECT order_status FROM store_orders WHERE id = v_id) = 'completed', st);
  PERFORM t_ok('4.2 status walk ready->delivering->arrived->completed keeps exactly 1 obligation (idempotent)',
    (SELECT count(*) FROM store_sale_fee_obligations WHERE order_id = v_id) = 1
    AND (SELECT count(*) FROM business_cash_ledger WHERE related_id = v_id::text) = 1);

  BEGIN
    UPDATE store_order_deliveries SET delivery_status = 'lost' WHERE order_id = v_id;
    e := 'accepted';
  EXCEPTION WHEN check_violation THEN e := SQLERRM;
  END;
  PERFORM t_ok('4.3 invalid status UPDATE rejected by store_order_deliveries_status_check',
    e LIKE '%store_order_deliveries_status_check%', e);
  BEGIN
    INSERT INTO store_order_deliveries (order_id, store_id, buyer_user_id, delivery_status) VALUES
      (t_id('Bp'), 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'teleported');
    e := 'accepted';
  EXCEPTION WHEN check_violation THEN e := SQLERRM;
  END;
  PERFORM t_ok('4.4 invalid status INSERT rejected by store_order_deliveries_status_check',
    e LIKE '%store_order_deliveries_status_check%', e);
END $$;

DO $$
DECLARE r jsonb; v_id uuid; d record;
BEGIN
  r := t_create('nd3-D', 1, 'local_delivery', false, null);
  v_id := t_set('D', (r->'order'->>'id')::uuid);
  UPDATE store_orders SET order_status = 'accepted' WHERE id = v_id;
  INSERT INTO store_order_deliveries (order_id, store_id, buyer_user_id) VALUES
    (v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333');
  UPDATE store_order_deliveries
     SET delivery_status = 'delivery_failed', failure_reason = 'customer_unreachable', failure_note = 'no answer', failed_at = now()
   WHERE order_id = v_id;
  SELECT * INTO d FROM store_order_deliveries WHERE order_id = v_id;
  PERFORM t_ok('4.5 delivery_failed + failure_reason stored',
    d.delivery_status = 'delivery_failed' AND d.failure_reason = 'customer_unreachable' AND d.failed_at IS NOT NULL, row_to_json(d)::text);
END $$;

-- =============================================================== 5. owner cancel after pickup -> picked_up, no writes
DO $$
DECLARE r jsonb; v_id uuid; c jsonb; before_o text; before_d text;
BEGIN
  r := t_create('nd3-E', 1, 'local_delivery', false, null);
  v_id := t_set('E', (r->'order'->>'id')::uuid);
  UPDATE store_orders SET order_status = 'accepted' WHERE id = v_id;
  UPDATE store_orders SET order_status = 'preparing' WHERE id = v_id;
  UPDATE store_orders SET order_status = 'ready_for_pickup' WHERE id = v_id;
  INSERT INTO store_order_deliveries (order_id, store_id, buyer_user_id, delivery_status) VALUES
    (v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'rider_assigned');
  UPDATE store_order_deliveries SET delivery_status = 'pickup_in_progress', picked_up_at = now() WHERE order_id = v_id;
  SELECT row_to_json(o)::text INTO before_o FROM store_orders o WHERE id = v_id;
  SELECT row_to_json(d)::text INTO before_d FROM store_order_deliveries d WHERE order_id = v_id;
  c := store_order_owner_cancel_atomic(v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
                                       'ready_for_pickup', '늦음', null);
  PERFORM t_ok('5.1 owner cancel after pickup -> picked_up; order/delivery/ledger/obligation untouched',
    c->>'error' = 'picked_up' AND c->>'delivery_status' = 'pickup_in_progress'
    AND (SELECT row_to_json(o)::text FROM store_orders o WHERE id = v_id) = before_o
    AND (SELECT row_to_json(d)::text FROM store_order_deliveries d WHERE order_id = v_id) = before_d
    AND (SELECT count(*) FROM store_order_cancel_requests WHERE order_id = v_id) = 0
    AND (SELECT adjustment_status FROM store_sale_fee_obligations WHERE order_id = v_id) = 'none', c::text);
END $$;

-- =============================================================== 6. buyer cancel request -> decide approve / reject
DO $$
DECLARE r jsonb; v_id uuid; q jsonb; d jsonb; cr record;
BEGIN
  r := t_create('nd3-C', 1, 'local_delivery', false, null);
  v_id := t_set('C', (r->'order'->>'id')::uuid);
  UPDATE store_orders SET order_status = 'accepted' WHERE id = v_id;
  INSERT INTO store_order_deliveries (order_id, store_id, buyer_user_id) VALUES
    (v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333');
  q := store_order_buyer_cancel_request_atomic(v_id, '33333333-3333-3333-3333-333333333333', 'accepted', '주소 변경');
  PERFORM t_ok('6.1 buyer cancel request -> cancel_requested + 1 pending request (previous accepted)',
    (q->>'ok')::boolean AND (SELECT order_status FROM store_orders WHERE id = v_id) = 'cancel_requested'
    AND (SELECT count(*) FROM store_order_cancel_requests WHERE order_id = v_id AND status = 'pending' AND previous_order_status = 'accepted') = 1,
    q::text);
  PERFORM t_ok('6.2 duplicate buyer request -> transition_conflict, still 1 request',
    (store_order_buyer_cancel_request_atomic(v_id, '33333333-3333-3333-3333-333333333333', 'accepted', '주소 변경'))->>'error' = 'transition_conflict'
    AND (SELECT count(*) FROM store_order_cancel_requests WHERE order_id = v_id) = 1);
  d := store_order_cancel_request_decide_atomic(v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
                                                'owner', 'cancel_requested', 'approve', null, null, null);
  SELECT * INTO cr FROM store_order_cancel_requests WHERE order_id = v_id;
  PERFORM t_ok('6.3 approve -> order cancelled, request approved/refund pending, open delivery closed (delivery_failed)',
    (d->>'ok')::boolean AND (SELECT order_status = 'cancelled' AND payment_status = 'cancelled' FROM store_orders WHERE id = v_id)
    AND cr.status = 'approved' AND cr.approved_by = '11111111-1111-1111-1111-111111111111' AND cr.refund_status = 'pending'
    AND (SELECT delivery_status = 'delivery_failed' AND failure_note = 'order_cancelled' FROM store_order_deliveries WHERE order_id = v_id),
    d::text);
  PERFORM t_ok('6.4 approve re-run -> transition_conflict, no second ledger change',
    (store_order_cancel_request_decide_atomic(v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
       'owner', 'cancel_requested', 'approve', null, null, null))->>'error' = 'transition_conflict'
    AND (SELECT count(*) FROM store_order_cancel_requests WHERE order_id = v_id) = 1);
END $$;

DO $$
DECLARE r jsonb; v_id uuid; d jsonb; d0 jsonb; cr record;
BEGIN
  r := t_create('nd3-C2', 1, 'pickup', false, null);
  v_id := t_set('C2', (r->'order'->>'id')::uuid);
  UPDATE store_orders SET order_status = 'accepted' WHERE id = v_id;
  UPDATE store_orders SET order_status = 'preparing' WHERE id = v_id;
  PERFORM store_order_buyer_cancel_request_atomic(v_id, '33333333-3333-3333-3333-333333333333', 'preparing', '너무 늦음');
  d0 := store_order_cancel_request_decide_atomic(v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
                                                 'owner', 'cancel_requested', 'reject', 'preparing', '  ', null);
  d := store_order_cancel_request_decide_atomic(v_id, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
                                                'owner', 'cancel_requested', 'reject', 'preparing', '이미 조리 중', null);
  SELECT * INTO cr FROM store_order_cancel_requests WHERE order_id = v_id;
  PERFORM t_ok('6.5 reject without reason -> reason_required; reject with reason -> previous status preparing restored',
    d0->>'error' = 'reason_required' AND (d->>'ok')::boolean
    AND (SELECT order_status FROM store_orders WHERE id = v_id) = 'preparing'
    AND cr.status = 'rejected' AND cr.rejected_reason = '이미 조리 중' AND cr.refund_status = 'not_applicable', d::text);
  PERFORM t_ok('6.6 restore to preparing re-fires commission trigger idempotently: still exactly 1 obligation',
    (SELECT count(*) FROM store_sale_fee_obligations WHERE order_id = v_id) = 1);
END $$;

-- =============================================================== 7. refund of a completed order with Coin credit
DO $$
DECLARE r jsonb; v_id uuid;
BEGIN
  r := t_create('nd3-F', 1, 'pickup', false, null);
  v_id := t_set('F', (r->'order'->>'id')::uuid);
  UPDATE store_orders SET order_status = 'accepted' WHERE id = v_id;
  UPDATE store_orders SET order_status = 'preparing' WHERE id = v_id;
  UPDATE store_orders SET order_status = 'ready_for_pickup' WHERE id = v_id;
  UPDATE store_orders SET order_status = 'completed' WHERE id = v_id;
  INSERT INTO store_payments (order_id, amount, status) VALUES (v_id, 500, 'succeeded');
END $$;
-- Coin credit for F: the SALE_EARN mint (settlement/sale-coin path) is outside this suite; the credit row is seeded as
-- postgres in the production ledger shape (entry_kind SALE_EARN, meta.order_id) - see NOT_PROVEN 7.0.
RESET ROLE;
INSERT INTO store_economic_point_accounts (store_id, balance) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 70);
INSERT INTO store_economic_point_ledger (store_id, entry_kind, amount, balance_after, related_type, related_id, idempotency_key, meta)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'SALE_EARN', 70, 70, 'store_order', t_id('F')::text,
        'sale_earn:order:' || t_id('F')::text, jsonb_build_object('order_id', t_id('F')));
SET ROLE service_role;
DO $$ BEGIN RAISE NOTICE 'NOT_PROVEN 7.0: Coin SALE_EARN credit producer not reproduced (credit row seeded in prod ledger shape); reversal path below is prod code'; END $$;
DO $$
DECLARE v_id uuid := t_id('F'); r jsonb; r2 jsonb; r3 jsonb; r4 jsonb; ob record;
BEGIN
  UPDATE store_orders SET order_status = 'refund_requested' WHERE id = v_id AND order_status = 'completed';
  r := gift_certificate_refund_order_atomic(v_id, '11111111-1111-1111-1111-111111111111');
  PERFORM t_ok('7.1 refund ok -> order refunded/payment refunded, store_payments refunded',
    (r->>'ok')::boolean AND (SELECT order_status = 'refunded' AND payment_status = 'refunded' AND refunded_at IS NOT NULL FROM store_orders WHERE id = v_id)
    AND (SELECT status FROM store_payments WHERE order_id = v_id) = 'refunded', r::text);
  PERFORM t_ok('7.2 Coin reversal exactly once: 1 REVERSAL -70 with key coin_reversal:order:<id>, account 70 -> 0',
    (SELECT count(*) FROM store_economic_point_ledger WHERE entry_kind = 'REVERSAL' AND meta->>'order_id' = v_id::text) = 1
    AND (SELECT amount = -70 AND balance_after = 0 FROM store_economic_point_ledger WHERE idempotency_key = 'coin_reversal:order:' || v_id::text)
    AND (SELECT balance FROM store_economic_point_accounts WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0);
  SELECT * INTO ob FROM store_sale_fee_obligations WHERE order_id = v_id;
  PERFORM t_ok('7.3 refunded -> fee obligation flagged review_required/refunded (amount untouched) + 1 admin outbox row',
    ob.adjustment_status = 'review_required' AND ob.adjustment_trigger = 'refunded' AND ob.fee_due_minor = 3500
    AND (SELECT count(*) FROM admin_notification_outbox WHERE source_key = 'settlement_review:' || ob.id::text) = 1,
    row_to_json(ob)::text);
  r2 := gift_certificate_refund_order_atomic(v_id, '11111111-1111-1111-1111-111111111111');
  r3 := reverse_coin_credits_for_order(v_id, 'coin_reversal:order:' || v_id::text, 'order_refund');
  r4 := reverse_coin_credits_for_order(v_id, 'coin_reversal:order:' || v_id::text || ':retry', 'order_refund');
  PERFORM t_ok('7.4 re-run refund -> idempotent; same key -> idempotent; new key -> skipped; still 1 REVERSAL row',
    (r2->>'idempotent')::boolean AND (r3->>'idempotent')::boolean AND (r4->>'skipped')::boolean
    AND (SELECT count(*) FROM store_economic_point_ledger WHERE entry_kind = 'REVERSAL' AND meta->>'order_id' = v_id::text) = 1
    AND (SELECT balance FROM store_economic_point_accounts WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
    r2::text || r3::text || r4::text);
END $$;

-- =============================================================== 8. permissions (client roles, prod grants/RLS/triggers)
RESET ROLE;
DO $$
DECLARE
  b uuid := '33333333-3333-3333-3333-333333333333';
  ow uuid := '11111111-1111-1111-1111-111111111111';
  oid_b text := quote_literal(t_id('B'));
  oid_c2 text := quote_literal(t_id('C2'));
  res text;
  fn text;
BEGIN
  res := t_try('authenticated', b, 'INSERT INTO store_orders (order_no, buyer_user_id, store_id) VALUES (''HACK1'', ''' || b || ''', ''aaaaaaaa-0000-0000-0000-000000000001'')');
  PERFORM t_ok('8.1 authenticated buyer INSERT store_orders -> 42501 (RLS)', res LIKE '42501:%row-level security%', res);
  res := t_try('anon', NULL, 'INSERT INTO store_orders (order_no, buyer_user_id, store_id) VALUES (''HACK2'', ''' || b || ''', ''aaaaaaaa-0000-0000-0000-000000000001'')');
  PERFORM t_ok('8.2 anon INSERT store_orders -> 42501 (RLS)', res LIKE '42501:%row-level security%', res);
  res := t_try('authenticated', b, 'UPDATE store_orders SET order_status = ''cancelled'' WHERE id = ' || oid_c2);
  PERFORM t_ok('8.3 authenticated buyer UPDATE own store_orders -> 0 rows (no UPDATE policy)', res = 'rows=0', res);
  res := t_try('authenticated', ow, 'UPDATE store_orders SET order_status = ''completed'' WHERE id = ' || oid_c2);
  PERFORM t_ok('8.4 authenticated owner UPDATE store_orders -> 0 rows', res = 'rows=0', res);
  res := t_try('authenticated', ow, 'INSERT INTO store_order_deliveries (order_id, store_id, buyer_user_id) VALUES (' || oid_c2 || ', ''aaaaaaaa-0000-0000-0000-000000000001'', ''' || b || ''')');
  PERFORM t_ok('8.5 authenticated owner INSERT store_order_deliveries -> 42501 (admin-only policy)', res LIKE '42501:%row-level security%', res);
  res := t_try('authenticated', ow, 'UPDATE store_order_deliveries SET delivery_status = ''delivered'' WHERE order_id = ' || oid_b);
  PERFORM t_ok('8.6 authenticated owner UPDATE store_order_deliveries -> 0 rows', res = 'rows=0', res);
  res := t_try('authenticated', b, 'UPDATE store_order_deliveries SET delivery_status = ''delivered'' WHERE order_id = ' || oid_b);
  PERFORM t_ok('8.7 authenticated buyer UPDATE store_order_deliveries -> 0 rows', res = 'rows=0', res);
  res := t_try('authenticated', ow, 'INSERT INTO business_cash_ledger (store_id, entry_kind, direction, amount_minor, balance_after_minor, idempotency_key) VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''TOP_UP'', ''credit'', 999999, 999999, ''hack'')');
  PERFORM t_ok('8.8 authenticated owner INSERT business_cash_ledger -> 42501 permission denied', res LIKE '42501:permission denied%', res);
  res := t_try('authenticated', ow, 'UPDATE business_cash_accounts SET balance_minor = 999999');
  PERFORM t_ok('8.9 authenticated owner UPDATE business_cash_accounts -> 42501 permission denied', res LIKE '42501:permission denied%', res);
  res := t_try('authenticated', ow, 'INSERT INTO store_sale_fee_obligations (store_id, order_id, confirmed_revenue_php, fee_due_minor, fee_outstanding_minor, idempotency_key) VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ' || oid_c2 || ', 0, 0, 0, ''hack'')');
  PERFORM t_ok('8.10 authenticated owner INSERT store_sale_fee_obligations -> 42501 permission denied', res LIKE '42501:permission denied%', res);
  res := t_try('authenticated', ow, 'UPDATE store_sale_fee_obligations SET fee_outstanding_minor = 0, fee_paid_minor = fee_due_minor');
  PERFORM t_ok('8.11 authenticated owner UPDATE store_sale_fee_obligations -> 42501 permission denied', res LIKE '42501:permission denied%', res);
  res := t_try('authenticated', ow, 'INSERT INTO store_economic_point_ledger (store_id, entry_kind, amount, balance_after, idempotency_key) VALUES (''aaaaaaaa-0000-0000-0000-000000000001'', ''SALE_EARN'', 999, 999, ''hack'')');
  PERFORM t_ok('8.12 authenticated owner INSERT store_economic_point_ledger -> 42501 permission denied', res LIKE '42501:permission denied%', res);
  res := t_try('authenticated', b, 'INSERT INTO store_order_cancel_requests (order_id, requested_role, reason) VALUES (' || oid_c2 || ', ''buyer'', ''x'')');
  PERFORM t_ok('8.13 authenticated buyer INSERT store_order_cancel_requests -> 42501 (RLS, no policy)', res LIKE '42501:%row-level security%', res);
  res := t_try('authenticated', b, 'UPDATE coupon_user_entitlements SET status = ''available'' WHERE buyer_user_id = ''' || b || '''');
  PERFORM t_ok('8.14 authenticated buyer UPDATE own coupon_user_entitlements -> 0 rows (SELECT-only policy)', res = 'rows=0', res);
  res := t_try('authenticated', b, 'UPDATE gift_certificate_instances SET remaining_balance = 300 WHERE current_owner_user_id = ''' || b || '''');
  PERFORM t_ok('8.15 authenticated buyer UPDATE own gift_certificate_instances -> 0 rows (SELECT-only policy)', res = 'rows=0', res);

  FOREACH fn IN ARRAY ARRAY[
    'create_store_order_atomic(''' || b || ''', ''aaaaaaaa-0000-0000-0000-000000000001'', ''k'', ''{}''::jsonb, ''[]''::jsonb)',
    'store_order_owner_cancel_atomic(' || oid_c2 || ', ''aaaaaaaa-0000-0000-0000-000000000001'', ''' || ow || ''', ''preparing'', ''x'', null)',
    'store_order_cancel_direct_atomic(' || oid_c2 || ', ''preparing'', ''cancelled'', ''OWNER'')',
    'store_order_cancel_request_decide_atomic(' || oid_c2 || ', ''aaaaaaaa-0000-0000-0000-000000000001'', ''' || ow || ''', ''owner'', ''cancel_requested'', ''approve'', null, null, null)',
    'store_order_buyer_cancel_request_atomic(' || oid_c2 || ', ''' || b || ''', ''preparing'', ''x'')',
    'store_order_apply_cancel_side_effects(' || oid_c2 || ')',
    'restore_store_coupon_entitlement(' || oid_c2 || ', true)',
    'gift_certificate_cancel_order_restore(' || oid_c2 || ')',
    'gift_certificate_refund_order_atomic(' || oid_c2 || ', null)',
    'reverse_coin_credits_for_order(' || oid_c2 || ', ''k'', ''x'')',
    'store_commission_charge_order_internal(' || oid_c2 || ', ''preparing'')']
  LOOP
    res := t_try('authenticated', ow, 'SELECT public.' || fn);
    PERFORM t_ok('8.16 authenticated EXECUTE ' || split_part(fn, '(', 1) || ' -> 42501', res LIKE '42501:permission denied for function%', res);
    res := t_try('anon', NULL, 'SELECT public.' || fn);
    PERFORM t_ok('8.17 anon EXECUTE ' || split_part(fn, '(', 1) || ' -> 42501', res LIKE '42501:permission denied for function%', res);
  END LOOP;

  -- service_role connection whose JWT role claim is not service_role -> RPC guard refuses (no writes)
  res := t_try('service_role', ow, 'SELECT 1 WHERE (public.store_order_owner_cancel_atomic(' || oid_c2 || ', ''aaaaaaaa-0000-0000-0000-000000000001'', ''' || ow || ''', ''preparing'', ''x'', null))->>''error'' = ''forbidden''', 'authenticated');
  PERFORM t_ok('8.18 owner cancel with non-service_role JWT claim -> forbidden', res = 'rows=1', res);
  PERFORM t_ok('8.19 after all client attempts: C2 still preparing, no extra cancel rows, ledgers unchanged',
    (SELECT order_status FROM store_orders WHERE id = t_id('C2')) = 'preparing'
    AND (SELECT count(*) FROM store_order_cancel_requests WHERE order_id = t_id('C2')) = 1
    AND (SELECT count(*) FROM business_cash_ledger) = 1
    AND (SELECT count(*) FROM store_orders WHERE order_no LIKE 'HACK%') = 0);
END $$;

-- =============================================================== 9. suspended store refuses new orders
UPDATE stores SET approval_status = 'suspended', suspended_reason = 'nd3 test' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SET ROLE service_role;
DO $$
DECLARE r jsonb; n bigint;
BEGIN
  SELECT count(*) INTO n FROM store_orders;
  r := t_create('nd3-G', 1, 'pickup', false, null);
  PERFORM t_ok('9.1 suspended store -> create_store_order_atomic store_unavailable, no order row',
    r->>'error' = 'store_unavailable' AND NOT (r->>'ok')::boolean AND (SELECT count(*) FROM store_orders) = n, r::text);
END $$;
RESET ROLE;
UPDATE stores SET approval_status = 'approved', suspended_reason = NULL WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
