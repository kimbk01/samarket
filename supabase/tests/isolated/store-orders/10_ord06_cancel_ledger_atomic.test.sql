-- ORD-06 assertions (store_order_owner_cancel_atomic / store_order_cancel_request_decide_atomic).
-- Requires 00_fixture.sql + supabase/migrations/20270602120000_store_order_cancel_ledger_atomic.sql loaded.
-- Run with psql -v ON_ERROR_STOP=1 (each DO block RAISEs on a failed assertion).

\set owner  '''11111111-1111-1111-1111-111111111111'''
\set other  '''22222222-2222-2222-2222-222222222222'''
\set buyer  '''33333333-3333-3333-3333-333333333333'''
\set admin  '''44444444-4444-4444-4444-444444444444'''
\set store  '''aaaaaaaa-0000-0000-0000-000000000001'''

INSERT INTO public.stores(id, owner_user_id) VALUES (:store, :owner);

CREATE OR REPLACE FUNCTION public.t_new_order(p_status text, p_fulfillment text DEFAULT 'local_delivery')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.store_orders(order_no, buyer_user_id, store_id, payment_status, order_status, fulfillment_type)
  VALUES ('T-' || substr(md5(random()::text), 1, 8), '33333333-3333-3333-3333-333333333333',
          'aaaaaaaa-0000-0000-0000-000000000001', 'paid', p_status, p_fulfillment)
  RETURNING id INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.t_assert(p_cond boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT FAILED: %', p_msg; END IF;
END $$;

-- 0) permissions: only service_role may EXECUTE; non-service JWT role is refused inside too
DO $$
BEGIN
  PERFORM public.t_assert(NOT has_function_privilege('anon', 'public.store_order_owner_cancel_atomic(uuid,uuid,uuid,text,text,text)', 'EXECUTE'), 'anon has no EXECUTE (owner cancel)');
  PERFORM public.t_assert(NOT has_function_privilege('authenticated', 'public.store_order_owner_cancel_atomic(uuid,uuid,uuid,text,text,text)', 'EXECUTE'), 'authenticated has no EXECUTE (owner cancel)');
  PERFORM public.t_assert(has_function_privilege('service_role', 'public.store_order_owner_cancel_atomic(uuid,uuid,uuid,text,text,text)', 'EXECUTE'), 'service_role EXECUTE (owner cancel)');
  PERFORM public.t_assert(NOT has_function_privilege('authenticated', 'public.store_order_cancel_request_decide_atomic(uuid,uuid,uuid,text,text,text,text,text,timestamptz)', 'EXECUTE'), 'authenticated has no EXECUTE (decide)');
  PERFORM public.t_assert(has_function_privilege('service_role', 'public.store_order_cancel_request_decide_atomic(uuid,uuid,uuid,text,text,text,text,text,timestamptz)', 'EXECUTE'), 'service_role EXECUTE (decide)');
  RAISE NOTICE 'PASS 0 permissions';
END $$;

SET test.jwt_role = 'authenticated';
DO $$
DECLARE o uuid := public.t_new_order('preparing'); r jsonb;
BEGIN
  r := public.store_order_owner_cancel_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'preparing', 'x', null);
  PERFORM public.t_assert(r->>'error' = 'forbidden', 'non service jwt -> forbidden: ' || r::text);
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'preparing', 'unchanged');
  RAISE NOTICE 'PASS 0b jwt role gate';
END $$;
SET test.jwt_role = 'service_role';

-- 1) normal owner direct cancel: ledger 1 row approved + status cancelled + commission trigger fired in same TX
DO $$
DECLARE o uuid := public.t_new_order('preparing'); r jsonb; n int;
BEGIN
  r := public.store_order_owner_cancel_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'preparing', '  재료 소진  ', 'detail');
  PERFORM public.t_assert((r->>'ok')::boolean, 'owner cancel ok: ' || r::text);
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'cancelled', 'order cancelled');
  PERFORM public.t_assert((SELECT payment_status FROM store_orders WHERE id = o) = 'cancelled', 'payment cancelled');
  SELECT count(*) INTO n FROM store_order_cancel_requests
   WHERE order_id = o AND status = 'approved' AND requested_role = 'owner' AND previous_order_status = 'preparing'
     AND reason = '재료 소진' AND detail_reason = 'detail' AND refund_status = 'not_applicable'
     AND approved_by = '11111111-1111-1111-1111-111111111111';
  PERFORM public.t_assert(n = 1, 'one approved owner ledger row');
  PERFORM public.t_assert(EXISTS (SELECT 1 FROM test_commission_log WHERE order_id = o AND from_status = 'preparing' AND to_status = 'cancelled'), 'commission trigger fired');
  RAISE NOTICE 'PASS 1 owner cancel normal';
END $$;

