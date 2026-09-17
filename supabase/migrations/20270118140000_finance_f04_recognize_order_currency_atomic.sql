-- F-04: atomic order-completion money recognition
-- Coin mint (sale_coin:{orderId}) + Cash sale fee in ONE SECURITY DEFINER TX.
-- Preserves existing RPCs as callees; no duplicate financial authority.
-- On fee failure after coin attempt: RAISE → full TX rollback (no half-commit).

BEGIN;

CREATE OR REPLACE FUNCTION public.recognize_order_currency_on_completed(
  p_store_id uuid,
  p_order_id uuid,
  p_settlement_id uuid,
  p_confirmed_revenue_php integer,
  p_fee_due_php integer,
  p_coin_idempotency_key text,
  p_fee_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coin jsonb;
  v_fee jsonb;
  v_coin_key text := nullif(btrim(coalesce(p_coin_idempotency_key, '')), '');
  v_fee_key text := nullif(btrim(coalesce(p_fee_idempotency_key, '')), '');
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_store_id IS NULL OR p_order_id IS NULL OR v_coin_key IS NULL OR v_fee_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF GREATEST(0, coalesce(p_confirmed_revenue_php, 0)) <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'confirmed_revenue_php', 0);
  END IF;

  v_coin := public.credit_coin_from_confirmed_sale(
    p_store_id,
    p_order_id,
    p_settlement_id,
    GREATEST(0, coalesce(p_confirmed_revenue_php, 0)),
    v_coin_key
  );

  IF coalesce(v_coin->>'ok', 'false') IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', coalesce(v_coin->>'error', 'coin_credit_failed'),
      'stage', 'coin',
      'coin', v_coin
    );
  END IF;

  v_fee := public.charge_sale_fee_for_order(
    p_store_id,
    p_order_id,
    p_settlement_id,
    GREATEST(0, coalesce(p_confirmed_revenue_php, 0)),
    GREATEST(0, coalesce(p_fee_due_php, 0)),
    v_fee_key
  );

  IF coalesce(v_fee->>'ok', 'false') IS DISTINCT FROM 'true' THEN
    -- Abort entire TX so coin credit (if any non-idempotent write) rolls back with fee.
    RAISE EXCEPTION 'recognize_order_currency_fee_failed:%',
      coalesce(v_fee->>'error', 'sale_fee_failed')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'confirmed_revenue_php', GREATEST(0, coalesce(p_confirmed_revenue_php, 0)),
    'coin', v_coin,
    'fee', v_fee,
    'coin_idempotent', coalesce((v_coin->>'idempotent')::boolean, false),
    'fee_idempotent', coalesce((v_fee->>'idempotent')::boolean, false),
    'fee_skipped', coalesce((v_fee->>'skipped')::boolean, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recognize_order_currency_on_completed(uuid, uuid, uuid, integer, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recognize_order_currency_on_completed(uuid, uuid, uuid, integer, integer, text, text)
  TO service_role;

COMMENT ON FUNCTION public.recognize_order_currency_on_completed(uuid, uuid, uuid, integer, integer, text, text) IS
  'F-04: atomic Coin sale_coin + Cash SALE_FEE recognition for completed orders. Callees remain canonical; half-commit forbidden.';

COMMIT;
