-- DIBAY Currency CUT C — confirmed sale Coin mint (sale_coin:{orderId} only)
-- Retire gift_coin:{redemptionId} as second Coin mint on same order.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- credit_coin_from_confirmed_sale — canonical order-level Coin inflow
-- Idempotency MUST be sale_coin:{orderId}
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.credit_coin_from_confirmed_sale(
  p_store_id uuid,
  p_order_id uuid,
  p_settlement_id uuid,
  p_amount integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_expected text;
  v_ledger uuid;
  v_bal integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_store_id IS NULL OR p_order_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  v_expected := 'sale_coin:' || p_order_id::text;
  IF v_key IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_idempotency_key', 'expected', v_expected);
  END IF;

  SELECT id INTO v_ledger
    FROM public.store_economic_point_ledger
   WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'ledger_id', v_ledger);
  END IF;

  PERFORM public.ensure_store_economic_point_account(p_store_id);

  UPDATE public.store_economic_point_accounts
     SET balance = balance + p_amount, updated_at = now()
   WHERE store_id = p_store_id
   RETURNING balance INTO v_bal;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, meta
  ) VALUES (
    p_store_id, 'SALE_EARN', p_amount, v_bal,
    'store_order', p_order_id::text,
    v_key, 'system',
    jsonb_build_object(
      'order_id', p_order_id,
      'settlement_id', p_settlement_id,
      'mint_identity', 'sale_coin'
    )
  ) RETURNING id INTO v_ledger;

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'ledger_id', v_ledger, 'balance_after', v_bal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_coin_from_confirmed_sale(uuid, uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_coin_from_confirmed_sale(uuid, uuid, uuid, integer, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Gift revenue recognition — REVENUE_AVAILABLE only (no gift_coin mint)
-- ═══════════════════════════════════════════════════════════════════════════

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
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'recognized_count', v_recognized_count,
    'skipped_count', v_skipped_count,
    'coin_mint', 'deferred_to_sale_coin'
  );
END;
$$;

COMMENT ON FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(uuid) IS
  'CUT C: REVENUE_AVAILABLE only. Coin mint is sale_coin:{orderId} via credit_coin_from_confirmed_sale.';

-- Freeze new gift_coin: mints (legacy rows preserved)
CREATE OR REPLACE FUNCTION public.credit_coin_from_gift_revenue(
  p_store_id uuid,
  p_redemption_id uuid,
  p_amount integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_ledger uuid;
BEGIN
  IF v_key IS NOT NULL AND v_key LIKE 'gift_coin:%' THEN
    SELECT id INTO v_ledger
      FROM public.store_economic_point_ledger
     WHERE idempotency_key = v_key;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'ledger_id', v_ledger);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'gift_coin_mint_retired');
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
END;
$$;

COMMIT;