-- 2) ledger write failure rolls back the status change (function raises -> whole statement rolled back)
DO $$
DECLARE o uuid := public.t_new_order('accepted'); r jsonb; failed boolean := false;
BEGIN
  BEGIN
    r := public.store_order_owner_cancel_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'accepted', 'FORCE_LEDGER_FAIL', null);
  EXCEPTION WHEN OTHERS THEN
    failed := SQLERRM LIKE '%forced_ledger_failure%';
  END;
  PERFORM public.t_assert(failed, 'ledger failure surfaced as error');
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'accepted', 'status rolled back');
  PERFORM public.t_assert(NOT EXISTS (SELECT 1 FROM store_order_cancel_requests WHERE order_id = o), 'no ledger row');
  PERFORM public.t_assert(NOT EXISTS (SELECT 1 FROM test_commission_log WHERE order_id = o AND to_status = 'cancelled'), 'commission side effect rolled back');
  RAISE NOTICE 'PASS 2 ledger failure rolls back status';
END $$;

-- 3) expected status mismatch -> transition_conflict, nothing written
DO $$
DECLARE o uuid := public.t_new_order('ready_for_pickup'); r jsonb;
BEGIN
  r := public.store_order_owner_cancel_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'preparing', 'r', null);
  PERFORM public.t_assert(r->>'error' = 'transition_conflict' AND r->>'order_status' = 'ready_for_pickup', 'conflict: ' || r::text);
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'ready_for_pickup', 'unchanged');
  PERFORM public.t_assert(NOT EXISTS (SELECT 1 FROM store_order_cancel_requests WHERE order_id = o), 'no ledger');
  RAISE NOTICE 'PASS 3 expected status mismatch';
END $$;

-- 4) pickup lock: courier picked up -> picked_up; terminal/other store/other owner/admin lock refused
DO $$
DECLARE o uuid := public.t_new_order('ready_for_pickup'); r jsonb; o2 uuid; o3 uuid;
BEGIN
  INSERT INTO store_order_deliveries(order_id, store_id, buyer_user_id, delivery_status)
  VALUES (o, 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'rider_assigned');
  UPDATE store_order_deliveries SET delivery_status = 'pickup_in_progress' WHERE order_id = o;
  r := public.store_order_owner_cancel_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ready_for_pickup', 'r', null);
  PERFORM public.t_assert(r->>'error' = 'picked_up', 'picked_up: ' || r::text);
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'ready_for_pickup', 'unchanged after picked_up');

  o2 := public.t_new_order('completed');
  r := public.store_order_owner_cancel_atomic(o2, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'completed', 'r', null);
  PERFORM public.t_assert(r->>'error' = 'invalid_transition', 'completed -> invalid_transition: ' || r::text);

  o3 := public.t_new_order('accepted');
  r := public.store_order_owner_cancel_atomic(o3, 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'accepted', 'r', null);
  PERFORM public.t_assert(r->>'error' = 'forbidden', 'other owner -> forbidden: ' || r::text);
  r := public.store_order_owner_cancel_atomic(o3, 'aaaaaaaa-0000-0000-0000-0000000000ff', '11111111-1111-1111-1111-111111111111', 'accepted', 'r', null);
  PERFORM public.t_assert(r->>'error' = 'order_not_found', 'other store -> not found: ' || r::text);
  r := public.store_order_owner_cancel_atomic(o3, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'accepted', '   ', null);
  PERFORM public.t_assert(r->>'error' = 'invalid_args', 'blank reason -> invalid_args: ' || r::text);
  UPDATE store_orders SET admin_locked = true WHERE id = o3;
  r := public.store_order_owner_cancel_atomic(o3, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'accepted', 'r', null);
  PERFORM public.t_assert(r->>'error' = 'order_admin_locked', 'admin lock: ' || r::text);
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o3) = 'accepted', 'unchanged after locks');
  RAISE NOTICE 'PASS 4 pickup lock / ownership / admin lock';
END $$;

-- 5) commission charge failure inside the same UPDATE (restore to cooking status) rolls back decide
DO $$
DECLARE o uuid := public.t_new_order('preparing'); r jsonb; failed boolean := false;
BEGIN
  r := public.store_order_buyer_cancel_request_atomic(o, '33333333-3333-3333-3333-333333333333', 'preparing', '늦어요');
  PERFORM public.t_assert((r->>'ok')::boolean, 'buyer request ok');
  INSERT INTO test_commission_fail VALUES (o);
  BEGIN
    r := public.store_order_cancel_request_decide_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner', 'cancel_requested', 'reject', 'preparing', '진행합니다', null);
  EXCEPTION WHEN OTHERS THEN
    failed := SQLERRM LIKE 'store_commission_charge_failed:%';
  END;
  PERFORM public.t_assert(failed, 'commission failure surfaced');
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'cancel_requested', 'status rolled back');
  PERFORM public.t_assert((SELECT status FROM store_order_cancel_requests WHERE order_id = o) = 'pending', 'ledger still pending');
  DELETE FROM test_commission_fail WHERE order_id = o;
  RAISE NOTICE 'PASS 5 commission failure rolls back decide';
END $$;

