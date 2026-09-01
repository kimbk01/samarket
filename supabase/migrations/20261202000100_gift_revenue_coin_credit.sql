-- Gift revenue recognition → canonical Coin credit (CUT 2)
-- Extends gift_certificate_recognize_revenue_for_completed_order in-place.

BEGIN;

CREATE OR REPLACE FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_red public.gift_certificate_redemptions%ROWTYPE;
  v_recognized_count integer := 0;
  v_skipped_count integer := 0;
  v_inserted integer;
  v_coin jsonb;
BEGIN
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
  IF v_order.order_status IS DISTINCT FROM 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_completed');
  END IF;

  FOR v_red IN
    SELECT * FROM public.gift_certificate_redemptions
     WHERE order_id = p_order_id
       AND reversed = false
     ORDER BY created_at
     FOR UPDATE
  LOOP
    IF public.gift_certificate_redemption_is_recognized(v_red.id) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.gift_certificate_revenue_ledger (
      store_id, redemption_id, entry_type, amount, related_type, related_id
    ) VALUES (
      v_red.store_id, v_red.id, 'REVENUE_AVAILABLE', v_red.merchant_net_amount,
      'redemption', v_red.id::text || ':available'
    )
    ON CONFLICT (related_type, related_id, entry_type) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      v_recognized_count := v_recognized_count + 1;
      IF v_red.merchant_net_amount > 0 THEN
        v_coin := public.credit_coin_from_gift_revenue(
          v_red.store_id,
          v_red.id,
          v_red.merchant_net_amount,
          'gift_coin:' || v_red.id::text
        );
        IF coalesce(v_coin->>'ok', 'false') <> 'true' AND coalesce(v_coin->>'idempotent', 'false') <> 'true' THEN
          RAISE EXCEPTION 'gift_coin_credit_failed: %', coalesce(v_coin->>'error', 'unknown');
        END IF;
      END IF;
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'recognized_count', v_recognized_count,
    'skipped_count', v_skipped_count
  );
END;
$$;

COMMENT ON FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(uuid) IS
  'Idempotent: REVENUE_AVAILABLE + canonical Coin credit per redemption on order completed.';

COMMIT;
