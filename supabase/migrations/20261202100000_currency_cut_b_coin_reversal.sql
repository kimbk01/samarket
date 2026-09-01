-- DIBAY Currency CUT B — Coin reversal + Gift→Store Cash conversion freeze
-- CUT A HARD LOCKED. No new Coin mint semantics. No Cash sale-fee writer.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- reverse_coin_credits_for_order — idempotent order-level Coin REVERSAL
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reverse_coin_credits_for_order(
  p_order_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT 'order_refund'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_order public.store_orders%ROWTYPE;
  v_store_id uuid;
  v_credited integer := 0;
  v_already_reversed integer := 0;
  v_to_reverse integer := 0;
  v_bal_before integer := 0;
  v_bal_after integer := 0;
  v_reversal_id uuid;
  v_existing uuid;
  v_original_ids uuid[] := ARRAY[]::uuid[];
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_existing
    FROM public.store_economic_point_ledger
   WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'reversal_ledger_id', v_existing,
      'order_id', p_order_id
    );
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  v_store_id := v_order.store_id;

  SELECT COALESCE(SUM(l.amount), 0)::integer,
         COALESCE(array_agg(l.id ORDER BY l.created_at), ARRAY[]::uuid[])
    INTO v_credited, v_original_ids
    FROM public.store_economic_point_ledger l
    LEFT JOIN public.store_settlements s
      ON l.related_type = 'store_settlement'
     AND l.related_id = s.id::text
    LEFT JOIN public.gift_certificate_redemptions r
      ON l.related_type = 'gift_redemption'
     AND l.related_id = r.id::text
   WHERE l.store_id = v_store_id
     AND l.entry_kind IN ('SALE_EARN', 'GIFT_REDEMPTION_EARN')
     AND l.amount > 0
     AND (
       coalesce(l.meta->>'order_id', '') = p_order_id::text
       OR s.order_id = p_order_id
       OR r.order_id = p_order_id
     );

  SELECT COALESCE(SUM(ABS(l.amount)), 0)::integer
    INTO v_already_reversed
    FROM public.store_economic_point_ledger l
   WHERE l.store_id = v_store_id
     AND l.entry_kind = 'REVERSAL'
     AND coalesce(l.meta->>'order_id', '') = p_order_id::text;

  v_to_reverse := GREATEST(0, v_credited - v_already_reversed);

  IF v_to_reverse <= 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reversed_amount', 0,
      'order_id', p_order_id,
      'credited_amount', v_credited,
      'already_reversed', v_already_reversed
    );
  END IF;

  PERFORM public.ensure_store_economic_point_account(v_store_id);

  SELECT balance INTO v_bal_before
    FROM public.store_economic_point_accounts
   WHERE store_id = v_store_id
   FOR UPDATE;

  v_bal_after := coalesce(v_bal_before, 0) - v_to_reverse;

  UPDATE public.store_economic_point_accounts
     SET balance = v_bal_after,
         updated_at = now()
   WHERE store_id = v_store_id;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, meta
  ) VALUES (
    v_store_id, 'REVERSAL', -v_to_reverse, v_bal_after,
    'store_order', p_order_id::text,
    v_key, 'system',
    jsonb_build_object(
      'order_id', p_order_id,
      'reason', coalesce(v_reason, 'order_refund'),
      'reversed_amount', v_to_reverse,
      'original_ledger_ids', to_jsonb(v_original_ids),
      'balance_before', coalesce(v_bal_before, 0),
      'balance_after', v_bal_after
    )
  ) RETURNING id INTO v_reversal_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'reversal_ledger_id', v_reversal_id,
    'reversed_amount', v_to_reverse,
    'order_id', p_order_id,
    'original_ledger_ids', to_jsonb(v_original_ids),
    'balance_before', coalesce(v_bal_before, 0),
    'balance_after', v_bal_after
  );
END;
$$;

COMMENT ON FUNCTION public.reverse_coin_credits_for_order(uuid, text, text) IS
  'CUT B: idempotent Coin REVERSAL for order refund/cancel. Reverses exact prior SALE_EARN/GIFT_REDEMPTION_EARN credits.';

