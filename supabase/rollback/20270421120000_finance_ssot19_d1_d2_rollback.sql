-- ROLLBACK for DIBAY Finance SSOT-19 D2 + D1 (apply in this order AFTER the D3 rollback file).
-- Restores the pre-SSOT-19 state exactly: replaced functions get their previous bodies
-- (latest definition in supabase/migrations before 20270421120000 = production body),
-- new functions/triggers/constraints are removed, member policies and legacy grants come back.
-- Data written while SSOT-19 was live (refund rows, REFUNDED fundings, audit rows) is NOT touched.

BEGIN;

-- D2: new functions
DROP FUNCTION IF EXISTS public.refund_post_ad_points(uuid, uuid, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.business_cash_delivery_ad_refund_orphan_draft(uuid, uuid, text, text);

-- D2: replaced functions -> previous definitions

-- approve_user_point_charge_request: from 20261027120000_community_dpoint_financial_writer.sql
CREATE OR REPLACE FUNCTION public.approve_user_point_charge_request(
  p_request_id uuid,
  p_admin_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_sum integer;
  v_new_balance integer;
  v_cache integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_req
    FROM public.point_charge_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.request_status NOT IN ('pending', 'waiting_confirm', 'on_hold') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END IF;

  SELECT points INTO v_cache
    FROM public.profiles
   WHERE id = v_req.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_sum := public.sum_user_point_ledger(v_req.user_id);
  IF COALESCE(v_cache, 0) IS DISTINCT FROM v_sum THEN
    PERFORM public.project_user_point_balance_from_ledger(v_req.user_id);
    v_sum := public.sum_user_point_ledger(v_req.user_id);
  END IF;

  v_new_balance := v_sum + GREATEST(0, v_req.point_amount);

  UPDATE public.point_charge_requests
     SET request_status = 'approved',
         approved_at = now(),
         approved_by = p_admin_user_id,
         processed_at = now(),
         processed_by = p_admin_user_id,
         updated_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.point_ledger (
    user_id, entry_type, amount, balance_after,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_req.user_id,
    'charge',
    v_req.point_amount,
    v_new_balance,
    'point_charge',
    p_request_id::text,
    '포인트 충전 승인',
    'admin'
  );

  v_new_balance := public.project_user_point_balance_from_ledger(v_req.user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'balance_after', v_new_balance,
    'user_id', v_req.user_id,
    'point_amount', v_req.point_amount
  );
END;
$$;
REVOKE ALL ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) TO service_role;

-- credit_coin_from_confirmed_sale: from 20261202110000_currency_cut_c_sale_coin_ssot.sql
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
REVOKE ALL ON FUNCTION public.credit_coin_from_confirmed_sale(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coin_from_confirmed_sale(uuid, uuid, uuid, integer, text) TO service_role;

-- coin_withdrawal_request: from 20261202000000_currency_coin_ssot_cut2.sql
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

-- coin_withdrawal_mark_paid: from 20261202000000_currency_coin_ssot_cut2.sql
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

-- convert_store_economic_points_to_business_cash: from 20270118130000_finance_f03_conversion_policy_limits_apply.sql
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
    'obligation_settle', v_settle,
    'minimum_coin', COALESCE(v_policy.minimum_coin_per_conversion, 1),
    'conversion_unit', COALESCE(v_policy.conversion_unit, 1)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text) TO service_role;

-- owner_delivery_ad_transition: from 20261201210000_delivery_ads_pre3b_owner_transition_durable.sql
CREATE OR REPLACE FUNCTION public.owner_delivery_ad_transition(
  p_owner_user_id uuid,
  p_product_kind text,
  p_campaign_id uuid,
  p_action text,
  p_expected_lifecycle text,
  p_audit_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_from text;
  v_to text;
  v_is_active boolean;
  v_now timestamptz := now();
  v_audit_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF p_owner_user_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  IF p_action NOT IN ('submit', 'resubmit', 'pause', 'resume', 'end') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  IF p_expected_lifecycle IS NULL OR length(trim(p_expected_lifecycle)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_lifecycle');
  END IF;

  IF p_audit_action IS NULL OR length(trim(p_audit_action)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  -- Lock + ownership (trusted caller = service_role after TS Owner gate)
  IF p_product_kind = 'banner' THEN
    SELECT * INTO v_row
    FROM public.store_banner_ad_campaigns
    WHERE id = p_campaign_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_row
    FROM public.store_paid_ad_campaigns
    WHERE id = p_campaign_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;

  IF v_row.owner_user_id IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_from := v_row.lifecycle_status;

  -- CAS: expected lifecycle must match locked row
  IF v_from IS DISTINCT FROM p_expected_lifecycle THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_lifecycle', 'current', v_from);
  END IF;

  -- Resolve target from Owner action (mirrors ownerActionTargetLifecycle)
  IF p_action IN ('submit', 'resubmit') THEN
    v_to := 'SUBMITTED';
  ELSIF p_action = 'pause' THEN
    v_to := 'PAUSED_OWNER';
  ELSIF p_action = 'resume' THEN
    v_to := 'ACTIVE';
  ELSIF p_action = 'end' THEN
    v_to := 'ENDED';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  -- Owner allowlist (mirrors delivery-ad-lifecycle OWNER edges). PAUSED_ADMIN resume blocked.
  IF NOT (
    (v_from = 'DRAFT' AND v_to = 'SUBMITTED') OR
    (v_from = 'CHANGES_REQUESTED' AND v_to = 'SUBMITTED') OR
    (v_from = 'ACTIVE' AND v_to = 'PAUSED_OWNER') OR
    (v_from = 'PAUSED_OWNER' AND v_to = 'ACTIVE') OR
    (v_from = 'PAUSED_OWNER' AND v_to = 'ENDED') OR
    (v_from = 'ACTIVE' AND v_to = 'ENDED')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', v_to);
  END IF;

  -- Sponsored resume: end_at must still be in the future (existing TS semantics)
  IF p_product_kind = 'store_sponsored' AND v_from = 'PAUSED_OWNER' AND v_to = 'ACTIVE' THEN
    IF v_row.end_at IS NULL OR v_row.end_at <= v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', v_to);
    END IF;
  END IF;

  v_is_active := (v_to IN ('ACTIVE', 'SCHEDULED'));

  IF p_product_kind = 'banner' THEN
    v_before := jsonb_build_object('lifecycle', v_from);
  ELSE
    v_before := jsonb_build_object(
      'lifecycle_status', v_from,
      'review_status', v_row.review_status
    );
  END IF;

  IF p_product_kind = 'banner' THEN
    -- Banner field patches mirror prior owner-banner-writer transition (no resume timestamp clear)
    UPDATE public.store_banner_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      review_status = CASE
        WHEN v_to = 'SUBMITTED' THEN 'PENDING'
        ELSE review_status
      END,
      submitted_at = CASE
        WHEN v_to = 'SUBMITTED' THEN v_now
        ELSE submitted_at
      END,
      paused_at = CASE
        WHEN v_to = 'PAUSED_OWNER' THEN v_now
        ELSE paused_at
      END,
      ended_at = CASE
        WHEN v_to = 'ENDED' THEN v_now
        ELSE ended_at
      END,
      updated_by_user_id = p_owner_user_id,
      updated_at = v_now
    WHERE id = p_campaign_id;

    IF p_action IN ('submit', 'resubmit') AND v_row.creative_id IS NOT NULL THEN
      UPDATE public.delivery_ad_creatives
      SET review_status = 'PENDING', updated_at = v_now
      WHERE id = v_row.creative_id;
    END IF;
  ELSE
    UPDATE public.store_paid_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = CASE WHEN v_to = 'ENDED' THEN false ELSE v_is_active END,
      review_status = CASE
        WHEN v_to = 'SUBMITTED' THEN 'PENDING'
        ELSE review_status
      END,
      submitted_at = CASE
        WHEN v_to = 'SUBMITTED' THEN v_now
        ELSE submitted_at
      END,
      paused_at = CASE
        WHEN v_to = 'PAUSED_OWNER' THEN v_now
        WHEN v_from = 'PAUSED_OWNER' AND v_to = 'ACTIVE' THEN NULL
        ELSE paused_at
      END,
      activated_at = CASE
        WHEN v_from = 'PAUSED_OWNER' AND v_to = 'ACTIVE' THEN v_now
        ELSE activated_at
      END,
      ended_at = CASE
        WHEN v_to = 'ENDED' THEN v_now
        ELSE ended_at
      END,
      updated_by_user_id = p_owner_user_id,
      updated_at = v_now
    WHERE id = p_campaign_id;
  END IF;

  IF p_product_kind = 'banner' THEN
    v_after := jsonb_build_object('lifecycle', v_to);
  ELSE
    v_after := jsonb_build_object(
      'lifecycle_status', v_to,
      'review_status', CASE WHEN v_to = 'SUBMITTED' THEN 'PENDING' ELSE v_row.review_status END
    );
  END IF;

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, reason, before_json, after_json
  ) VALUES (
    p_product_kind,
    p_campaign_id,
    'owner',
    p_owner_user_id,
    p_audit_action,
    NULL,
    v_before,
    v_after
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'from', v_from,
    'to', v_to,
    'action', p_action,
    'audit_id', v_audit_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;
REVOKE ALL ON FUNCTION public.owner_delivery_ad_transition(uuid, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_delivery_ad_transition(uuid, text, uuid, text, text, text) TO service_role;

-- gift_certificate_redemption_reverse: from 20270117140000_gift_one_time_full_consumption.sql
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

    -- Restore redeemed + forfeited face (one-time extinguish reversed on cancel).
    v_restored := least(
      v_inst.face_value,
      v_inst.remaining_balance
        + v_red.redeemed_amount
        + coalesce(v_red.forfeited_amount, 0)
    );
    IF v_restored = v_inst.face_value THEN
      v_new_status := 'ACTIVE';
    ELSIF v_restored > 0 THEN
      -- Historical compat only (new redeem path never leaves PARTIALLY_REDEEMED).
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

    IF coalesce(v_red.forfeited_amount, 0) > 0 THEN
      INSERT INTO public.gift_certificate_ledger (
        instance_id, store_id, user_id, entry_type, amount,
        related_type, related_id, description, actor_type
      ) VALUES (
        v_red.instance_id, v_red.store_id, v_red.buyer_user_id, 'FORFEIT_REVERSE',
        v_red.forfeited_amount,
        'gift_certificate_redemption_reverse', v_red.id::text,
        'Forfeiture reversed', 'system'
      );
    END IF;

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
REVOKE ALL ON FUNCTION public.gift_certificate_redemption_reverse(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_redemption_reverse(uuid) TO service_role;

-- create_store_order_atomic: from 20270117140000_gift_one_time_full_consumption.sql
CREATE OR REPLACE FUNCTION public.create_store_order_atomic(p_buyer_user_id uuid, p_store_id uuid, p_client_order_key text, p_order jsonb, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_client_order_key, '')), '');
  v_existing record;
  v_store record;
  v_line jsonb;
  v_product record;
  v_product_id uuid;
  v_qty integer;
  v_title text;
  v_unit numeric;
  v_subtotal numeric;
  v_options jsonb;
  v_base numeric;
  v_opt_delta numeric;
  v_expected_options jsonb;
  v_live_base numeric;
  v_price numeric;
  v_disc numeric;
  v_new_stock integer;
  v_order_id uuid;
  v_order_no text;
  v_payment_amount numeric;
  v_item_id uuid;
  v_opt jsonb;
  v_sold_out jsonb := '[]'::jsonb;
  v_line_count integer := 0;
  v_event_id uuid;
  v_result jsonb;
  v_track boolean;
  v_coupon_id uuid;
  v_user_coupon_id uuid;
  v_discount numeric;
  v_amount_before_gift integer := 0;
  v_gift_total integer := 0;
  v_gift_ids jsonb := '[]'::jsonb;
  v_gift_id uuid;
  v_gift_inst public.gift_certificate_instances%ROWTYPE;
  v_gift_fee_rate integer;
  v_gift_fee integer;
  v_gift_merchant integer;
  v_gift_redemption_id uuid;
  v_gift_remaining integer;
  v_gift_status text;
  v_gift_due integer;
  v_gift_count integer := 0;
  v_gift_forfeited integer := 0;
  v_campaign record;
  v_entitlement record;
  v_store_funded numeric := 0;
  v_platform_funded numeric := 0;
  v_commission_base numeric := 0;
  v_items_subtotal numeric := 0;
  v_delivery_fee_auth numeric := 0;
  v_payload_delivery_fee numeric := 0;
  v_payload_total numeric := 0;
  v_payload_payment numeric := 0;
  v_payload_discount numeric := 0;
  v_discount_auth numeric := 0;
  v_min_order_php numeric := NULL;
  v_hours jsonb;
  v_fulfillment text;
  v_auth_total numeric := 0;
  v_pct numeric;
BEGIN
  IF p_buyer_user_id IS NULL OR p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_ids', 'http_status', 400);
  END IF;

  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_order_payload', 'http_status', 400);
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_and_items_required', 'http_status', 400);
  END IF;

  -- Idempotency: serialize same buyer+key, then return existing if present
  IF v_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext(p_buyer_user_id::text || chr(1) || v_key)
    );
    SELECT id, order_no, payment_amount
      INTO v_existing
      FROM public.store_orders
     WHERE buyer_user_id = p_buyer_user_id
       AND client_order_key = v_key
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'order', jsonb_build_object(
          'id', v_existing.id,
          'order_no', coalesce(v_existing.order_no, ''),
          'payment_amount', coalesce(v_existing.payment_amount, 0)
        ),
        'sold_out_products', '[]'::jsonb,
        'order_created_event_id', null
      );
    END IF;
  END IF;

  -- Store authority lock + revalidation (TOCTOU)
  SELECT
    id,
    owner_user_id,
    approval_status,
    is_visible,
    is_open,
    point_commerce_blocked,
    store_name,
    business_hours_json
  INTO v_store
  FROM public.stores
  WHERE id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_unavailable', 'http_status', 400);
  END IF;

  IF v_store.approval_status IS DISTINCT FROM 'approved' OR v_store.is_visible IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_unavailable', 'http_status', 400);
  END IF;

  IF v_store.is_open IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_closed', 'http_status', 400);
  END IF;

  IF coalesce(v_store.point_commerce_blocked, false) IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_point_blocked', 'http_status', 400);
  END IF;

  IF to_regclass('public.store_sales_permissions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.store_sales_permissions sp
      WHERE sp.store_id = p_store_id
        AND sp.allowed_to_sell IS TRUE
        AND sp.sales_status = 'approved'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'store_not_selling', 'http_status', 400);
    END IF;
  END IF;

  -- Pass 1: lock products + revalidate (no stock mutation yet)
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_count := v_line_count + 1;
    BEGIN
      v_product_id := nullif(btrim(coalesce(v_line->>'product_id', '')), '')::uuid;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_product', 'http_status', 400);
    END;
    IF v_product_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_product', 'http_status', 400);
    END IF;

    v_qty := floor(coalesce((v_line->>'qty')::numeric, 0));
    IF v_qty < 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_line', 'http_status', 400);
    END IF;

    v_unit := coalesce((v_line->>'unit')::numeric, -1);
    v_base := coalesce((v_line->>'base_unit_after_discount')::numeric, -1);
    v_opt_delta := coalesce((v_line->>'unit_options_delta')::numeric, 0);
    v_expected_options := v_line->'expected_options_json';

    SELECT
      id,
      store_id,
      price,
      discount_price,
      stock_qty,
      track_inventory,
      product_status,
      options_json
    INTO v_product
    FROM public.store_products
    WHERE id = v_product_id
    FOR UPDATE;

    IF NOT FOUND OR v_product.store_id IS DISTINCT FROM p_store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_product', 'http_status', 400);
    END IF;

    IF v_product.product_status = 'sold_out' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'product_sold_out', 'http_status', 400);
    END IF;

    IF v_product.product_status IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'product_not_available', 'http_status', 400);
    END IF;

    IF v_expected_options IS NOT NULL
       AND v_product.options_json IS DISTINCT FROM v_expected_options THEN
      RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
    END IF;

    v_price := coalesce(v_product.price, 0)::numeric;
    v_disc := v_product.discount_price;
    IF v_disc IS NOT NULL
       AND v_disc::numeric >= 0
       AND v_disc::numeric < v_price THEN
      v_live_base := v_disc::numeric;
    ELSE
      v_live_base := v_price;
    END IF;

    IF abs(v_live_base - v_base) >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
    END IF;

    IF abs((v_live_base + v_opt_delta) - v_unit) >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
    END IF;

    -- ROOT A: line money from verified unit (not client subtotal trust)
    v_subtotal := round(v_unit * v_qty);
    IF v_line ? 'subtotal'
       AND abs(coalesce((v_line->>'subtotal')::numeric, -1) - v_subtotal) >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
    END IF;
    v_items_subtotal := v_items_subtotal + v_subtotal;

    IF coalesce(v_product.track_inventory, false) IS TRUE
       AND coalesce(v_product.stock_qty, 0) < v_qty THEN
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_stock', 'http_status', 409);
    END IF;
  END LOOP;

  -- CUT-1: store min_order_php authority
  -- App contract (validateStoreOrderCheckout): items subtotal only (before delivery fee /
  -- coupon / gift). null/<=0 min = no constraint. Equal-to-min ALLOW; below REJECT.
  v_hours := coalesce(v_store.business_hours_json, '{}'::jsonb);
  BEGIN
    v_min_order_php := round(coalesce(
      (v_hours->>'min_order_php')::numeric,
      (v_hours->>'minOrderPhp')::numeric
    ));
  EXCEPTION WHEN others THEN
    v_min_order_php := NULL;
  END;
  IF v_min_order_php IS NOT NULL AND v_min_order_php > 0
     AND round(v_items_subtotal) < v_min_order_php THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'below_min_order',
      'http_status', 400,
      'min_order_php', v_min_order_php
    );
  END IF;

  -- Stores A: coupon authority lock + redemption exclusivity (same TX as order)
  -- CUT-2: discount_amount is NOT authoritative; recompute from campaign after lock.
  v_payload_discount := round(coalesce((p_order->>'discount_amount')::numeric, 0));
  v_discount := 0;
  v_coupon_id := NULL;
  v_user_coupon_id := NULL;
  IF nullif(btrim(coalesce(p_order->>'user_coupon_id', '')), '') IS NOT NULL THEN
    BEGIN
      v_user_coupon_id := (p_order->>'user_coupon_id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'coupon_not_found', 'http_status', 400);
    END;
  END IF;
  IF nullif(btrim(coalesce(p_order->>'coupon_campaign_id', '')), '') IS NOT NULL THEN
    BEGIN
      v_coupon_id := (p_order->>'coupon_campaign_id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'coupon_not_found', 'http_status', 400);
    END;
  END IF;

  IF v_payload_discount > 0 AND (v_coupon_id IS NULL OR v_user_coupon_id IS NULL) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE
        WHEN v_coupon_id IS NULL THEN 'coupon_required_for_discount'
        ELSE 'coupon_entitlement_required'
      END,
      'http_status', 400
    );
  END IF;

  IF v_coupon_id IS NOT NULL THEN
    -- Canonical: Coupon Instance required — campaign-only checkout DELETED
    IF v_user_coupon_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_entitlement_required', 'http_status', 400);
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtext(p_buyer_user_id::text || chr(1) || 'coupon' || chr(1) || v_coupon_id::text)
    );

    SELECT
      id,
      store_id,
      discount_type,
      discount_value,
      min_order_amount,
      max_discount,
      start_at,
      end_at,
      is_active,
      lifecycle_state
    INTO v_campaign
    FROM public.store_coupon_campaigns
    WHERE id = v_coupon_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_not_found', 'http_status', 404);
    END IF;

    IF v_campaign.store_id IS DISTINCT FROM p_store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_wrong_store', 'http_status', 400);
    END IF;

    SELECT *
      INTO v_entitlement
      FROM public.coupon_user_entitlements
     WHERE id = v_user_coupon_id
       AND buyer_user_id = p_buyer_user_id
       AND campaign_id = v_coupon_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_not_found', 'http_status', 404);
    END IF;
    IF v_entitlement.status NOT IN ('available', 'restored') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_already_redeemed', 'http_status', 409);
    END IF;
    IF v_entitlement.expires_at <= clock_timestamp() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_expired', 'http_status', 400);
    END IF;
    IF v_campaign.lifecycle_state = 'revoked' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'COUPON_REVOKED', 'http_status', 400);
    END IF;

    -- Coupon min_order on item gross (same as resolveStoreCouponEligibility itemGrossPhp)
    IF v_campaign.min_order_amount IS NOT NULL
       AND v_campaign.min_order_amount > 0
       AND floor(v_items_subtotal) < floor(v_campaign.min_order_amount) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'coupon_min_order',
        'http_status', 400,
        'min_order_amount', floor(v_campaign.min_order_amount)
      );
    END IF;

    -- Authoritative discount = computeCouponDiscountPhp / computeStoreCouponDiscountPhp
    IF v_campaign.discount_type = 'percent' THEN
      v_pct := least(100::numeric, greatest(0::numeric, coalesce(v_campaign.discount_value, 0)));
      v_discount_auth := least(
        floor(v_items_subtotal),
        floor(floor(v_items_subtotal) * v_pct / 100)
      );
      IF v_campaign.max_discount IS NOT NULL AND v_campaign.max_discount > 0 THEN
        v_discount_auth := least(v_discount_auth, floor(v_campaign.max_discount));
      END IF;
    ELSIF v_campaign.discount_type = 'fixed_amount' THEN
      v_discount_auth := least(
        floor(v_items_subtotal),
        floor(coalesce(v_campaign.discount_value, 0))
      );
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_discount', 'http_status', 400);
    END IF;

    IF v_discount_auth <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_discount', 'http_status', 400);
    END IF;

    -- Fail-closed on payload mismatch (inflate AND shrink)
    IF abs(v_payload_discount - v_discount_auth) >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_discount', 'http_status', 400);
    END IF;

    v_discount := round(v_discount_auth);
  ELSIF v_payload_discount <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_discount', 'http_status', 400);
  END IF;


  -- Gift Certificate: parse instance ids (max 1). Amounts computed server-side.
  v_gift_ids := coalesce(p_order->'gift_instance_ids', '[]'::jsonb);
  IF jsonb_typeof(v_gift_ids) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_gift_instance_ids', 'http_status', 400);
  END IF;
  IF jsonb_array_length(v_gift_ids) > 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gift_max_one_per_order', 'http_status', 400);
  END IF;

  -- ROOT A: authoritative items + delivery fee; fail-closed on payload mismatch
  -- v_discount already authoritative (0 or campaign-recomputed)
  v_fulfillment := coalesce(nullif(btrim(p_order->>'fulfillment_type'), ''), 'pickup');
  v_delivery_fee_auth := public.store_charged_delivery_fee_php(
    v_store.business_hours_json,
    v_items_subtotal,
    v_fulfillment
  );
  v_payload_delivery_fee := round(coalesce((p_order->>'delivery_fee_amount')::numeric, 0));
  IF abs(v_payload_delivery_fee - v_delivery_fee_auth) >= 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
  END IF;

  v_auth_total := round(v_items_subtotal + v_delivery_fee_auth);
  v_payload_total := round(coalesce((p_order->>'total_amount')::numeric, 0));
  IF abs(v_payload_total - v_auth_total) >= 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
  END IF;

  v_amount_before_gift := greatest(0, round(v_auth_total - v_discount)::integer);
  IF nullif(btrim(coalesce(p_order->>'amount_before_gift', '')), '') IS NOT NULL THEN
    IF abs(round((p_order->>'amount_before_gift')::numeric) - v_amount_before_gift) >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
    END IF;
  END IF;

  v_gift_due := v_amount_before_gift;
  IF jsonb_array_length(v_gift_ids) = 1 THEN
    BEGIN
      v_gift_id := (v_gift_ids->>0)::uuid;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_gift_instance_id', 'http_status', 400);
    END;
    SELECT * INTO v_gift_inst
      FROM public.gift_certificate_instances
     WHERE id = v_gift_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_instance_not_found', 'http_status', 400);
    END IF;
    IF v_gift_inst.current_owner_user_id IS DISTINCT FROM p_buyer_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_not_owner', 'http_status', 403);
    END IF;
    IF NOT public.gift_certificate_instance_allows_checkout_store(
         coalesce(v_gift_inst.gift_scope, 'STORE'),
         v_gift_inst.store_id,
         p_store_id
       ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_store_mismatch', 'http_status', 400);
    END IF;
    IF v_gift_inst.status IS DISTINCT FROM 'ACTIVE' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_invalid_status', 'http_status', 400);
    END IF;
    IF coalesce(v_gift_inst.remaining_balance, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_insufficient_remaining', 'http_status', 400);
    END IF;
    v_gift_total := least(v_gift_due, v_gift_inst.remaining_balance);
    v_gift_count := 1;
  END IF;

  -- ROOT A: payment authority before mutate (fail-closed; no partial order)
  v_payload_payment := round(coalesce((p_order->>'payment_amount')::numeric, 0));
  IF v_gift_count > 0 THEN
    v_payment_amount := greatest(0, v_amount_before_gift - v_gift_total);
  ELSE
    v_payment_amount := v_amount_before_gift;
    v_gift_total := 0;
  END IF;
  IF abs(v_payload_payment - v_payment_amount) >= 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
  END IF;

  -- Pass 2+: mutate inside subtransaction (unique_violation rolls back all mutations)
  BEGIN
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      v_product_id := (v_line->>'product_id')::uuid;
      v_qty := floor((v_line->>'qty')::numeric);
      v_title := coalesce(v_line->>'title', '');

      SELECT coalesce(track_inventory, false)
        INTO v_track
        FROM public.store_products
       WHERE id = v_product_id;

      IF v_track IS TRUE THEN
        UPDATE public.store_products
           SET stock_qty = stock_qty - v_qty,
               product_status = CASE
                 WHEN stock_qty - v_qty <= 0 THEN 'sold_out'
                 ELSE product_status
               END
         WHERE id = v_product_id
           AND coalesce(track_inventory, false) IS TRUE
           AND stock_qty >= v_qty
        RETURNING stock_qty INTO v_new_stock;

        IF NOT FOUND THEN
          -- Concurrent race after pass-1; abort mutations via exception semantics
          RAISE EXCEPTION 'insufficient_stock'
            USING ERRCODE = 'P0001';
        END IF;

        IF v_new_stock <= 0 THEN
          v_sold_out := v_sold_out || jsonb_build_array(
            jsonb_build_object(
              'productId', v_product_id,
              'productTitle', nullif(btrim(v_title), '')
            )
          );
        END IF;
      END IF;
    END LOOP;

    v_order_no := coalesce(
      nullif(btrim(p_order->>'order_no'), ''),
      'SO' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
    );
    -- payment_amount already authoritative (asserted before Pass 2)
    v_store_funded := round(coalesce((p_order->>'store_funded_amount')::numeric, 0));
    v_platform_funded := round(coalesce((p_order->>'platform_funded_amount')::numeric, 0));
    v_commission_base := round(coalesce((p_order->>'commission_base_amount')::numeric, v_payment_amount + v_discount));

    INSERT INTO public.store_orders (
      order_no,
      buyer_user_id,
      store_id,
      total_amount,
      discount_amount,
      payment_amount,
      delivery_fee_amount,
      delivery_courier_label,
      payment_status,
      order_status,
      fulfillment_type,
      buyer_note,
      buyer_phone,
      buyer_payment_method,
      buyer_payment_method_detail,
      delivery_address_summary,
      delivery_address_detail,
      delivery_region,
      delivery_city,
      delivery_place_id,
      delivery_formatted_address,
      delivery_detail_address,
      delivery_note,
      delivery_latitude,
      delivery_longitude,
      delivery_user_address_id,
      client_order_key,
      checkout_prep_minutes,
      checkout_ride_minutes,
      checkout_eta_minutes,
      checkout_eta_computed_at,
      checkout_route_distance_meters,
      checkout_straight_distance_meters,
      coupon_campaign_id,
      user_coupon_id,
      store_funded_amount,
      platform_funded_amount,
      commission_base_amount,
      amount_before_gift,
      gift_redemption_amount
    )
    VALUES (
      v_order_no,
      p_buyer_user_id,
      p_store_id,
      round(v_auth_total),
      round(v_discount),
      round(v_payment_amount),
      round(v_delivery_fee_auth),
      nullif(p_order->>'delivery_courier_label', ''),
      coalesce(nullif(p_order->>'payment_status', ''), 'paid'),
      'pending',
      coalesce(nullif(p_order->>'fulfillment_type', ''), 'pickup'),
      nullif(p_order->>'buyer_note', ''),
      nullif(p_order->>'buyer_phone', ''),
      nullif(p_order->>'buyer_payment_method', ''),
      nullif(p_order->>'buyer_payment_method_detail', ''),
      nullif(p_order->>'delivery_address_summary', ''),
      nullif(p_order->>'delivery_address_detail', ''),
      nullif(p_order->>'delivery_region', ''),
      nullif(p_order->>'delivery_city', ''),
      nullif(p_order->>'delivery_place_id', ''),
      nullif(p_order->>'delivery_formatted_address', ''),
      nullif(p_order->>'delivery_detail_address', ''),
      nullif(p_order->>'delivery_note', ''),
      CASE WHEN p_order ? 'delivery_latitude' AND p_order->>'delivery_latitude' IS NOT NULL
        THEN (p_order->>'delivery_latitude')::double precision ELSE NULL END,
      CASE WHEN p_order ? 'delivery_longitude' AND p_order->>'delivery_longitude' IS NOT NULL
        THEN (p_order->>'delivery_longitude')::double precision ELSE NULL END,
      CASE WHEN nullif(p_order->>'delivery_user_address_id', '') IS NOT NULL
        THEN (p_order->>'delivery_user_address_id')::uuid ELSE NULL END,
      v_key,
      CASE WHEN p_order ? 'checkout_prep_minutes' THEN (p_order->>'checkout_prep_minutes')::integer ELSE NULL END,
      CASE WHEN p_order ? 'checkout_ride_minutes' THEN (p_order->>'checkout_ride_minutes')::integer ELSE NULL END,
      CASE WHEN p_order ? 'checkout_eta_minutes' THEN (p_order->>'checkout_eta_minutes')::integer ELSE NULL END,
      CASE WHEN nullif(p_order->>'checkout_eta_computed_at', '') IS NOT NULL
        THEN (p_order->>'checkout_eta_computed_at')::timestamptz ELSE NULL END,
      CASE WHEN p_order ? 'checkout_route_distance_meters'
        THEN (p_order->>'checkout_route_distance_meters')::integer ELSE NULL END,
      CASE WHEN p_order ? 'checkout_straight_distance_meters'
        THEN (p_order->>'checkout_straight_distance_meters')::integer ELSE NULL END,
      v_coupon_id,
      v_user_coupon_id,
      v_store_funded,
      v_platform_funded,
      v_commission_base,
      v_amount_before_gift,
      v_gift_total
    )
    RETURNING id INTO v_order_id;

    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      v_product_id := (v_line->>'product_id')::uuid;
      v_qty := floor((v_line->>'qty')::numeric);
      v_title := coalesce(v_line->>'title', '');
      v_unit := (v_line->>'unit')::numeric;
      v_subtotal := (v_line->>'subtotal')::numeric;
      v_base := (v_line->>'base_unit_after_discount')::numeric;
      v_opt_delta := coalesce((v_line->>'unit_options_delta')::numeric, 0);
      v_options := coalesce(v_line->'options_snapshot', '{}'::jsonb);

      INSERT INTO public.store_order_items (
        order_id,
        product_id,
        product_title_snapshot,
        price_snapshot,
        qty,
        subtotal,
        options_snapshot_json,
        base_price_snapshot,
        options_unit_delta_snapshot
      )
      VALUES (
        v_order_id,
        v_product_id,
        v_title,
        round(v_unit),
        v_qty,
        round(v_subtotal),
        v_options,
        round(v_base),
        round(v_opt_delta)
      )
      RETURNING id INTO v_item_id;

      IF coalesce((v_options->>'v')::int, 0) = 2 AND jsonb_typeof(v_options->'groups') = 'array' THEN
        FOR v_opt IN
          SELECT jsonb_build_object(
            'group_label', g->>'label',
            'name', ln->>'name',
            'price_delta_each', ln->>'price_delta_each',
            'qty', ln->>'qty',
            'line_extra', ln->>'line_extra'
          )
          FROM jsonb_array_elements(v_options->'groups') AS g
          CROSS JOIN LATERAL jsonb_array_elements(coalesce(g->'lines', '[]'::jsonb)) AS ln
        LOOP
          INSERT INTO public.store_order_item_options (
            order_item_id,
            option_group_name_snapshot,
            option_item_name_snapshot,
            price_delta_snapshot,
            quantity,
            line_extra_total
          )
          VALUES (
            v_item_id,
            coalesce(v_opt->>'group_label', ''),
            coalesce(v_opt->>'name', ''),
            round(coalesce((v_opt->>'price_delta_each')::numeric, 0)),
            greatest(1, floor(coalesce((v_opt->>'qty')::numeric, 1))),
            round(coalesce((v_opt->>'line_extra')::numeric, 0))
          );
        END LOOP;
      END IF;
    END LOOP;

    BEGIN
      INSERT INTO public.store_order_events (
        order_id,
        store_id,
        actor_user_id,
        actor_role,
        event_type,
        from_status,
        to_status,
        dedupe_key,
        metadata
      )
      VALUES (
        v_order_id,
        p_store_id,
        p_buyer_user_id,
        'buyer',
        'order_created',
        NULL,
        'pending',
        v_order_id::text || ':order_created',
        jsonb_build_object(
          'order_no', v_order_no,
          'payment_amount', round(v_payment_amount),
          'line_count', v_line_count,
          'fulfillment_type', coalesce(p_order->>'fulfillment_type', 'pickup'),
          'source', 'create_store_order_atomic'
        )
      )
      RETURNING id INTO v_event_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT id INTO v_event_id
          FROM public.store_order_events
         WHERE dedupe_key = v_order_id::text || ':order_created'
         LIMIT 1;
    END;

    IF v_coupon_id IS NOT NULL THEN
      INSERT INTO public.store_coupon_redemptions (
        campaign_id,
        store_id,
        buyer_user_id,
        order_id,
        discount_amount_applied,
        user_coupon_id
      )
      VALUES (
        v_coupon_id,
        p_store_id,
        p_buyer_user_id,
        v_order_id,
        v_discount,
        v_user_coupon_id
      );

      IF v_user_coupon_id IS NOT NULL THEN
        UPDATE public.coupon_user_entitlements
           SET status = 'redeemed',
               redeemed_order_id = v_order_id,
               updated_at = now()
         WHERE id = v_user_coupon_id
           AND status IN ('available', 'restored');
        IF NOT FOUND THEN
          RAISE EXCEPTION 'coupon_already_redeemed'
            USING ERRCODE = '23505';
        END IF;
        UPDATE public.store_coupon_campaigns
           SET reserved_spend_php = GREATEST(0, reserved_spend_php - v_entitlement.reserved_php)
         WHERE id = v_coupon_id;
      END IF;
    END IF;


    -- Gift redeem in same TX as order (after order_id exists)
    IF v_gift_count = 1 AND v_gift_total > 0 THEN
      SELECT * INTO v_gift_inst
        FROM public.gift_certificate_instances
       WHERE id = v_gift_id
       FOR UPDATE;
      IF NOT FOUND OR v_gift_inst.remaining_balance < v_gift_total
         OR v_gift_inst.current_owner_user_id IS DISTINCT FROM p_buyer_user_id
         OR v_gift_inst.status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'gift_redeem_invariant_failed';
      END IF;

      -- Live-compat gift fee (pre-unapplied fee-snapshot helper).
      -- Use gift_certificate_products.platform_fee_rate until fee-snapshot helper is live.
      SELECT platform_fee_rate INTO v_gift_fee_rate
        FROM public.gift_certificate_products
       WHERE id = v_gift_inst.product_id;
      v_gift_fee_rate := coalesce(v_gift_fee_rate, 0);
      v_gift_fee := floor(v_gift_total::numeric * v_gift_fee_rate / 100)::integer;
      v_gift_merchant := v_gift_total - v_gift_fee;
      v_gift_redemption_id := gen_random_uuid();

      -- One-time full consumption: unused face value is forfeited (not merchant revenue).
      v_gift_forfeited := greatest(0, v_gift_inst.remaining_balance - v_gift_total);

      INSERT INTO public.gift_certificate_redemptions (
        id, order_id, instance_id, store_id, buyer_user_id,
        redeemed_amount, platform_fee_amount, merchant_net_amount,
        platform_fee_rate_snapshot, forfeited_amount, reversed, idempotency_key
      ) VALUES (
        v_gift_redemption_id, v_order_id, v_gift_id, p_store_id, p_buyer_user_id,
        v_gift_total, v_gift_fee, v_gift_merchant, v_gift_fee_rate, v_gift_forfeited, false,
        'order:' || v_order_id::text || ':gift:1'
      );

      v_gift_remaining := 0;
      v_gift_status := 'FULLY_REDEEMED';

      UPDATE public.gift_certificate_instances
         SET remaining_balance = v_gift_remaining,
             status = v_gift_status,
             version = version + 1,
             fully_redeemed_at = now()
       WHERE id = v_gift_id;

      INSERT INTO public.gift_certificate_ledger (
        instance_id, store_id, user_id, entry_type, amount,
        related_type, related_id, description, actor_type
      ) VALUES (
        v_gift_id, p_store_id, p_buyer_user_id, 'REDEEM', -v_gift_total,
        'gift_certificate_redemption', v_gift_redemption_id::text, 'Redeemed against order', 'user'
      );

      IF v_gift_forfeited > 0 THEN
        INSERT INTO public.gift_certificate_ledger (
          instance_id, store_id, user_id, entry_type, amount,
          related_type, related_id, description, actor_type
        ) VALUES (
          v_gift_id, p_store_id, p_buyer_user_id, 'FORFEIT', -v_gift_forfeited,
          'gift_certificate_redemption', v_gift_redemption_id::text,
          'Unused face value extinguished at one-time redeem (not merchant revenue)', 'system'
        );
      END IF;

      INSERT INTO public.gift_certificate_revenue_ledger (
        store_id, redemption_id, entry_type, amount, related_type, related_id
      ) VALUES (
        p_store_id, v_gift_redemption_id, 'REVENUE_CREATE', v_gift_merchant,
        'redemption', v_gift_redemption_id::text
      );

    END IF;

    v_result := jsonb_build_object(
      'ok', true,
      'idempotent', false,
      'order', jsonb_build_object(
        'id', v_order_id,
        'order_no', v_order_no,
        'payment_amount', round(v_payment_amount)
      ),
      'sold_out_products', v_sold_out,
      'order_created_event_id', v_event_id,
      'store_name', v_store.store_name,
      'owner_user_id', v_store.owner_user_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- Subtransaction rolled back: order+items+stock+redemption undone together.
      IF v_coupon_id IS NOT NULL AND EXISTS (
        SELECT 1
          FROM public.store_coupon_redemptions r
         WHERE r.buyer_user_id = p_buyer_user_id
           AND r.campaign_id = v_coupon_id
      ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'coupon_already_redeemed', 'http_status', 409);
      END IF;
      IF v_key IS NOT NULL THEN
        SELECT id, order_no, payment_amount
          INTO v_existing
          FROM public.store_orders
         WHERE buyer_user_id = p_buyer_user_id
           AND client_order_key = v_key
         LIMIT 1;
        IF FOUND THEN
          RETURN jsonb_build_object(
            'ok', true,
            'idempotent', true,
            'order', jsonb_build_object(
              'id', v_existing.id,
              'order_no', coalesce(v_existing.order_no, ''),
              'payment_amount', coalesce(v_existing.payment_amount, 0)
            ),
            'sold_out_products', '[]'::jsonb,
            'order_created_event_id', null
          );
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'order_idempotency_conflict', 'http_status', 409);
      END IF;
      RAISE;
    WHEN SQLSTATE 'P0001' THEN
      -- insufficient_stock race after pass-1; mutations in this block are rolled back
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_stock', 'http_status', 409);
  END;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb) TO service_role;


-- D1: settlement/Coin guard trigger
DROP TRIGGER IF EXISTS trg_store_settlements_block_paid_when_coin_recognized ON public.store_settlements;
DROP FUNCTION IF EXISTS public.store_settlements_block_paid_when_coin_recognized();

-- D1: legacy Coin mint grants (production state before SSOT-19)
GRANT EXECUTE ON FUNCTION public.credit_coin_from_settlement(uuid, uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_store_economic_points_inflow(uuid, integer, text, text, text, jsonb) TO service_role;

-- D1: charge snapshot trigger + CHECKs
DROP TRIGGER IF EXISTS trg_point_charge_requests_freeze_snapshot ON public.point_charge_requests;
DROP FUNCTION IF EXISTS public.point_charge_requests_freeze_snapshot();
ALTER TABLE public.point_charge_requests DROP CONSTRAINT IF EXISTS point_charge_requests_point_amount_positive_chk;
ALTER TABLE public.point_charge_requests DROP CONSTRAINT IF EXISTS point_charge_requests_payment_amount_positive_chk;

-- D1: member policies (definitions captured from production pg_policies, 2026-10-12)

DROP POLICY IF EXISTS post_ads_insert_own ON public.post_ads;
CREATE POLICY post_ads_insert_own ON public.post_ads AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS post_ads_insert_auth ON public.post_ads;
CREATE POLICY post_ads_insert_auth ON public.post_ads AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS point_promotion_orders_insert_own ON public.point_promotion_orders;
CREATE POLICY point_promotion_orders_insert_own ON public.point_promotion_orders AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS trade_post_ads_insert_own ON public.trade_post_ads;
CREATE POLICY trade_post_ads_insert_own ON public.trade_post_ads AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS point_charge_requests_insert_own ON public.point_charge_requests;
CREATE POLICY point_charge_requests_insert_own ON public.point_charge_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS point_charge_requests_update_own ON public.point_charge_requests;
CREATE POLICY point_charge_requests_update_own ON public.point_charge_requests AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


COMMIT;
