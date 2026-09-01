-- DIBAY Currency CUT D — Cash sale fee + outstanding obligation + settle-on-inflow

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Expand business_cash_ledger entry kinds
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.business_cash_ledger
  DROP CONSTRAINT IF EXISTS business_cash_ledger_entry_kind_check;

ALTER TABLE public.business_cash_ledger
  ADD CONSTRAINT business_cash_ledger_entry_kind_check
  CHECK (entry_kind IN (
    'TOP_UP',
    'CONVERT_FROM_STORE_POINTS',
    'AD_SPEND',
    'AD_REFUND',
    'PARTNER_SPEND',
    'PARTNER_REFUND',
    'SALE_FEE',
    'SALE_FEE_SETTLEMENT',
    'ADMIN_ADJUST',
    'SYSTEM'
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- store_sale_fee_obligations — Decision #1 outstanding fee rail
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.store_sale_fee_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.store_orders (id) ON DELETE CASCADE,
  settlement_id uuid NULL REFERENCES public.store_settlements (id) ON DELETE SET NULL,
  confirmed_revenue_php integer NOT NULL CHECK (confirmed_revenue_php >= 0),
  fee_due_minor bigint NOT NULL CHECK (fee_due_minor >= 0),
  fee_paid_minor bigint NOT NULL DEFAULT 0 CHECK (fee_paid_minor >= 0),
  fee_outstanding_minor bigint NOT NULL CHECK (fee_outstanding_minor >= 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'settled', 'waived')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz NULL,
  CONSTRAINT store_sale_fee_obligations_order_uq UNIQUE (order_id),
  CONSTRAINT store_sale_fee_obligations_idem_uq UNIQUE (idempotency_key),
  CONSTRAINT store_sale_fee_obligations_amounts_chk CHECK (
    fee_paid_minor + fee_outstanding_minor = fee_due_minor
  )
);

CREATE INDEX IF NOT EXISTS store_sale_fee_obligations_store_open_idx
  ON public.store_sale_fee_obligations (store_id, status, created_at)
  WHERE status = 'open';

ALTER TABLE public.store_sale_fee_obligations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_sale_fee_obligations_owner_select ON public.store_sale_fee_obligations;
CREATE POLICY store_sale_fee_obligations_owner_select
  ON public.store_sale_fee_obligations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = store_sale_fee_obligations.store_id
         AND s.owner_user_id = auth.uid()
    )
    OR public.is_platform_admin(auth.uid())
  );

REVOKE ALL ON TABLE public.store_sale_fee_obligations FROM PUBLIC;
GRANT SELECT ON TABLE public.store_sale_fee_obligations TO authenticated;
GRANT ALL ON TABLE public.store_sale_fee_obligations TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- charge_sale_fee_for_order — Cash debit up to available + obligation remainder
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.charge_sale_fee_for_order(
  p_store_id uuid,
  p_order_id uuid,
  p_settlement_id uuid,
  p_confirmed_revenue_php integer,
  p_fee_due_php integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing uuid;
  v_fee_due_minor bigint;
  v_cash_avail bigint := 0;
  v_cash_paid bigint := 0;
  v_outstanding bigint := 0;
  v_bc_bal bigint;
  v_ledger uuid;
  v_ob uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_store_id IS NULL OR p_order_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_existing FROM public.store_sale_fee_obligations WHERE idempotency_key = v_key;
  IF FOUND THEN
    SELECT fee_due_minor, fee_paid_minor, fee_outstanding_minor
      INTO v_fee_due_minor, v_cash_paid, v_outstanding
      FROM public.store_sale_fee_obligations WHERE id = v_existing;
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'obligation_id', v_existing,
      'fee_due_minor', v_fee_due_minor, 'fee_paid_minor', v_cash_paid,
      'fee_outstanding_minor', v_outstanding
    );
  END IF;

  v_fee_due_minor := GREATEST(0, coalesce(p_fee_due_php, 0)) * 100;
  IF v_fee_due_minor <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'fee_due_minor', 0);
  END IF;

  PERFORM public.ensure_business_cash_account(p_store_id);

  SELECT balance_minor INTO v_cash_avail
    FROM public.business_cash_accounts
   WHERE store_id = p_store_id
   FOR UPDATE;

  v_cash_paid := LEAST(coalesce(v_cash_avail, 0), v_fee_due_minor);
  v_outstanding := v_fee_due_minor - v_cash_paid;

  IF v_cash_paid > 0 THEN
    UPDATE public.business_cash_accounts
       SET balance_minor = balance_minor - v_cash_paid, updated_at = now()
     WHERE store_id = p_store_id
     RETURNING balance_minor INTO v_bc_bal;

    INSERT INTO public.business_cash_ledger (
      store_id, entry_kind, direction, amount_minor, balance_after_minor,
      related_type, related_id, idempotency_key, actor_type, meta
    ) VALUES (
      p_store_id, 'SALE_FEE', 'debit', v_cash_paid, v_bc_bal,
      'store_order', p_order_id::text,
      v_key || ':cash', 'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'settlement_id', p_settlement_id,
        'confirmed_revenue_php', p_confirmed_revenue_php
      )
    ) RETURNING id INTO v_ledger;
  END IF;

  INSERT INTO public.store_sale_fee_obligations (
    store_id, order_id, settlement_id, confirmed_revenue_php,
    fee_due_minor, fee_paid_minor, fee_outstanding_minor, status, idempotency_key,
    settled_at
  ) VALUES (
    p_store_id, p_order_id, p_settlement_id, GREATEST(0, coalesce(p_confirmed_revenue_php, 0)),
    v_fee_due_minor, v_cash_paid, v_outstanding,
    CASE WHEN v_outstanding <= 0 THEN 'settled' ELSE 'open' END,
    v_key,
    CASE WHEN v_outstanding <= 0 THEN now() ELSE NULL END
  ) RETURNING id INTO v_ob;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'obligation_id', v_ob,
    'fee_due_minor', v_fee_due_minor,
    'fee_paid_minor', v_cash_paid,
    'fee_outstanding_minor', v_outstanding,
    'cash_ledger_id', v_ledger
  );
