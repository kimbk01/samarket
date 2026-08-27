-- CUT 2: Historical recognition correction (NOT refund / NOT REVERSED misuse).
-- Neutralize wrong REVENUE_AVAILABLE on pending orders while preserving
-- redemption snapshots and future ORDER_COMPLETED recognition ability.

-- ---------------------------------------------------------------------------
-- 1) Recognized net per redemption (AVAILABLE + CORRECTION + REVERSED)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_recognized_net(p_redemption_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(rl.amount), 0)::integer
    FROM public.gift_certificate_revenue_ledger rl
   WHERE rl.redemption_id = p_redemption_id
     AND rl.entry_type IN ('REVENUE_AVAILABLE', 'RECOGNITION_CORRECTION', 'REVERSED');
$$;

COMMENT ON FUNCTION public.gift_certificate_redemption_recognized_net(uuid) IS
  'Net merchant recognition for a redemption. Correction/reversal offsets AVAILABLE.';

CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_is_recognized(p_redemption_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gift_certificate_redemption_recognized_net(p_redemption_id) > 0;
$$;

COMMENT ON FUNCTION public.gift_certificate_redemption_is_recognized(uuid) IS
  'True when net merchant recognition > 0 (AVAILABLE offset by CORRECTION/REVERSED).';

REVOKE ALL ON FUNCTION public.gift_certificate_redemption_recognized_net(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gift_certificate_redemption_recognized_net(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_redemption_recognized_net(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Available pool includes RECOGNITION_CORRECTION
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_store_revenue_available(p_store_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(r.amount), 0)::integer
  FROM public.gift_certificate_revenue_ledger r
  WHERE r.store_id = p_store_id
    AND r.entry_type IN (
      'REVENUE_AVAILABLE',
      'CONVERSION_APPROVE',
      'REVERSED',
      'RECOGNITION_CORRECTION'
    );
$$;

COMMENT ON FUNCTION public.gift_certificate_store_revenue_available(uuid) IS
  'Sum of REVENUE_AVAILABLE + CONVERSION_APPROVE + REVERSED + RECOGNITION_CORRECTION.';

-- ---------------------------------------------------------------------------
-- 3) Completion recognition must work after historical correction
-- ---------------------------------------------------------------------------
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
  v_related_id text;
  v_had_available boolean;
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
    IF public.gift_certificate_redemption_recognized_net(v_red.id) > 0 THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.gift_certificate_revenue_ledger rl
       WHERE rl.redemption_id = v_red.id
         AND rl.entry_type = 'REVENUE_AVAILABLE'
    ) INTO v_had_available;

    -- First-time recognition uses :available; after historical correction reuse blocked by uq.
    IF v_had_available THEN
      v_related_id := v_red.id::text || ':available:after_correction';
    ELSE
      v_related_id := v_red.id::text || ':available';
    END IF;

    INSERT INTO public.gift_certificate_revenue_ledger (
      store_id, redemption_id, entry_type, amount, related_type, related_id
    ) VALUES (
      v_red.store_id, v_red.id, 'REVENUE_AVAILABLE', v_red.merchant_net_amount,
      'redemption', v_related_id
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
    'skipped_count', v_skipped_count
  );
END;
$$;

COMMENT ON FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(uuid) IS
  'Idempotent recognition on completed orders; allows post-correction re-recognition.';

-- ---------------------------------------------------------------------------
-- 4) Store Cash ledger source for correction clawback (not refund semantics)
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_cash_ledger
  DROP CONSTRAINT IF EXISTS store_cash_ledger_source_type_check;

ALTER TABLE public.store_cash_ledger
  ADD CONSTRAINT store_cash_ledger_source_type_check
  CHECK (source_type IN (
    'GIFT_REVENUE_CONVERSION',
    'GIFT_REDEMPTION_REVERSAL',
    'RECOVERY_CLEAR',
    'GIFT_RECOGNITION_CORRECTION'
  ));

-- ---------------------------------------------------------------------------
-- 5) Atomic historical recognition correction (idempotent per redemption)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_correct_legacy_recognition(
  p_redemption_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_red public.gift_certificate_redemptions%ROWTYPE;
  v_order public.store_orders%ROWTYPE;
  v_avail_before integer;
  v_shortfall integer := 0;
  v_cash_balance integer;
  v_debit integer := 0;
  v_new_cash integer;
  v_obligation_id uuid;
  v_inserted integer;
BEGIN
  IF p_redemption_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_red
    FROM public.gift_certificate_redemptions
   WHERE id = p_redemption_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'redemption_not_found');
  END IF;

  IF v_red.reversed IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'redemption_reversed');
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = v_red.order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  -- Historical correction is only for non-completed (legacy redeem-time recognition).
  IF v_order.order_status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_completed_use_refund_path');
  END IF;
  IF v_order.order_status IN ('refunded', 'refund_requested') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_refund_state');
  END IF;

  -- Idempotent: correction already applied
  IF EXISTS (
    SELECT 1 FROM public.gift_certificate_revenue_ledger rl
     WHERE rl.redemption_id = v_red.id
       AND rl.entry_type = 'RECOGNITION_CORRECTION'
       AND rl.related_type = 'historical_recognition_correction'
       AND rl.related_id = v_red.id::text
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'redemption_id', v_red.id,
      'order_id', v_order.id,
      'owner_correction', 0,
      'platform_effect', 'recognized_flag_cleared',
      'shortfall', 0,
      'cash_debit', 0,
      'recovery_id', NULL
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.gift_certificate_revenue_ledger rl
     WHERE rl.redemption_id = v_red.id
       AND rl.entry_type = 'REVENUE_AVAILABLE'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_legacy_revenue_available');
  END IF;

  v_avail_before := public.gift_certificate_store_revenue_available(v_red.store_id);

  INSERT INTO public.gift_certificate_revenue_ledger (
    store_id, redemption_id, entry_type, amount, related_type, related_id
  ) VALUES (
    v_red.store_id,
    v_red.id,
    'RECOGNITION_CORRECTION',
    -v_red.merchant_net_amount,
    'historical_recognition_correction',
    v_red.id::text
  )
  ON CONFLICT (related_type, related_id, entry_type) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'redemption_id', v_red.id,
      'order_id', v_order.id,
      'owner_correction', 0,
      'cash_debit', 0,
      'recovery_id', NULL
    );
  END IF;

  -- Pool shortfall → explicit cash debit / recovery (never silent negative cash)
  IF v_avail_before < v_red.merchant_net_amount THEN
    v_shortfall := v_red.merchant_net_amount - GREATEST(v_avail_before, 0);

    INSERT INTO public.store_cash_accounts (store_id, balance)
    VALUES (v_red.store_id, 0)
    ON CONFLICT (store_id) DO NOTHING;

    SELECT balance INTO v_cash_balance
      FROM public.store_cash_accounts
     WHERE store_id = v_red.store_id
     FOR UPDATE;

    v_debit := LEAST(coalesce(v_cash_balance, 0), v_shortfall);
    IF v_debit > 0 THEN
      v_new_cash := coalesce(v_cash_balance, 0) - v_debit;
      UPDATE public.store_cash_accounts
         SET balance = v_new_cash,
             updated_at = now()
       WHERE store_id = v_red.store_id;
      INSERT INTO public.store_cash_ledger (
        store_id, amount, balance_after, source_type, related_type, related_id
      ) VALUES (
        v_red.store_id, -v_debit, v_new_cash,
        'GIFT_RECOGNITION_CORRECTION', 'redemption', v_red.id::text
      )
      ON CONFLICT (source_type, related_type, related_id) DO NOTHING;
    END IF;

    IF v_shortfall - v_debit > 0 THEN
      INSERT INTO public.store_cash_recovery_obligations (
        store_id, redemption_id, amount_original, amount_remaining, status
      ) VALUES (
        v_red.store_id, v_red.id, v_shortfall - v_debit, v_shortfall - v_debit, 'OPEN'
      )
      ON CONFLICT (redemption_id) DO NOTHING
      RETURNING id INTO v_obligation_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'redemption_id', v_red.id,
    'order_id', v_order.id,
    'owner_correction', -v_red.merchant_net_amount,
    'platform_fee_snapshot_preserved', v_red.platform_fee_amount,
    'avail_before', v_avail_before,
    'shortfall', v_shortfall,
    'cash_debit', v_debit,
    'recovery_id', v_obligation_id
  );
END;
$$;

COMMENT ON FUNCTION public.gift_certificate_correct_legacy_recognition(uuid) IS
  'CUT2: neutralize legacy REVENUE_AVAILABLE on non-completed orders via RECOGNITION_CORRECTION. Idempotent.';

REVOKE ALL ON FUNCTION public.gift_certificate_correct_legacy_recognition(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gift_certificate_correct_legacy_recognition(uuid) TO service_role;

COMMENT ON TABLE public.gift_certificate_revenue_ledger IS
  'Gift revenue ledger (REVENUE_CREATE|REVENUE_AVAILABLE|CONVERSION_*|REVERSED|RECOGNITION_CORRECTION). Integer signed.';
