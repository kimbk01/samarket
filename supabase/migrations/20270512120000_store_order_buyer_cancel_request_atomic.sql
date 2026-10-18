-- 3단계 D1: buyer cancel request — ledger row + order status in ONE transaction.
-- Called only by applyStoreOrderStatusTransition (CUSTOMER → cancel_requested), service_role.
--
-- Under the order row lock (FOR UPDATE) and the delivery row lock (FOR SHARE):
--   admin_locked → order_admin_locked
--   order_status ≠ p_expected_status → transition_conflict
--   order_status not accepted…arrived → invalid_transition
--   delivery picked up or later → picked_up (same set as store-order-cancel-policy.ts)
--   another pending request → cancel_request_pending (one-pending unique index)
-- Any failure leaves neither the ledger row nor the status change.
-- A courier pickup that commits first is seen here; one that starts later waits for this commit and
-- is then refused by trg_store_order_deliveries_pickup_requires_dispatch (below).

CREATE OR REPLACE FUNCTION public.store_order_buyer_cancel_request_atomic(
  p_order_id uuid,
  p_buyer_user_id uuid,
  p_expected_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_delivery_status text;
  v_request_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR p_buyer_user_id IS NULL OR coalesce(btrim(p_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- Lock order: delivery row first, then order row — the same order the pickup guard below takes
  -- (pickup UPDATE locks the delivery row, then its trigger locks the order row), so no deadlock.
  SELECT delivery_status INTO v_delivery_status
    FROM public.store_order_deliveries
   WHERE order_id = p_order_id
   FOR SHARE;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id AND buyer_user_id = p_buyer_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF coalesce(v_order.admin_locked, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_admin_locked');
  END IF;
  IF v_order.order_status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transition_conflict', 'order_status', v_order.order_status);
  END IF;
  IF v_order.order_status NOT IN ('accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition', 'order_status', v_order.order_status);
  END IF;
  IF v_delivery_status IN ('pickup_in_progress', 'delivering', 'delivered', 'delivery_failed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'picked_up', 'delivery_status', v_delivery_status);
  END IF;

  BEGIN
    INSERT INTO public.store_order_cancel_requests (
      order_id, previous_order_status, requested_by, requested_role, reason, status, refund_status
    ) VALUES (
      p_order_id, v_order.order_status, p_buyer_user_id, 'buyer', btrim(p_reason), 'pending', 'pending'
    )
    RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cancel_request_pending');
  END;

  UPDATE public.store_orders
     SET order_status = 'cancel_requested',
         auto_complete_at = NULL,
         updated_at = now()
   WHERE id = p_order_id
     AND order_status = p_expected_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_buyer_cancel_request_race';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'request_id', v_request_id,
    'previous_order_status', v_order.order_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.store_order_buyer_cancel_request_atomic(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_order_buyer_cancel_request_atomic(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.store_order_buyer_cancel_request_atomic(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.store_order_buyer_cancel_request_atomic(uuid, uuid, text, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Pickup guard: entering pickup (pickup_in_progress / delivering) needs a dispatchable order,
-- checked under the order row lock in the same UPDATE. Same rule as orderAllowsDispatch in
-- lib/stores/store-order-delivery-service.ts (owner · rider · admin paths); that TS check is a
-- read without a lock, so a cancel request committed after it could otherwise be followed by a pickup.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.store_order_deliveries_pickup_requires_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.delivery_status IN ('pickup_in_progress', 'delivering')
     AND OLD.delivery_status NOT IN ('pickup_in_progress', 'delivering', 'delivered', 'delivery_failed') THEN
    SELECT order_status INTO v_status
      FROM public.store_orders
     WHERE id = NEW.order_id
     FOR SHARE;
    IF v_status IS NULL OR v_status NOT IN ('ready_for_pickup', 'delivering', 'arrived') THEN
      RAISE EXCEPTION 'order_status_blocks_dispatch:%', coalesce(v_status, 'missing') USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_order_deliveries_pickup_requires_dispatch ON public.store_order_deliveries;
CREATE TRIGGER trg_store_order_deliveries_pickup_requires_dispatch
  BEFORE UPDATE OF delivery_status ON public.store_order_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.store_order_deliveries_pickup_requires_dispatch();