END;
$$;

REVOKE ALL ON FUNCTION public.charge_sale_fee_for_order(uuid, uuid, uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_sale_fee_for_order(uuid, uuid, uuid, integer, integer, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- settle_store_sale_fee_obligations — oldest open first on Cash inflow
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.settle_store_sale_fee_obligations(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ob record;
  v_cash_avail bigint;
  v_pay bigint;
  v_bc_bal bigint;
  v_settled integer := 0;
  v_ledger uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  PERFORM public.ensure_business_cash_account(p_store_id);

  LOOP
    SELECT balance_minor INTO v_cash_avail
      FROM public.business_cash_accounts
     WHERE store_id = p_store_id
     FOR UPDATE;
    IF coalesce(v_cash_avail, 0) <= 0 THEN EXIT; END IF;

    SELECT * INTO v_ob
      FROM public.store_sale_fee_obligations
     WHERE store_id = p_store_id AND status = 'open' AND fee_outstanding_minor > 0
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN EXIT; END IF;

    v_pay := LEAST(v_cash_avail, v_ob.fee_outstanding_minor);
    IF v_pay <= 0 THEN EXIT; END IF;

    UPDATE public.business_cash_accounts
       SET balance_minor = balance_minor - v_pay, updated_at = now()
     WHERE store_id = p_store_id
     RETURNING balance_minor INTO v_bc_bal;

    INSERT INTO public.business_cash_ledger (
      store_id, entry_kind, direction, amount_minor, balance_after_minor,
      related_type, related_id, idempotency_key, actor_type, meta
    ) VALUES (
      p_store_id, 'SALE_FEE_SETTLEMENT', 'debit', v_pay, v_bc_bal,
      'store_sale_fee_obligation', v_ob.id::text,
      'sale_fee_settle:' || v_ob.id::text || ':' || v_pay::text,
      'system',
      jsonb_build_object('order_id', v_ob.order_id, 'obligation_id', v_ob.id)
    ) RETURNING id INTO v_ledger;

    UPDATE public.store_sale_fee_obligations
       SET fee_paid_minor = fee_paid_minor + v_pay,
           fee_outstanding_minor = fee_outstanding_minor - v_pay,
           status = CASE WHEN fee_outstanding_minor - v_pay <= 0 THEN 'settled' ELSE 'open' END,
           settled_at = CASE WHEN fee_outstanding_minor - v_pay <= 0 THEN now() ELSE settled_at END
     WHERE id = v_ob.id;

    v_settled := v_settled + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'settled_count', v_settled);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_store_sale_fee_obligations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_store_sale_fee_obligations(uuid) TO service_role;

-- Patch BC top-up approve — settle outstanding sale fees after credit
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
  v_req public.business_cash_charge_requests;
  v_bal bigint;
  v_ledger uuid;
  v_result jsonb;
  v_settle jsonb;
BEGIN
  IF p_admin_user_id IS NULL OR p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_req FROM public.business_cash_charge_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.status = 'APPROVED' AND v_req.credit_ledger_id IS NOT NULL THEN
    v_settle := public.settle_store_sale_fee_obligations(v_req.store_id);
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'ledger_id', v_req.credit_ledger_id,
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

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'ledger_id', v_ledger,
    'balance_after_minor', v_bal,
    'amount_minor', v_req.amount_minor,
    'store_id', v_req.store_id,
    'obligation_settle', v_settle
  );
END;
$$;

-- Patch SP→BC convert — settle outstanding sale fees after credit
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
  v_result jsonb;
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

COMMIT;
