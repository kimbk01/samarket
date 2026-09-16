-- CUT 3B: Tighten gift_certificate_refund_order_atomic FROM-status CAS.
-- Expected first transition: refund_requested → refunded.
-- Already refunded → idempotent reverse only.

CREATE OR REPLACE FUNCTION public.gift_certificate_refund_order_atomic(
  p_order_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_reverse jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order.order_status = 'refunded' THEN
    v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', p_order_id,
      'gift_reverse', v_reverse
    );
  END IF;

  IF v_order.order_status IS DISTINCT FROM 'refund_requested' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'unexpected_from_status',
      'order_status', v_order.order_status
    );
  END IF;

  -- Gift reverse FIRST in same TX. Failure => RAISE => refund not terminal.
  v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
  IF coalesce(v_reverse->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'gift_reverse_failed: %', coalesce(v_reverse->>'error', 'unknown');
  END IF;

  UPDATE public.store_orders
     SET order_status = 'refunded',
         payment_status = 'refunded',
         refunded_at = coalesce(refunded_at, now()),
         refund_approved_at = coalesce(refund_approved_at, now()),
         updated_at = now()
   WHERE id = p_order_id
     AND order_status = 'refund_requested';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_refund_status_race';
  END IF;

  UPDATE public.store_payments
     SET status = 'refunded'
   WHERE order_id = p_order_id
     AND status = 'succeeded';

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'gift_reverse', v_reverse
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gift_certificate_refund_order_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_refund_order_atomic(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.gift_certificate_refund_order_atomic(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_refund_order_atomic(uuid, uuid) TO service_role;
