-- DIBAY Finance SSOT-19 · D2 (Coin / Cash / Settlement)
--
-- F-08: credit_coin_from_confirmed_sale locks the order's settlement row
--       (store_settlements.order_id UNIQUE) and refuses to mint when it is 'paid'.
--       Together with the D1 trigger, a sale can be paid either as a settlement
--       payout or as Coin, never both, in any execution order.
-- F-14: coin_withdrawal_mark_paid requires payout method + reference.
-- M-4 : coin_withdrawal_request verifies the store owner.
-- M-3 : convert_store_economic_points_to_business_cash replay lookup is scoped
--       to this store and the conversion entry kind.
-- Each body = current production definition + the listed change only.

BEGIN;

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
  v_settlement_status text;
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

  -- SSOT-19 F-08: order-level lock on the (unique) settlement row; a paid
  -- settlement payout excludes a Coin mint for the same sale.
  SELECT settlement_status INTO v_settlement_status
    FROM public.store_settlements
   WHERE order_id = p_order_id
   FOR UPDATE;
  IF FOUND AND v_settlement_status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'settlement_already_paid');
  END IF;
  -- Re-check after waiting for the settlement lock (concurrent mint).
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

REVOKE ALL ON FUNCTION public.credit_coin_from_confirmed_sale(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coin_from_confirmed_sale(uuid, uuid, uuid, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.coin_withdrawal_request(
  p_owner_user_id uuid,
  p_store_id uuid,
  p_amount integer,
  p_destination_type text,
  p_account_number text,
  p_account_name text,
  p_bank_name text,
  p_idempotency_key text,
  p_source_kind text DEFAULT 'coin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_req_id uuid;
  v_bal integer;
  v_new_bal integer;
  v_hold_ledger uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_owner_user_id IS NULL OR p_store_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  -- SSOT-19 M-4: caller must own the store.
  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
     WHERE s.id = p_store_id AND s.owner_user_id = p_owner_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;

  SELECT id INTO v_req_id FROM public.coin_withdrawal_requests WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', v_req_id);
  END IF;

  PERFORM public.ensure_store_economic_point_account(p_store_id);

  SELECT balance INTO v_bal
    FROM public.store_economic_point_accounts
   WHERE store_id = p_store_id
   FOR UPDATE;

  IF coalesce(v_bal, 0) < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_coin', 'balance', coalesce(v_bal, 0));
  END IF;

  v_new_bal := v_bal - p_amount;
  UPDATE public.store_economic_point_accounts
     SET balance = v_new_bal, updated_at = now()
   WHERE store_id = p_store_id;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    p_store_id, 'WITHDRAWAL_REQUEST', -p_amount, v_new_bal,
    'coin_withdrawal', v_key,
    v_key || ':hold', 'owner', p_owner_user_id,
    jsonb_build_object('amount', p_amount)
  ) RETURNING id INTO v_hold_ledger;

  INSERT INTO public.coin_withdrawal_requests (
    store_id, owner_user_id, amount, status,
    destination_type, account_number, account_name, bank_name,
    source_kind, idempotency_key, hold_ledger_id
  ) VALUES (
    p_store_id, p_owner_user_id, p_amount, 'REQUESTED',
    lower(btrim(p_destination_type)), btrim(p_account_number), btrim(p_account_name),
    nullif(btrim(coalesce(p_bank_name, '')), ''),
    coalesce(nullif(btrim(p_source_kind), ''), 'coin'),
    v_key, v_hold_ledger
  ) RETURNING id INTO v_req_id;

  RETURN jsonb_build_object(
    'ok', true, 'request_id', v_req_id, 'balance_after', v_new_bal
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_req_id FROM public.coin_withdrawal_requests WHERE idempotency_key = v_key;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', v_req_id);
END;
$$;

REVOKE ALL ON FUNCTION public.coin_withdrawal_request(uuid, uuid, integer, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coin_withdrawal_request(uuid, uuid, integer, text, text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.coin_withdrawal_mark_paid(
  p_admin_user_id uuid,
  p_request_id uuid,
  p_payout_method text DEFAULT NULL,
  p_payout_reference text DEFAULT NULL,
  p_payout_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.coin_withdrawal_requests%ROWTYPE;
  v_bal integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;
  -- SSOT-19 F-14: payout evidence is mandatory.
  IF nullif(btrim(coalesce(p_payout_reference, '')), '') IS NULL
     OR nullif(btrim(coalesce(p_payout_method, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_reference_required');
  END IF;

  SELECT * INTO v_req
    FROM public.coin_withdrawal_requests
   WHERE id = p_request_id AND status IN ('REQUESTED', 'APPROVED')
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_payable');
  END IF;

  SELECT balance INTO v_bal FROM public.store_economic_point_accounts WHERE store_id = v_req.store_id;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    v_req.store_id, 'WITHDRAWAL_COMPLETE', 0, coalesce(v_bal, 0),
    'coin_withdrawal', v_req.id::text,
    'coin_wd_paid:' || v_req.id::text, 'admin', p_admin_user_id,
    jsonb_build_object(
      'amount', v_req.amount,
      'payout_method', p_payout_method,
      'payout_reference', p_payout_reference
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  UPDATE public.coin_withdrawal_requests
     SET status = 'PAID',
         approved_by = coalesce(approved_by, p_admin_user_id),
         approved_at = coalesce(approved_at, now()),
         paid_by = p_admin_user_id,
         paid_at = now(),
         payout_method = nullif(btrim(coalesce(p_payout_method, '')), ''),
         payout_reference = nullif(btrim(coalesce(p_payout_reference, '')), ''),
         payout_note = nullif(btrim(coalesce(p_payout_note, '')), '')
   WHERE id = v_req.id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'status', 'PAID');
END;
$$;

REVOKE ALL ON FUNCTION public.coin_withdrawal_mark_paid(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coin_withdrawal_mark_paid(uuid, uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.convert_store_economic_points_to_business_cash(
  p_owner_user_id uuid,
  p_store_id uuid,
  p_points integer,
  p_expected_rate_version integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_policy public.business_cash_conversion_rate_policies;
  v_sp_bal integer;
  v_bc_bal bigint;
  v_credit_minor bigint;
  v_sp_ledger uuid;
  v_bc_ledger uuid;
  v_existing_bc uuid;
  v_settle jsonb;
  v_day_count integer;
  v_day_coin integer;
  v_week_count integer;
  v_month_count integer;
  v_month_coin integer;
  v_last_at timestamptz;
BEGIN
  IF p_owner_user_id IS NULL OR p_store_id IS NULL OR p_points IS NULL OR p_points <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_required');
  END IF;

  SELECT id INTO v_existing_bc
  FROM public.business_cash_ledger
  WHERE idempotency_key = trim(p_idempotency_key)
    AND store_id = p_store_id
    AND entry_kind = 'CONVERT_FROM_STORE_POINTS';
  IF NOT FOUND AND EXISTS (
    SELECT 1 FROM public.business_cash_ledger WHERE idempotency_key = trim(p_idempotency_key)
  ) THEN
    -- SSOT-19 M-3: key belongs to another store or another entry kind.
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
  END IF;
  IF FOUND THEN
    v_settle := public.settle_store_sale_fee_obligations(p_store_id);
    SELECT balance_minor INTO v_bc_bal FROM public.business_cash_accounts WHERE store_id = p_store_id;
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'bc_ledger_id', v_existing_bc,
      'bc_balance_after_minor', coalesce(v_bc_bal, 0),
      'obligation_settle', v_settle
    );
  END IF;

  SELECT id, owner_user_id INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND OR v_store.owner_user_id IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_policy FROM public.business_cash_conversion_rate_policies WHERE id = 'default' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_missing');
  END IF;
  IF COALESCE(v_policy.conversion_enabled, true) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conversion_disabled');
  END IF;
  IF p_expected_rate_version IS DISTINCT FROM v_policy.version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'stale_rate',
      'rate_pesos_per_point', v_policy.rate_pesos_per_point,
      'version', v_policy.version,
      'is_default_rate', (v_policy.rate_pesos_per_point = 1)
    );
  END IF;

  IF p_points < COALESCE(v_policy.minimum_coin_per_conversion, 1) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'below_minimum',
      'minimum_coin', COALESCE(v_policy.minimum_coin_per_conversion, 1)
    );
  END IF;
  IF COALESCE(v_policy.conversion_unit, 1) > 1
     AND (p_points % COALESCE(v_policy.conversion_unit, 1)) <> 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_unit',
      'conversion_unit', COALESCE(v_policy.conversion_unit, 1)
    );
  END IF;

  SELECT count(*)::integer, COALESCE(sum(abs(amount)), 0)::integer
  INTO v_day_count, v_day_coin
  FROM public.store_economic_point_ledger
  WHERE store_id = p_store_id
    AND entry_kind = 'CONVERT_TO_BUSINESS_CASH'
    AND created_at >= date_trunc('day', now());

  SELECT count(*)::integer
  INTO v_week_count
  FROM public.store_economic_point_ledger
  WHERE store_id = p_store_id
    AND entry_kind = 'CONVERT_TO_BUSINESS_CASH'
    AND created_at >= date_trunc('week', now());

  SELECT count(*)::integer, COALESCE(sum(abs(amount)), 0)::integer
  INTO v_month_count, v_month_coin
  FROM public.store_economic_point_ledger
  WHERE store_id = p_store_id
    AND entry_kind = 'CONVERT_TO_BUSINESS_CASH'
    AND created_at >= date_trunc('month', now());

  IF v_policy.maximum_conversions_per_day IS NOT NULL
     AND v_day_count >= v_policy.maximum_conversions_per_day THEN
    RETURN jsonb_build_object('ok', false, 'error', 'daily_count_limit');
  END IF;
  IF v_policy.maximum_conversions_per_week IS NOT NULL
     AND v_week_count >= v_policy.maximum_conversions_per_week THEN
    RETURN jsonb_build_object('ok', false, 'error', 'weekly_count_limit');
  END IF;
  IF v_policy.maximum_conversions_per_month IS NOT NULL
     AND v_month_count >= v_policy.maximum_conversions_per_month THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monthly_count_limit');
  END IF;
  IF v_policy.daily_limit_coin IS NOT NULL
     AND (v_day_coin + p_points) > v_policy.daily_limit_coin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'daily_coin_limit');
  END IF;
  IF v_policy.monthly_limit_coin IS NOT NULL
     AND (v_month_coin + p_points) > v_policy.monthly_limit_coin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'monthly_coin_limit');
  END IF;

  IF v_policy.minimum_interval_hours IS NOT NULL AND v_policy.minimum_interval_hours > 0 THEN
    SELECT max(created_at) INTO v_last_at
    FROM public.store_economic_point_ledger
    WHERE store_id = p_store_id
      AND entry_kind = 'CONVERT_TO_BUSINESS_CASH';
    IF v_last_at IS NOT NULL
       AND v_last_at > now() - make_interval(hours => v_policy.minimum_interval_hours) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'interval_limit');
    END IF;
  END IF;

  PERFORM public.ensure_store_economic_point_account(p_store_id);
  PERFORM public.ensure_business_cash_account(p_store_id);

  SELECT balance INTO v_sp_bal FROM public.store_economic_point_accounts WHERE store_id = p_store_id FOR UPDATE;
  IF v_sp_bal < p_points THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_store_points', 'available', v_sp_bal);
  END IF;

  v_credit_minor := trunc(p_points * v_policy.rate_pesos_per_point * 100);
  IF v_credit_minor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'credit_zero');
  END IF;

  UPDATE public.store_economic_point_accounts
  SET balance = balance - p_points, updated_at = now()
  WHERE store_id = p_store_id
  RETURNING balance INTO v_sp_bal;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    p_store_id, 'CONVERT_TO_BUSINESS_CASH', -p_points, v_sp_bal,
    'business_cash_conversion', trim(p_idempotency_key),
    'sp_convert:' || trim(p_idempotency_key), 'owner', p_owner_user_id,
    jsonb_build_object(
      'rate_pesos_per_point', v_policy.rate_pesos_per_point,
      'rate_version', v_policy.version,
      'bc_credit_minor', v_credit_minor,
      'minimum_coin', COALESCE(v_policy.minimum_coin_per_conversion, 1),
      'conversion_unit', COALESCE(v_policy.conversion_unit, 1)
    )
  ) RETURNING id INTO v_sp_ledger;

  UPDATE public.business_cash_accounts
  SET balance_minor = balance_minor + v_credit_minor, updated_at = now()
  WHERE store_id = p_store_id
  RETURNING balance_minor INTO v_bc_bal;

  INSERT INTO public.business_cash_ledger (
    store_id, entry_kind, direction, amount_minor, balance_after_minor,
    related_type, related_id, idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    p_store_id, 'CONVERT_FROM_STORE_POINTS', 'credit', v_credit_minor, v_bc_bal,
    'store_economic_point_ledger', v_sp_ledger::text,
    trim(p_idempotency_key), 'owner', p_owner_user_id,
    jsonb_build_object(
      'sp_debited', p_points,
      'rate_pesos_per_point', v_policy.rate_pesos_per_point,
      'rate_version', v_policy.version,
      'sp_ledger_id', v_sp_ledger
    )
  ) RETURNING id INTO v_bc_ledger;

  v_settle := public.settle_store_sale_fee_obligations(p_store_id);
  SELECT balance_minor INTO v_bc_bal FROM public.business_cash_accounts WHERE store_id = p_store_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'sp_debited', p_points,
    'bc_credited_minor', v_credit_minor,
    'rate_pesos_per_point', v_policy.rate_pesos_per_point,
    'rate_version', v_policy.version,
    'sp_balance_after', v_sp_bal,
    'bc_balance_after_minor', coalesce(v_bc_bal, 0),
    'sp_ledger_id', v_sp_ledger,
    'bc_ledger_id', v_bc_ledger,
    'obligation_settle', v_settle,
    'minimum_coin', COALESCE(v_policy.minimum_coin_per_conversion, 1),
    'conversion_unit', COALESCE(v_policy.conversion_unit, 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text) TO service_role;

COMMIT;
