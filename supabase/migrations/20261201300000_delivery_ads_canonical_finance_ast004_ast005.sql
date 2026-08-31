-- Delivery Ads Stage 1 — Canonical finance AST-004 Store Points (Economic) + AST-005 Business Cash
-- PHYSICAL authority for Owner-locked product contracts.
-- Does NOT mutate AST-002, Gift Store Cash balances, or rewrite legacy ads money history.
-- Partner REJECTED: FIRST_DIVERGENCE — existing enum cannot represent application reject ≠ ENDED.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- AST-004 Store Points (Economic)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.store_economic_point_accounts (
  store_id uuid PRIMARY KEY REFERENCES public.stores (id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_economic_point_accounts_balance_nonneg_chk CHECK (balance >= 0)
);

COMMENT ON TABLE public.store_economic_point_accounts IS
  'AST-004 Store Points (Economic). store_id scoped. Not AST-002. Arbitrary owner recharge forbidden.';

CREATE TABLE IF NOT EXISTS public.store_economic_point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  entry_kind text NOT NULL CHECK (entry_kind IN (
    'ECONOMIC_INFLOW',
    'WITHDRAWAL',
    'CONVERT_TO_BUSINESS_CASH',
    'ADMIN_ADJUST',
    'SYSTEM'
  )),
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_user_id uuid NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_economic_point_ledger_idem_uidx UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS store_economic_point_ledger_store_idx
  ON public.store_economic_point_ledger (store_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- AST-005 Business Cash (balance_minor = PHP centavos)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.business_cash_accounts (
  store_id uuid PRIMARY KEY REFERENCES public.stores (id) ON DELETE CASCADE,
  balance_minor bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_cash_accounts_balance_nonneg_chk CHECK (balance_minor >= 0)
);

COMMENT ON TABLE public.business_cash_accounts IS
  'AST-005 Business Cash. store_id scoped. Not Gift store_cash_accounts. Not delivery_ad_accounts.';

CREATE TABLE IF NOT EXISTS public.business_cash_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  entry_kind text NOT NULL CHECK (entry_kind IN (
    'TOP_UP',
    'CONVERT_FROM_STORE_POINTS',
    'AD_SPEND',
    'AD_REFUND',
    'PARTNER_SPEND',
    'PARTNER_REFUND',
    'ADMIN_ADJUST',
    'SYSTEM'
  )),
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  balance_after_minor bigint NOT NULL,
  related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_user_id uuid NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_cash_ledger_idem_uidx UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS business_cash_ledger_store_idx
  ON public.business_cash_ledger (store_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.business_cash_ledger_forbid_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'business_cash_ledger is immutable';
END;
$$;

DROP TRIGGER IF EXISTS business_cash_ledger_no_update ON public.business_cash_ledger;
CREATE TRIGGER business_cash_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.business_cash_ledger
  FOR EACH ROW EXECUTE FUNCTION public.business_cash_ledger_forbid_mutate();

CREATE OR REPLACE FUNCTION public.store_economic_point_ledger_forbid_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'store_economic_point_ledger is immutable';
END;
$$;

DROP TRIGGER IF EXISTS store_economic_point_ledger_no_update ON public.store_economic_point_ledger;
CREATE TRIGGER store_economic_point_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.store_economic_point_ledger
  FOR EACH ROW EXECUTE FUNCTION public.store_economic_point_ledger_forbid_mutate();

-- ═══════════════════════════════════════════════════════════════════════════
-- Conversion rate SSOT (default 1 SP = 1 PHP = 100 minor)
-- rate_pesos_per_point: 1.0 = default; 0.9 = 90 minor per point
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.business_cash_conversion_rate_policies (
  id text PRIMARY KEY DEFAULT 'default',
  rate_pesos_per_point numeric(18, 8) NOT NULL DEFAULT 1,
  version integer NOT NULL DEFAULT 1,
  effective_from timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_cash_conversion_rate_positive_chk CHECK (rate_pesos_per_point > 0)
);

INSERT INTO public.business_cash_conversion_rate_policies (id, rate_pesos_per_point, version)
VALUES ('default', 1, 1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.business_cash_conversion_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id text NOT NULL REFERENCES public.business_cash_conversion_rate_policies (id),
  rate_pesos_per_point numeric(18, 8) NOT NULL,
  version integer NOT NULL,
  effective_from timestamptz NOT NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- BC top-up charge requests (rail pattern; credits AST-005 only)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.business_cash_charge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  idempotency_key text NOT NULL,
  admin_user_id uuid NULL,
  decided_at timestamptz NULL,
  reject_reason text NULL,
  credit_ledger_id uuid NULL REFERENCES public.business_cash_ledger (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_cash_charge_requests_idem_uidx UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS business_cash_charge_requests_store_idx
  ON public.business_cash_charge_requests (store_id, status, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- Canonical funding binding (Ads + Partner) — not Store Cash, not legacy BC
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.delivery_ad_canonical_bc_fundings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id),
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner', 'partner')),
  application_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'PHP',
  spend_ledger_id uuid NOT NULL REFERENCES public.business_cash_ledger (id),
  refund_ledger_id uuid NULL REFERENCES public.business_cash_ledger (id),
  status text NOT NULL CHECK (status IN ('SECURED', 'REFUNDED')),
  secured_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_canonical_bc_fundings_app_uidx UNIQUE (product_kind, application_id)
);

CREATE INDEX IF NOT EXISTS delivery_ad_canonical_bc_fundings_store_idx
  ON public.delivery_ad_canonical_bc_fundings (store_id, status, created_at DESC);

-- Partner REJECTED (application reject ≠ ENDED membership end)
ALTER TABLE public.delivery_ad_partner_memberships
  DROP CONSTRAINT IF EXISTS delivery_ad_partner_memberships_status_check;

ALTER TABLE public.delivery_ad_partner_memberships
  ADD CONSTRAINT delivery_ad_partner_memberships_status_check
  CHECK (
    status IN (
      'NONE',
      'PENDING_REVIEW',
      'ACTIVE',
      'PAST_DUE',
      'CANCEL_PENDING',
      'ENDED',
      'REJECTED'
    )
  );

COMMENT ON CONSTRAINT delivery_ad_partner_memberships_status_check
  ON public.delivery_ad_partner_memberships IS
  'Stage1: REJECTED = Admin rejected PENDING_REVIEW application (not ENDED). Fee payment via AST-005 BC.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Helpers: ensure accounts
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ensure_store_economic_point_account(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_economic_point_accounts (store_id, balance)
  VALUES (p_store_id, 0)
  ON CONFLICT (store_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_business_cash_account(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.business_cash_accounts (store_id, balance_minor)
  VALUES (p_store_id, 0)
  ON CONFLICT (store_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_store_economic_point_account(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_business_cash_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_store_economic_point_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_business_cash_account(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Read current conversion rate
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_business_cash_conversion_rate()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.business_cash_conversion_rate_policies;
BEGIN
  SELECT * INTO v_row FROM public.business_cash_conversion_rate_policies WHERE id = 'default';
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'rate_pesos_per_point', 1,
      'version', 1,
      'is_default_rate', true,
      'effective_from', now()
    );
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'rate_pesos_per_point', v_row.rate_pesos_per_point,
    'version', v_row.version,
    'is_default_rate', (v_row.rate_pesos_per_point = 1),
    'effective_from', v_row.effective_from
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_cash_conversion_rate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_cash_conversion_rate() TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- SP → BC conversion (exactly-once)
-- ═══════════════════════════════════════════════════════════════════════════

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
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'bc_ledger_id', v_existing_bc);
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
    'bc_ledger_id', v_bc_ledger
  );
END;
$$;

REVOKE ALL ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_store_economic_points_to_business_cash(uuid, uuid, integer, integer, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- BC top-up approve (exactly-once)
-- ═══════════════════════════════════════════════════════════════════════════

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
BEGIN
  IF p_admin_user_id IS NULL OR p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_req FROM public.business_cash_charge_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.status = 'APPROVED' AND v_req.credit_ledger_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'ledger_id', v_req.credit_ledger_id);
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

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'ledger_id', v_ledger,
    'balance_after_minor', v_bal,
    'amount_minor', v_req.amount_minor,
    'store_id', v_req.store_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_business_cash_charge_request(
  p_admin_user_id uuid,
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.business_cash_charge_requests;
BEGIN
  SELECT * INTO v_req FROM public.business_cash_charge_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.status = 'REJECTED' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  IF v_req.status IS DISTINCT FROM 'PENDING' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;
  UPDATE public.business_cash_charge_requests
  SET status = 'REJECTED',
      admin_user_id = p_admin_user_id,
      decided_at = now(),
      reject_reason = nullif(trim(coalesce(p_reason, '')), ''),
      updated_at = now()
  WHERE id = v_req.id;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_business_cash_charge_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_business_cash_charge_request(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_business_cash_charge_request(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_business_cash_charge_request(uuid, uuid, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Ads / Partner BC spend + refund
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.business_cash_delivery_ad_spend(
  p_owner_user_id uuid,
  p_store_id uuid,
  p_application_id uuid,
  p_product_kind text,
  p_amount_minor bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.delivery_ad_canonical_bc_fundings;
  v_store record;
  v_camp record;
  v_snap public.delivery_ad_campaign_commercial_snapshots;
  v_amount_minor bigint;
  v_bal bigint;
  v_new bigint;
  v_ledger uuid;
  v_fund uuid;
BEGIN
  IF p_owner_user_id IS NULL OR p_store_id IS NULL OR p_application_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner', 'partner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  SELECT * INTO v_existing
  FROM public.delivery_ad_canonical_bc_fundings
  WHERE product_kind = p_product_kind AND application_id = p_application_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status = 'SECURED' THEN
      RETURN jsonb_build_object(
        'ok', true, 'idempotent', true, 'status', 'SECURED',
        'funding_id', v_existing.id,
        'amount_minor', v_existing.amount_minor,
        'spend_ledger_id', v_existing.spend_ledger_id
      );
    END IF;
    IF v_existing.status = 'REFUNDED' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_refunded');
    END IF;
  END IF;

  SELECT id, owner_user_id INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND OR v_store.owner_user_id IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_product_kind = 'partner' THEN
    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
    END IF;
    v_amount_minor := p_amount_minor;
  ELSE
    IF p_product_kind = 'banner' THEN
      SELECT id, store_id, owner_user_id, lifecycle_status, campaign_source
        INTO v_camp
      FROM public.store_banner_ad_campaigns
      WHERE id = p_application_id
      FOR UPDATE;
    ELSE
      SELECT id, store_id, owner_user_id, lifecycle_status, campaign_source
        INTO v_camp
      FROM public.store_paid_ad_campaigns
      WHERE id = p_application_id
      FOR UPDATE;
    END IF;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
    END IF;
    IF v_camp.owner_user_id IS DISTINCT FROM p_owner_user_id
       OR v_camp.store_id IS DISTINCT FROM p_store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    IF coalesce(v_camp.campaign_source, 'OWNER_PAID') = 'DIBAY_FIRST_PARTY' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'first_party_no_bc');
    END IF;
    IF v_camp.lifecycle_status NOT IN ('DRAFT', 'CHANGES_REQUESTED') THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'not_debit_eligible',
        'lifecycle', v_camp.lifecycle_status
      );
    END IF;

    SELECT * INTO v_snap
    FROM public.delivery_ad_campaign_commercial_snapshots
    WHERE campaign_id = p_application_id AND product_kind = p_product_kind;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'snapshot_missing');
    END IF;
    IF v_snap.campaign_source IS DISTINCT FROM 'OWNER_PAID' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'first_party_no_bc');
    END IF;
    IF v_snap.commercial_status IS DISTINCT FROM 'PRICED' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'snapshot_not_priced');
    END IF;
    IF v_snap.final_payable_minor IS NULL OR v_snap.final_payable_minor <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_payable');
    END IF;
    v_amount_minor := v_snap.final_payable_minor;
  END IF;

  PERFORM public.ensure_business_cash_account(p_store_id);
  SELECT balance_minor INTO v_bal FROM public.business_cash_accounts WHERE store_id = p_store_id FOR UPDATE;
  IF v_bal < v_amount_minor THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INSUFFICIENT_BUSINESS_CASH',
      'available_minor', v_bal,
      'required_minor', v_amount_minor,
      'shortage_minor', v_amount_minor - v_bal,
      'available_php', (v_bal / 100)::integer,
      'required_php', (v_amount_minor / 100)::integer,
      'shortage_php', ((v_amount_minor - v_bal) / 100)::integer,
      'currency', 'PHP'
    );
  END IF;

  v_new := v_bal - v_amount_minor;
  UPDATE public.business_cash_accounts
  SET balance_minor = v_new, updated_at = now()
  WHERE store_id = p_store_id;

  INSERT INTO public.business_cash_ledger (
    store_id, entry_kind, direction, amount_minor, balance_after_minor,
    related_type, related_id, idempotency_key, actor_type, actor_user_id
  ) VALUES (
    p_store_id,
    CASE WHEN p_product_kind = 'partner' THEN 'PARTNER_SPEND' ELSE 'AD_SPEND' END,
    'debit', v_amount_minor, v_new,
    p_product_kind, p_application_id::text,
    'bc_spend:' || p_product_kind || ':' || p_application_id::text,
    'owner', p_owner_user_id
  ) RETURNING id INTO v_ledger;

  INSERT INTO public.delivery_ad_canonical_bc_fundings (
    store_id, product_kind, application_id, amount_minor,
    spend_ledger_id, status
  ) VALUES (
    p_store_id, p_product_kind, p_application_id, v_amount_minor,
    v_ledger, 'SECURED'
  ) RETURNING id INTO v_fund;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', 'SECURED',
    'funding_id', v_fund,
    'spend_ledger_id', v_ledger,
    'amount_minor', v_amount_minor,
    'balance_after_minor', v_new
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.business_cash_delivery_ad_refund(
  p_admin_user_id uuid,
  p_application_id uuid,
  p_product_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fund public.delivery_ad_canonical_bc_fundings;
  v_bal bigint;
  v_ledger uuid;
BEGIN
  IF p_admin_user_id IS NULL OR p_application_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner', 'partner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  SELECT * INTO v_fund
  FROM public.delivery_ad_canonical_bc_fundings
  WHERE product_kind = p_product_kind AND application_id = p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'funding_not_found');
  END IF;
  IF v_fund.status = 'REFUNDED' THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'funding_id', v_fund.id,
      'refund_ledger_id', v_fund.refund_ledger_id
    );
  END IF;
  IF v_fund.status IS DISTINCT FROM 'SECURED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_secured');
  END IF;

  PERFORM public.ensure_business_cash_account(v_fund.store_id);
  UPDATE public.business_cash_accounts
  SET balance_minor = balance_minor + v_fund.amount_minor, updated_at = now()
  WHERE store_id = v_fund.store_id
  RETURNING balance_minor INTO v_bal;

  INSERT INTO public.business_cash_ledger (
    store_id, entry_kind, direction, amount_minor, balance_after_minor,
    related_type, related_id, idempotency_key, actor_type, actor_user_id
  ) VALUES (
    v_fund.store_id,
    CASE WHEN p_product_kind = 'partner' THEN 'PARTNER_REFUND' ELSE 'AD_REFUND' END,
    'credit', v_fund.amount_minor, v_bal,
    'delivery_ad_canonical_bc_fundings', v_fund.id::text,
    'bc_refund:' || p_product_kind || ':' || p_application_id::text,
    'admin', p_admin_user_id
  ) RETURNING id INTO v_ledger;

  UPDATE public.delivery_ad_canonical_bc_fundings
  SET status = 'REFUNDED',
      refund_ledger_id = v_ledger,
      refunded_at = now(),
      updated_at = now()
  WHERE id = v_fund.id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'funding_id', v_fund.id,
    'refund_ledger_id', v_ledger,
    'amount_minor', v_fund.amount_minor,
    'balance_after_minor', v_bal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_cash_delivery_ad_spend(uuid, uuid, uuid, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.business_cash_delivery_ad_refund(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_cash_delivery_ad_spend(uuid, uuid, uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_cash_delivery_ad_refund(uuid, uuid, text) TO service_role;

-- Economic SP inflow interface (source-domain writers call later; Stage 1 unused by Owner UI)
CREATE OR REPLACE FUNCTION public.credit_store_economic_points_inflow(
  p_store_id uuid,
  p_points integer,
  p_related_type text,
  p_related_id text,
  p_idempotency_key text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal integer;
  v_ledger uuid;
BEGIN
  IF p_store_id IS NULL OR p_points IS NULL OR p_points <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_required');
  END IF;
  SELECT id INTO v_ledger FROM public.store_economic_point_ledger WHERE idempotency_key = trim(p_idempotency_key);
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'ledger_id', v_ledger);
  END IF;
  PERFORM public.ensure_store_economic_point_account(p_store_id);
  UPDATE public.store_economic_point_accounts
  SET balance = balance + p_points, updated_at = now()
  WHERE store_id = p_store_id
  RETURNING balance INTO v_bal;
  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, meta
  ) VALUES (
    p_store_id, 'ECONOMIC_INFLOW', p_points, v_bal,
    coalesce(nullif(trim(p_related_type), ''), 'system'),
    coalesce(nullif(trim(p_related_id), ''), ''),
    trim(p_idempotency_key), 'system', coalesce(p_meta, '{}'::jsonb)
  ) RETURNING id INTO v_ledger;
  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'ledger_id', v_ledger, 'balance_after', v_bal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_store_economic_points_inflow(uuid, integer, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_store_economic_points_inflow(uuid, integer, text, text, text, jsonb) TO service_role;

-- ACTIVE gate: canonical BC SECURED OR legacy Store Cash SECURED (compat)
CREATE OR REPLACE FUNCTION public.delivery_ad_campaign_funding_allows_active(
  p_product_kind text,
  p_campaign_id uuid,
  p_campaign_source text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(p_campaign_source, 'OWNER_PAID') = 'DIBAY_FIRST_PARTY' THEN
    RETURN true;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.delivery_ad_canonical_bc_fundings f
    WHERE f.application_id = p_campaign_id
      AND f.product_kind = p_product_kind
      AND f.status = 'SECURED'
  ) THEN
    RETURN true;
  END IF;
  -- Legacy Stage 1 Store Cash spends (historical)
  IF p_product_kind IN ('store_sponsored', 'banner') AND EXISTS (
    SELECT 1 FROM public.delivery_ad_store_cash_spends s
    WHERE s.campaign_id = p_campaign_id
      AND s.product_kind = p_product_kind
      AND s.status = 'SECURED'
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) TO service_role;

-- RLS (owner select)
ALTER TABLE public.store_economic_point_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_economic_point_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_cash_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_cash_charge_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_canonical_bc_fundings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_cash_conversion_rate_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_economic_point_accounts_owner_select ON public.store_economic_point_accounts;
CREATE POLICY store_economic_point_accounts_owner_select
  ON public.store_economic_point_accounts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS store_economic_point_ledger_owner_select ON public.store_economic_point_ledger;
CREATE POLICY store_economic_point_ledger_owner_select
  ON public.store_economic_point_ledger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS business_cash_accounts_owner_select ON public.business_cash_accounts;
CREATE POLICY business_cash_accounts_owner_select
  ON public.business_cash_accounts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS business_cash_ledger_owner_select ON public.business_cash_ledger;
CREATE POLICY business_cash_ledger_owner_select
  ON public.business_cash_ledger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS business_cash_charge_requests_owner_select ON public.business_cash_charge_requests;
CREATE POLICY business_cash_charge_requests_owner_select
  ON public.business_cash_charge_requests FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS delivery_ad_canonical_bc_fundings_owner_select ON public.delivery_ad_canonical_bc_fundings;
CREATE POLICY delivery_ad_canonical_bc_fundings_owner_select
  ON public.delivery_ad_canonical_bc_fundings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS business_cash_conversion_rate_policies_select ON public.business_cash_conversion_rate_policies;
CREATE POLICY business_cash_conversion_rate_policies_select
  ON public.business_cash_conversion_rate_policies FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.store_economic_point_accounts TO authenticated;
GRANT SELECT ON public.store_economic_point_ledger TO authenticated;
GRANT SELECT ON public.business_cash_accounts TO authenticated;
GRANT SELECT ON public.business_cash_ledger TO authenticated;
GRANT SELECT ON public.business_cash_charge_requests TO authenticated;
GRANT SELECT ON public.delivery_ad_canonical_bc_fundings TO authenticated;
GRANT SELECT ON public.business_cash_conversion_rate_policies TO authenticated;
GRANT ALL ON public.store_economic_point_accounts TO service_role;
GRANT ALL ON public.store_economic_point_ledger TO service_role;
GRANT ALL ON public.business_cash_accounts TO service_role;
GRANT ALL ON public.business_cash_ledger TO service_role;
GRANT ALL ON public.business_cash_charge_requests TO service_role;
GRANT ALL ON public.delivery_ad_canonical_bc_fundings TO service_role;
GRANT ALL ON public.business_cash_conversion_rate_policies TO service_role;
GRANT ALL ON public.business_cash_conversion_rate_history TO service_role;

COMMIT;
