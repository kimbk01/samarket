-- CUT H — Delivery Ads financial ledger / budget / pricing / billing policy
-- PRODUCTION AUTOMATIC CHARGING DISABLED (billing is_enabled=false; no fake pricing).
-- EXECUTE: service_role only from day one.

BEGIN;

-- ── Platform billing launch switch ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_billing_policy (
  id text PRIMARY KEY DEFAULT 'default',
  is_enabled boolean NOT NULL DEFAULT false,
  notes text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.delivery_ad_billing_policy (id, is_enabled, notes)
VALUES (
  'default',
  false,
  'CUT H: infrastructure only. Do not enable until business pricing + attribution window configured.'
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.delivery_ad_billing_policy IS
  'CUT H billing launch switch. is_enabled=false ⇒ automatic charging DISABLED (safe Production state).';

-- ── Ad accounts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'PHP',
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_accounts_owner_currency_uidx UNIQUE (owner_user_id, currency)
);

CREATE INDEX IF NOT EXISTS delivery_ad_accounts_owner_idx
  ON public.delivery_ad_accounts (owner_user_id);

-- ── Pricing policies (no Production active rows seeded) ─────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_pricing_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  inventory_key text NULL,
  pricing_model text NOT NULL
    CHECK (pricing_model IN ('CPC', 'CPA_ORDER', 'ORDER_PERCENT', 'FIXED_PERIOD')),
  unit_amount_minor bigint NULL CHECK (unit_amount_minor IS NULL OR unit_amount_minor >= 0),
  percentage_basis_points integer NULL
    CHECK (percentage_basis_points IS NULL OR (percentage_basis_points >= 0 AND percentage_basis_points <= 10000)),
  currency text NOT NULL DEFAULT 'PHP',
  is_active boolean NOT NULL DEFAULT false,
  effective_from timestamptz NULL,
  effective_to timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_ad_pricing_active_idx
  ON public.delivery_ad_pricing_policies (product_kind, pricing_model, is_active)
  WHERE is_active = true;

COMMENT ON TABLE public.delivery_ad_pricing_policies IS
  'CUT H pricing SSOT. No active Production rows at ship. Test fixtures only.';

-- ── Campaign budgets ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_campaign_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  ad_account_id uuid NOT NULL REFERENCES public.delivery_ad_accounts (id),
  currency text NOT NULL DEFAULT 'PHP',
  budget_limit_minor bigint NULL CHECK (budget_limit_minor IS NULL OR budget_limit_minor >= 0),
  spend_cap_type text NOT NULL DEFAULT 'NOT_CONFIGURED'
    CHECK (spend_cap_type IN ('NOT_CONFIGURED', 'HARD_CAP', 'SOFT_CAP')),
  status text NOT NULL DEFAULT 'NOT_CONFIGURED'
    CHECK (status IN ('NOT_CONFIGURED', 'AVAILABLE', 'EXHAUSTED', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_campaign_budgets_campaign_uidx UNIQUE (campaign_id, product_kind)
);

COMMENT ON TABLE public.delivery_ad_campaign_budgets IS
  'CUT H budget config. Spend authority = charge ledger aggregate, not mutable remaining column.';

-- ── Charge ledger (immutable) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_charge_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.delivery_ad_accounts (id),
  campaign_id uuid NOT NULL,
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  store_id uuid NULL,
  pricing_model text NOT NULL
    CHECK (pricing_model IN ('CPC', 'CPA_ORDER', 'ORDER_PERCENT', 'FIXED_PERIOD')),
  pricing_policy_id uuid NULL REFERENCES public.delivery_ad_pricing_policies (id),
  unit_amount_minor_snapshot bigint NULL,
  percentage_basis_points_snapshot integer NULL,
  source_event_type text NOT NULL
    CHECK (source_event_type IN ('click', 'attribution', 'period', 'adjustment')),
  source_event_id text NOT NULL,
  order_id uuid NULL,
  attribution_id uuid NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  charge_kind text NOT NULL DEFAULT 'USAGE'
    CHECK (charge_kind IN ('USAGE', 'ADJUSTMENT_DEBIT')),
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_charge_ledger_idem_uidx UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS delivery_ad_charge_campaign_time_idx
  ON public.delivery_ad_charge_ledger (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS delivery_ad_charge_account_time_idx
  ON public.delivery_ad_charge_ledger (ad_account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS delivery_ad_charge_attribution_idx
  ON public.delivery_ad_charge_ledger (attribution_id)
  WHERE attribution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_ad_charge_source_idx
  ON public.delivery_ad_charge_ledger (source_event_type, source_event_id);

COMMENT ON TABLE public.delivery_ad_charge_ledger IS
  'CUT H immutable charge ledger. No UPDATE/DELETE for app roles. Compensating refunds only.';

-- ── Refund ledger (immutable compensating entries) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_refund_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_charge_id uuid NOT NULL REFERENCES public.delivery_ad_charge_ledger (id),
  campaign_id uuid NOT NULL,
  ad_account_id uuid NOT NULL REFERENCES public.delivery_ad_accounts (id),
  reason_code text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  source_event_id text NOT NULL,
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_refund_ledger_idem_uidx UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS delivery_ad_refund_original_idx
  ON public.delivery_ad_refund_ledger (original_charge_id);
CREATE INDEX IF NOT EXISTS delivery_ad_refund_campaign_time_idx
  ON public.delivery_ad_refund_ledger (campaign_id, occurred_at DESC);

-- ── RLS: no browser/user direct access ──────────────────────────────────────
ALTER TABLE public.delivery_ad_billing_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_pricing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_campaign_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_charge_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_refund_ledger ENABLE ROW LEVEL SECURITY;

-- ── Charge reconcile RPC (fail-closed unless billing+pricing active) ────────
CREATE OR REPLACE FUNCTION public.delivery_ad_reconcile_charge(
  p_campaign_id uuid,
  p_product_kind text,
  p_store_id uuid,
  p_owner_user_id uuid,
  p_pricing_model text,
  p_source_event_type text,
  p_source_event_id text,
  p_order_id uuid,
  p_attribution_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_pricing_policy_id uuid,
  p_unit_amount_minor_snapshot bigint,
  p_percentage_basis_points_snapshot integer,
  p_occurred_at timestamptz,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing record;
  v_account_id uuid;
  v_budget record;
  v_spent bigint;
  v_refunded bigint;
  v_net bigint;
  v_id uuid;
BEGIN
  IF p_campaign_id IS NULL OR p_owner_user_id IS NULL
     OR p_product_kind NOT IN ('store_sponsored', 'banner')
     OR p_pricing_model NOT IN ('CPC', 'CPA_ORDER', 'ORDER_PERCENT', 'FIXED_PERIOD')
     OR p_source_event_type NOT IN ('click', 'attribution', 'period', 'adjustment')
     OR length(trim(coalesce(p_source_event_id, ''))) = 0
     OR length(trim(coalesce(p_idempotency_key, ''))) = 0
     OR p_amount_minor IS NULL OR p_amount_minor < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  SELECT * INTO v_billing FROM public.delivery_ad_billing_policy WHERE id = 'default';
  IF NOT FOUND OR v_billing.is_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true, 'charged', false, 'reason', 'billing_disabled');
  END IF;

  -- Idempotent early
  SELECT id INTO v_id FROM public.delivery_ad_charge_ledger WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'charged', true, 'deduped', true, 'id', v_id);
  END IF;

  -- Ensure account
  INSERT INTO public.delivery_ad_accounts (owner_user_id, currency, status)
  VALUES (p_owner_user_id, coalesce(nullif(trim(p_currency), ''), 'PHP'), 'ACTIVE')
  ON CONFLICT (owner_user_id, currency) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_account_id;

  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id FROM public.delivery_ad_accounts
    WHERE owner_user_id = p_owner_user_id AND currency = coalesce(nullif(trim(p_currency), ''), 'PHP');
  END IF;

  -- Budget hard-cap lock (skip when NOT_CONFIGURED)
  SELECT * INTO v_budget
  FROM public.delivery_ad_campaign_budgets
  WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind
  FOR UPDATE;

  IF FOUND AND v_budget.spend_cap_type = 'HARD_CAP'
     AND v_budget.budget_limit_minor IS NOT NULL
     AND v_budget.status IN ('AVAILABLE', 'EXHAUSTED') THEN
    SELECT coalesce(sum(amount_minor), 0) INTO v_spent
    FROM public.delivery_ad_charge_ledger
    WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind;

    SELECT coalesce(sum(r.amount_minor), 0) INTO v_refunded
    FROM public.delivery_ad_refund_ledger r
    WHERE r.campaign_id = p_campaign_id;

    v_net := v_spent - v_refunded;
    IF v_net + p_amount_minor > v_budget.budget_limit_minor THEN
      UPDATE public.delivery_ad_campaign_budgets
      SET status = 'EXHAUSTED', updated_at = now()
      WHERE id = v_budget.id AND status <> 'SUSPENDED';
      RETURN jsonb_build_object('ok', false, 'error', 'budget_exceeded');
    END IF;
  END IF;

  INSERT INTO public.delivery_ad_charge_ledger (
    ad_account_id, campaign_id, product_kind, store_id, pricing_model, pricing_policy_id,
    unit_amount_minor_snapshot, percentage_basis_points_snapshot,
    source_event_type, source_event_id, order_id, attribution_id,
    amount_minor, currency, charge_kind, idempotency_key, occurred_at
  ) VALUES (
    v_account_id, p_campaign_id, p_product_kind, p_store_id, p_pricing_model, p_pricing_policy_id,
    p_unit_amount_minor_snapshot, p_percentage_basis_points_snapshot,
    p_source_event_type, p_source_event_id, p_order_id, p_attribution_id,
    p_amount_minor, coalesce(nullif(trim(p_currency), ''), 'PHP'), 'USAGE',
    p_idempotency_key, coalesce(p_occurred_at, now())
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.delivery_ad_charge_ledger WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ok', true, 'charged', true, 'deduped', true, 'id', v_id);
  END IF;

  -- Exhaust after successful charge if now at cap
  IF v_budget.id IS NOT NULL
     AND v_budget.spend_cap_type = 'HARD_CAP'
     AND v_budget.budget_limit_minor IS NOT NULL THEN
    SELECT coalesce(sum(amount_minor), 0) INTO v_spent
    FROM public.delivery_ad_charge_ledger
    WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind;
    SELECT coalesce(sum(r.amount_minor), 0) INTO v_refunded
    FROM public.delivery_ad_refund_ledger r
    WHERE r.campaign_id = p_campaign_id;
    IF (v_spent - v_refunded) >= v_budget.budget_limit_minor THEN
      UPDATE public.delivery_ad_campaign_budgets
      SET status = 'EXHAUSTED', updated_at = now()
      WHERE id = v_budget.id AND status = 'AVAILABLE';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'charged', true, 'deduped', false, 'id', v_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

-- ── Refund reconcile RPC ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delivery_ad_reconcile_refund(
  p_original_charge_id uuid,
  p_reason_code text,
  p_source_event_id text,
  p_amount_minor bigint,
  p_idempotency_key text,
  p_occurred_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_billing record;
  v_charge record;
  v_id uuid;
BEGIN
  SELECT * INTO v_billing FROM public.delivery_ad_billing_policy WHERE id = 'default';
  IF NOT FOUND OR v_billing.is_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true, 'refunded', false, 'reason', 'billing_disabled');
  END IF;

  IF p_original_charge_id IS NULL
     OR length(trim(coalesce(p_reason_code, ''))) = 0
     OR length(trim(coalesce(p_source_event_id, ''))) = 0
     OR length(trim(coalesce(p_idempotency_key, ''))) = 0
     OR p_amount_minor IS NULL OR p_amount_minor < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  SELECT id INTO v_id FROM public.delivery_ad_refund_ledger WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'refunded', true, 'deduped', true, 'id', v_id);
  END IF;

  SELECT * INTO v_charge FROM public.delivery_ad_charge_ledger WHERE id = p_original_charge_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'charge_not_found');
  END IF;

  IF p_amount_minor > v_charge.amount_minor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'refund_exceeds_charge');
  END IF;

  INSERT INTO public.delivery_ad_refund_ledger (
    original_charge_id, campaign_id, ad_account_id, reason_code,
    amount_minor, currency, source_event_id, idempotency_key, occurred_at
  ) VALUES (
    v_charge.id, v_charge.campaign_id, v_charge.ad_account_id, p_reason_code,
    p_amount_minor, v_charge.currency, p_source_event_id, p_idempotency_key,
    coalesce(p_occurred_at, now())
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.delivery_ad_refund_ledger WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('ok', true, 'refunded', true, 'deduped', true, 'id', v_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'refunded', true, 'deduped', false, 'id', v_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_ad_reconcile_charge(uuid, text, uuid, uuid, text, text, text, uuid, uuid, bigint, text, uuid, bigint, integer, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_reconcile_charge(uuid, text, uuid, uuid, text, text, text, uuid, uuid, bigint, text, uuid, bigint, integer, timestamptz, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_reconcile_charge(uuid, text, uuid, uuid, text, text, text, uuid, uuid, bigint, text, uuid, bigint, integer, timestamptz, text) TO service_role;

REVOKE ALL ON FUNCTION public.delivery_ad_reconcile_refund(uuid, text, text, bigint, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_reconcile_refund(uuid, text, text, bigint, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_reconcile_refund(uuid, text, text, bigint, text, timestamptz) TO service_role;

-- ── Ledger immutability (no UPDATE/DELETE even via service_role mistakes) ───
CREATE OR REPLACE FUNCTION public.delivery_ad_ledger_forbid_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'delivery_ad_ledger_immutable: UPDATE/DELETE forbidden; use compensating refund';
END;
$$;

DROP TRIGGER IF EXISTS delivery_ad_charge_ledger_immutable ON public.delivery_ad_charge_ledger;
CREATE TRIGGER delivery_ad_charge_ledger_immutable
  BEFORE UPDATE OR DELETE ON public.delivery_ad_charge_ledger
  FOR EACH ROW EXECUTE FUNCTION public.delivery_ad_ledger_forbid_mutate();

DROP TRIGGER IF EXISTS delivery_ad_refund_ledger_immutable ON public.delivery_ad_refund_ledger;
CREATE TRIGGER delivery_ad_refund_ledger_immutable
  BEFORE UPDATE OR DELETE ON public.delivery_ad_refund_ledger
  FOR EACH ROW EXECUTE FUNCTION public.delivery_ad_ledger_forbid_mutate();

COMMIT;