REVOKE ALL ON FUNCTION public.reverse_coin_credits_for_order(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_coin_credits_for_order(uuid, text, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Gift redemption reverse — skip legacy Store Cash clawback when Coin credited
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_reverse(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_red public.gift_certificate_redemptions%ROWTYPE;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_avail_before integer;
  v_shortfall integer;
  v_cash_balance integer;
  v_debit integer;
  v_new_cash integer;
  v_restored integer;
  v_new_status text;
  v_count integer := 0;
  v_obligation_id uuid;
  v_has_coin_credit boolean;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  FOR v_red IN
    SELECT * FROM public.gift_certificate_redemptions
     WHERE order_id = p_order_id
       AND reversed = false
     ORDER BY created_at
     FOR UPDATE
  LOOP
    v_count := v_count + 1;

    SELECT * INTO v_inst
      FROM public.gift_certificate_instances
     WHERE id = v_red.instance_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'gift_reverse_instance_not_found redemption=%', v_red.id;
    END IF;

    v_restored := v_inst.remaining_balance + v_red.redeemed_amount;
    IF v_restored > v_inst.face_value THEN
      RAISE EXCEPTION 'gift_reverse_restore_overflow redemption=%', v_red.id;
    END IF;
    IF v_restored = v_inst.face_value THEN
      v_new_status := 'ACTIVE';
    ELSIF v_restored > 0 THEN
      v_new_status := 'PARTIALLY_REDEEMED';
    ELSE
      v_new_status := 'FULLY_REDEEMED';
    END IF;

    UPDATE public.gift_certificate_instances
       SET remaining_balance = v_restored,
           status = CASE
             WHEN status = 'GIFT_LOCKED' THEN 'GIFT_LOCKED'
             ELSE v_new_status
           END,
           version = version + 1,
           fully_redeemed_at = CASE WHEN v_restored > 0 THEN NULL ELSE fully_redeemed_at END
     WHERE id = v_inst.id;

    UPDATE public.gift_certificate_redemptions
       SET reversed = true,
           reversed_at = now()
     WHERE id = v_red.id;

    INSERT INTO public.gift_certificate_ledger (
      instance_id, store_id, user_id, entry_type, amount,
      related_type, related_id, description, actor_type
    ) VALUES (
      v_red.instance_id, v_red.store_id, v_red.buyer_user_id, 'REDEEM_REVERSE', v_red.redeemed_amount,
      'gift_certificate_redemption_reverse', v_red.id::text, 'Redemption reversed', 'system'
    );

    PERFORM public.gift_certificate_promo_reverse_for_redemption(v_red.id);

    IF EXISTS (
      SELECT 1 FROM public.gift_certificate_revenue_ledger rl
       WHERE rl.redemption_id = v_red.id
         AND rl.entry_type = 'REVENUE_AVAILABLE'
    ) THEN
      INSERT INTO public.gift_certificate_revenue_ledger (
        store_id, redemption_id, entry_type, amount, related_type, related_id
      ) VALUES (
        v_red.store_id, v_red.id, 'REVERSED', -v_red.merchant_net_amount,
        'redemption_reverse', v_red.id::text
      );

      SELECT EXISTS (
        SELECT 1
          FROM public.store_economic_point_ledger l
         WHERE l.store_id = v_red.store_id
           AND l.entry_kind = 'GIFT_REDEMPTION_EARN'
           AND l.related_type = 'gift_redemption'
           AND l.related_id = v_red.id::text
           AND l.amount > 0
      ) INTO v_has_coin_credit;

      -- Canonical Coin path: order-level REVERSAL handles clawback; no new Store Cash debit.
      IF NOT v_has_coin_credit THEN
        v_avail_before := public.gift_certificate_store_revenue_available(v_red.store_id);

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
              'GIFT_REDEMPTION_REVERSAL', 'redemption', v_red.id::text
            );
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
      END IF;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'reversed_count', 0, 'idempotent', true);
  END IF;

  UPDATE public.store_orders so
     SET gift_redemption_amount = coalesce((
       SELECT SUM(r.redeemed_amount)::integer
         FROM public.gift_certificate_redemptions r
        WHERE r.order_id = p_order_id
          AND r.reversed = false
     ), 0)
   WHERE so.id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'reversed_count', v_count, 'order_id', p_order_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Freeze Gift → legacy Store Cash conversion (new product writes forbidden)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gift_certificate_conversion_request(
  p_owner_user_id uuid,
  p_store_id uuid,
  p_amount integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', false,
    'error', 'gift_store_cash_conversion_frozen',
    'message', 'Gift Store Cash conversion is frozen. Use canonical Coin withdrawal or Finance.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gift_certificate_conversion_approve(
  p_admin_user_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', false,
    'error', 'gift_store_cash_conversion_frozen',
    'message', 'Gift Store Cash conversion approve is frozen. Historical requests remain readable.'
  );
END;
$$;

COMMIT;
