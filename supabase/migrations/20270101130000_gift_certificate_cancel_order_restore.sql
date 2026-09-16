-- CUT 2: Cancel path gift restore (idempotent). Does NOT set order_status=refunded.
-- Reuses gift_certificate_redemption_reverse (marks reversed=true) so later refund cannot double-restore.

CREATE OR REPLACE FUNCTION public.gift_certificate_cancel_order_restore(
  p_order_id uuid
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

  -- Only restore gift for cancelled (or payment-failure mapped cancel) terminals.
  IF v_order.order_status IS DISTINCT FROM 'cancelled'
     AND coalesce(v_order.payment_status, '') IS DISTINCT FROM 'failed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'order_not_cancelled',
      'order_status', v_order.order_status
    );
  END IF;

  v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
  IF coalesce(v_reverse->>'ok', 'false') <> 'true' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', coalesce(v_reverse->>'error', 'gift_reverse_failed'),
      'gift_reverse', v_reverse
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'idempotent', coalesce((v_reverse->>'idempotent')::boolean, false)
      OR coalesce((v_reverse->>'reversed_count')::int, 0) = 0,
    'gift_reverse', v_reverse
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gift_certificate_cancel_order_restore(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_cancel_order_restore(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.gift_certificate_cancel_order_restore(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cancel_order_restore(uuid) TO service_role;

COMMENT ON FUNCTION public.gift_certificate_cancel_order_restore(uuid) IS
  'DIBAY Delivery CUT 2: idempotent gift restore on cancelled orders; does not mark refunded';