-- 6) decide approve (owner) normal + duplicate decide -> transition_conflict + duplicate pending blocked
DO $$
DECLARE o uuid := public.t_new_order('accepted'); r jsonb; dup boolean := false;
BEGIN
  r := public.store_order_buyer_cancel_request_atomic(o, '33333333-3333-3333-3333-333333333333', 'accepted', '주소 오류');
  PERFORM public.t_assert((r->>'ok')::boolean, 'buyer request ok');
  r := public.store_order_buyer_cancel_request_atomic(o, '33333333-3333-3333-3333-333333333333', 'cancel_requested', 'again');
  PERFORM public.t_assert(r->>'error' = 'invalid_transition', 'second buyer request refused: ' || r::text);
  BEGIN
    INSERT INTO store_order_cancel_requests(order_id, previous_order_status, requested_role, reason, status)
    VALUES (o, 'accepted', 'buyer', 'dup', 'pending');
  EXCEPTION WHEN unique_violation THEN dup := true;
  END;
  PERFORM public.t_assert(dup, 'duplicate pending blocked by unique index');
  r := public.store_order_owner_cancel_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'cancel_requested', 'r', null);
  PERFORM public.t_assert(r->>'error' = 'invalid_transition', 'owner direct cancel on cancel_requested refused: ' || r::text);

  r := public.store_order_cancel_request_decide_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner', 'cancel_requested', 'approve', null, null, null);
  PERFORM public.t_assert((r->>'ok')::boolean AND r->>'order_status' = 'cancelled', 'approve ok: ' || r::text);
  PERFORM public.t_assert((SELECT order_status || '/' || payment_status FROM store_orders WHERE id = o) = 'cancelled/cancelled', 'cancelled');
  PERFORM public.t_assert((SELECT status || '/' || refund_status || '/' || approved_by::text FROM store_order_cancel_requests WHERE order_id = o)
    = 'approved/pending/11111111-1111-1111-1111-111111111111', 'ledger approved');
  r := public.store_order_cancel_request_decide_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'admin', 'cancel_requested', 'approve', null, null, null);
  PERFORM public.t_assert(r->>'error' = 'transition_conflict', 'late admin approve -> transition_conflict: ' || r::text);
  RAISE NOTICE 'PASS 6 decide approve + duplicate';
END $$;

-- 7) decide reject (admin) restores ledger previous status; mismatched restore refused; ledger failure rolls back
DO $$
DECLARE o uuid := public.t_new_order('arrived'); r jsonb; failed boolean := false; t timestamptz := now() + interval '1 day';
BEGIN
  r := public.store_order_buyer_cancel_request_atomic(o, '33333333-3333-3333-3333-333333333333', 'arrived', '안 왔어요');
  PERFORM public.t_assert((r->>'ok')::boolean, 'buyer request ok');
  r := public.store_order_cancel_request_decide_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'admin', 'cancel_requested', 'reject', 'preparing', 'no', null);
  PERFORM public.t_assert(r->>'error' = 'restore_status_mismatch', 'restore mismatch: ' || r::text);
  r := public.store_order_cancel_request_decide_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'admin', 'cancel_requested', 'reject', 'arrived', '', null);
  PERFORM public.t_assert(r->>'error' = 'reason_required', 'reason required: ' || r::text);
  BEGIN
    r := public.store_order_cancel_request_decide_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'admin', 'cancel_requested', 'reject', 'arrived', 'FORCE_LEDGER_FAIL', t);
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM LIKE '%forced_ledger_failure%';
  END;
  PERFORM public.t_assert(failed, 'ledger update failure surfaced');
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'cancel_requested', 'status rolled back on ledger failure');
  UPDATE store_orders SET admin_locked = true WHERE id = o;
  r := public.store_order_cancel_request_decide_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner', 'cancel_requested', 'reject', 'arrived', '진행', t);
  PERFORM public.t_assert(r->>'error' = 'order_admin_locked', 'owner blocked by admin lock: ' || r::text);
  r := public.store_order_cancel_request_decide_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'admin', 'cancel_requested', 'reject', 'arrived', '배달 완료 확인', t);
  PERFORM public.t_assert((r->>'ok')::boolean AND r->>'order_status' = 'arrived', 'admin reject ok (admin ignores lock): ' || r::text);
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'arrived', 'restored');
  PERFORM public.t_assert((SELECT auto_complete_at FROM store_orders WHERE id = o) = t, 'auto_complete_at from caller');
  PERFORM public.t_assert((SELECT status || '/' || rejected_reason || '/' || refund_status FROM store_order_cancel_requests WHERE order_id = o)
    = 'rejected/배달 완료 확인/not_applicable', 'ledger rejected');
  RAISE NOTICE 'PASS 7 decide reject';
END $$;

-- 8) no pending ledger row -> cancel_request_not_found (status untouched)
DO $$
DECLARE o uuid := public.t_new_order('cancel_requested'); r jsonb;
BEGIN
  r := public.store_order_cancel_request_decide_atomic(o, 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner', 'cancel_requested', 'approve', null, null, null);
  PERFORM public.t_assert(r->>'error' = 'cancel_request_not_found', 'no ledger: ' || r::text);
  PERFORM public.t_assert((SELECT order_status FROM store_orders WHERE id = o) = 'cancel_requested', 'unchanged');
  RAISE NOTICE 'PASS 8 missing ledger row';
END $$;
