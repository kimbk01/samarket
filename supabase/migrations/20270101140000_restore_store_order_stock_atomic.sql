-- CUT 3A: Atomic + idempotent stock restore for store order cancel/refund terminals.

CREATE TABLE IF NOT EXISTS public.store_order_stock_restore_claims (
  order_id uuid PRIMARY KEY REFERENCES public.store_orders (id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'terminal_restore'
);

COMMENT ON TABLE public.store_order_stock_restore_claims IS
  'DIBAY Delivery CUT 3: one stock restore side-effect per order (cancel/refund)';

CREATE OR REPLACE FUNCTION public.restore_store_order_stock_atomic(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed boolean := false;
  v_line record;
  v_restored integer := 0;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  INSERT INTO public.store_order_stock_restore_claims (order_id)
  VALUES (p_order_id)
  ON CONFLICT (order_id) DO NOTHING
  RETURNING true INTO v_claimed;

  IF v_claimed IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'restored_products', 0);
  END IF;

  FOR v_line IN
    SELECT product_id, sum(qty)::integer AS qty
      FROM public.store_order_items
     WHERE order_id = p_order_id
       AND product_id IS NOT NULL
     GROUP BY product_id
  LOOP
    IF v_line.qty IS NULL OR v_line.qty < 1 THEN
      CONTINUE;
    END IF;

    UPDATE public.store_products p
       SET stock_qty = p.stock_qty + v_line.qty,
           product_status = CASE
             WHEN p.product_status = 'sold_out' AND (p.stock_qty + v_line.qty) > 0 THEN 'active'
             ELSE p.product_status
           END,
           updated_at = now()
     WHERE p.id = v_line.product_id
       AND coalesce(p.track_inventory, false) = true;

    IF FOUND THEN
      v_restored := v_restored + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'restored_products', v_restored,
    'order_id', p_order_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_store_order_stock_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_store_order_stock_atomic(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.restore_store_order_stock_atomic(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_store_order_stock_atomic(uuid) TO service_role;
