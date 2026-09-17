-- F-02: forbid direct business_cash_accounts balance mutation (service_role / clients).
-- Canonical cash moves only via SECURITY DEFINER RPCs (table owner).
-- Also: approve + convert return post-settle Cash balance (not pre-settle credit after).

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON public.business_cash_accounts FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.business_cash_accounts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.business_cash_accounts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.business_cash_accounts FROM service_role;

GRANT SELECT ON public.business_cash_accounts TO authenticated;
GRANT SELECT ON public.business_cash_accounts TO service_role;

COMMENT ON TABLE public.business_cash_accounts IS
  'AST-005 Cash balance. Mutations ONLY via SECURITY DEFINER finance RPCs. Direct service_role upsert/update FORBIDDEN (F-02).';

-- ── approve_business_cash_charge_request: return balance AFTER settle → AFTER after settle ──
CREATE OR REPLACE FUNCTION public.approve_business_cash_charge_request(
  p_admin_user_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.business_cash_charge_requests%ROWTYPE;
  v_bal bigint;
  v_ledger uuid;
  v_settle jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_req FROM public.business_cash_charge_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.status = 'APPROVED' AND v_req.credit_ledger_id IS NOT NULL THEN
    v_settle := public.settle_store_sale_fee_obligations(v_req.store_id);
    SELECT balance_minor INTO v_bal FROM public.business_cash_accounts WHERE store_id = v_req.store_id;
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'ledger_id', v_req.credit_ledger_id,
      'balance_after_minor', coalesce(v_bal, 0),
      'obligation_settle', v_settle
    );
  END IF;
  IF v_req.status IS DISTINCT FROM 'PENDING' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_req.status);
  END IF;

  PERFORM public.ensure_business_cash_account(v_req.store_id);

  UPDATE public.business_cash_accounts
  SET balance_minor = balance_minor + v_req.amount_minor, updated_at = now()
  WHERE store_id = v_req.store_id
  RETURNING balance_minor INTO v_bal;

  INSERT INTO public.business_cash_ledger (
    store_id, entry_kind, direction, amount_minor, balance_after_minor,
    related_type, related_id, idempotency_key, actor_type, actor_user_id
  ) VALUES (
    v_req.store_id, 'TOP_UP', 'credit', v_req.amount_minor, v_bal,
    'business_cash_charge_request', v_req.id::text,
    'bc_topup:' || v_req.id::text, 'admin', p_admin_user_id
  ) RETURNING id INTO v_ledger;

  UPDATE public.business_cash_charge_requests
  SET status = 'APPROVED',
      admin_user_id = p_admin_user_id,
      decided_at = now(),
      credit_ledger_id = v_ledger,
      updated_at = now()
  WHERE id = v_req.id;

  v_settle := public.settle_store_sale_fee_obligations(v_req.store_id);

  SELECT balance_minor INTO v_bal FROM public.business_cash_accounts WHERE store_id = v_req.store_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'ledger_id', v_ledger,
    'balance_after_minor', coalesce(v_bal, 0),
    'amount_minor', v_req.amount_minor,
    'store_id', v_req.store_id,
    'obligation_settle', v_settle
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_business_cash_charge_request(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_business_cash_charge_request(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_business_cash_charge_request(uuid, uuid) TO service_role;

-- ── convert: refresh bc_balance_after_minor after settle (preserve limit columns when present) ──
DO $patch$
DECLARE
  v_has_limits boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'business_cash_conversion_rate_policies'
      AND column_name = 'minimum_coin_per_conversion'
  ) INTO v_has_limits;

  IF v_has_limits THEN
    -- Full body with limits + post-settle balance (same as 20261208120000 + F-02 fix)
    EXECUTE $fn$
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
AS $body$
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
  WHERE idempotency_key = trim(p_idempotency_key);
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
    'obligation_settle', v_settle
  );
END;
$body$;
$fn$;
  ELSE
    -- Live without limit columns: CUT-D-shaped convert + post-settle balance only
    EXECUTE $fn$
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
AS $body$
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
BEGIN
  IF p_owner_user_id IS NULL OR p_store_id IS NULL OR p_points IS NULL OR p_points <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_required');
  END IF;

  SELECT id INTO v_existing_bc
  FROM public.business_cash_ledger
  WHERE idempotency_key = trim(p_idempotency_key);
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
  IF p_expected_rate_version IS DISTINCT FROM v_policy.version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'stale_rate',
      'rate_pesos_per_point', v_policy.rate_pesos_per_point,
      'version', v_policy.version,
      'is_default_rate', (v_policy.rate_pesos_per_point = 1)
    );
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
      'bc_credit_minor', v_credit_minor
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
    'obligation_settle', v_settle
  );
END;
$body$;
$fn$;
  END IF;
END;
$patch$;

REVOKE ALL ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text)
  TO service_role;

COMMIT;
