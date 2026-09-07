-- Coin→Cash conversion policy limits (extend existing canonical policy; no new wallet).
-- AD-P0 / STEP 9. Past conversions keep snapshot rate_version; no retroactive apply.

BEGIN;

ALTER TABLE public.business_cash_conversion_rate_policies
  ADD COLUMN IF NOT EXISTS conversion_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS minimum_coin_per_conversion integer NOT NULL DEFAULT 1
    CHECK (minimum_coin_per_conversion > 0),
  ADD COLUMN IF NOT EXISTS conversion_unit integer NOT NULL DEFAULT 1
    CHECK (conversion_unit > 0),
  ADD COLUMN IF NOT EXISTS maximum_conversions_per_day integer NULL
    CHECK (maximum_conversions_per_day IS NULL OR maximum_conversions_per_day > 0),
  ADD COLUMN IF NOT EXISTS maximum_conversions_per_week integer NULL
    CHECK (maximum_conversions_per_week IS NULL OR maximum_conversions_per_week > 0),
  ADD COLUMN IF NOT EXISTS maximum_conversions_per_month integer NULL
    CHECK (maximum_conversions_per_month IS NULL OR maximum_conversions_per_month > 0),
  ADD COLUMN IF NOT EXISTS minimum_interval_hours integer NULL
    CHECK (minimum_interval_hours IS NULL OR minimum_interval_hours >= 0),
  ADD COLUMN IF NOT EXISTS daily_limit_coin integer NULL
    CHECK (daily_limit_coin IS NULL OR daily_limit_coin > 0),
  ADD COLUMN IF NOT EXISTS monthly_limit_coin integer NULL
    CHECK (monthly_limit_coin IS NULL OR monthly_limit_coin > 0);

ALTER TABLE public.business_cash_conversion_rate_history
  ADD COLUMN IF NOT EXISTS conversion_enabled boolean,
  ADD COLUMN IF NOT EXISTS minimum_coin_per_conversion integer,
  ADD COLUMN IF NOT EXISTS conversion_unit integer,
  ADD COLUMN IF NOT EXISTS maximum_conversions_per_day integer,
  ADD COLUMN IF NOT EXISTS maximum_conversions_per_week integer,
  ADD COLUMN IF NOT EXISTS maximum_conversions_per_month integer,
  ADD COLUMN IF NOT EXISTS minimum_interval_hours integer,
  ADD COLUMN IF NOT EXISTS daily_limit_coin integer,
  ADD COLUMN IF NOT EXISTS monthly_limit_coin integer;

COMMENT ON COLUMN public.business_cash_conversion_rate_policies.minimum_coin_per_conversion IS
  'Minimum Coin units required per conversion request.';
COMMENT ON COLUMN public.business_cash_conversion_rate_policies.conversion_unit IS
  'Coin amount must be a multiple of this unit.';

-- Patch convert RPC: enforce enabled/min/unit/count/interval/coin limits server-side.
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
  v_week_count integer;
  v_month_count integer;
  v_day_coin integer;
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
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'bc_ledger_id', v_existing_bc,
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

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'sp_debited', p_points,
    'bc_credited_minor', v_credit_minor,
    'rate_pesos_per_point', v_policy.rate_pesos_per_point,
    'rate_version', v_policy.version,
    'sp_balance_after', v_sp_bal,
    'bc_balance_after_minor', v_bc_bal,
    'sp_ledger_id', v_sp_ledger,
    'bc_ledger_id', v_bc_ledger,
    'obligation_settle', v_settle
  );
END;
$$;

REVOKE ALL ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text)
  TO service_role;

COMMIT;
