-- Delivery Ads Business Cash funding gate (P1).
-- Prepaid merchant ad funding — NOT D-Point / Business Credit / CUT H usage billing.
-- CUT H billing remains DISABLED. CUT3 untouched.

BEGIN;

-- ── Extend ad accounts with prepaid Business Cash balance ───────────────────
ALTER TABLE public.delivery_ad_accounts
  ADD COLUMN IF NOT EXISTS balance_minor bigint NOT NULL DEFAULT 0
    CHECK (balance_minor >= 0);

COMMENT ON COLUMN public.delivery_ad_accounts.balance_minor IS
  'Business Cash prepaid balance (minor units). Authority = business_cash_ledger; updated only inside financial RPCs.';

-- ── Append-only Business Cash ledger ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_business_cash_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.delivery_ad_accounts (id),
  owner_user_id uuid NOT NULL,
  entry_kind text NOT NULL
    CHECK (entry_kind IN (
      'TOP_UP',
      'AD_FUNDING_DEBIT',
      'AD_REFUND',
      'ADMIN_CREDIT',
      'ADMIN_DEBIT'
    )),
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'PHP',
  balance_after_minor bigint NOT NULL CHECK (balance_after_minor >= 0),
  campaign_id uuid NULL,
  product_kind text NULL CHECK (product_kind IS NULL OR product_kind IN ('store_sponsored', 'banner')),
  commercial_snapshot_id uuid NULL
    REFERENCES public.delivery_ad_campaign_commercial_snapshots (id),
  related_ledger_id uuid NULL
    REFERENCES public.delivery_ad_business_cash_ledger (id),
  idempotency_key text NOT NULL,
  reason text NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('owner', 'admin', 'system')),
  actor_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_business_cash_ledger_idem_uidx UNIQUE (idempotency_key),
  CONSTRAINT delivery_ad_business_cash_ledger_dir_chk CHECK (
    (entry_kind IN ('TOP_UP', 'AD_REFUND', 'ADMIN_CREDIT') AND direction = 'credit')
    OR (entry_kind IN ('AD_FUNDING_DEBIT', 'ADMIN_DEBIT') AND direction = 'debit')
  )
);

CREATE INDEX IF NOT EXISTS delivery_ad_business_cash_ledger_account_idx
  ON public.delivery_ad_business_cash_ledger (ad_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS delivery_ad_business_cash_ledger_owner_idx
  ON public.delivery_ad_business_cash_ledger (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS delivery_ad_business_cash_ledger_campaign_idx
  ON public.delivery_ad_business_cash_ledger (campaign_id, product_kind)
  WHERE campaign_id IS NOT NULL;

COMMENT ON TABLE public.delivery_ad_business_cash_ledger IS
  'Business Cash append-only ledger. Never UPDATE amount. CUT H charge_ledger is separate usage billing.';

CREATE OR REPLACE FUNCTION public.delivery_ad_business_cash_ledger_forbid_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'delivery_ad_business_cash_ledger is immutable';
END;
$$;

DROP TRIGGER IF EXISTS delivery_ad_business_cash_ledger_no_update ON public.delivery_ad_business_cash_ledger;
CREATE TRIGGER delivery_ad_business_cash_ledger_no_update
  BEFORE UPDATE OR DELETE ON public.delivery_ad_business_cash_ledger
  FOR EACH ROW EXECUTE FUNCTION public.delivery_ad_business_cash_ledger_forbid_mutate();

-- ── Campaign funding record (one original package funding) ──────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_campaign_fundings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  commercial_snapshot_id uuid NOT NULL
    REFERENCES public.delivery_ad_campaign_commercial_snapshots (id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL,
  funding_status text NOT NULL
    CHECK (funding_status IN ('FUNDED', 'REFUNDED')),
  funded_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz NULL,
  ledger_transaction_id uuid NOT NULL
    REFERENCES public.delivery_ad_business_cash_ledger (id),
  refund_ledger_id uuid NULL
    REFERENCES public.delivery_ad_business_cash_ledger (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_campaign_fundings_campaign_uidx UNIQUE (campaign_id, product_kind)
);

CREATE INDEX IF NOT EXISTS delivery_ad_campaign_fundings_status_idx
  ON public.delivery_ad_campaign_fundings (funding_status);

COMMENT ON TABLE public.delivery_ad_campaign_fundings IS
  'Canonical campaign funding mark. UNFUNDED = no row. Amount from commercial snapshot final_payable_minor.';

-- RLS
ALTER TABLE public.delivery_ad_business_cash_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_campaign_fundings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_ad_business_cash_ledger_owner_select ON public.delivery_ad_business_cash_ledger;
CREATE POLICY delivery_ad_business_cash_ledger_owner_select
  ON public.delivery_ad_business_cash_ledger FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS delivery_ad_campaign_fundings_owner_select ON public.delivery_ad_campaign_fundings;
CREATE POLICY delivery_ad_campaign_fundings_owner_select
  ON public.delivery_ad_campaign_fundings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_ad_business_cash_ledger l
      WHERE l.id = ledger_transaction_id AND l.owner_user_id = auth.uid()
    )
  );

-- ── Go-live funding readiness helper ────────────────────────────────────────
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
  RETURN EXISTS (
    SELECT 1
    FROM public.delivery_ad_campaign_fundings f
    WHERE f.campaign_id = p_campaign_id
      AND f.product_kind = p_product_kind
      AND f.funding_status = 'FUNDED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) TO service_role;

-- ── Ensure / lock Business Cash account ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delivery_ad_business_cash_ensure_account(
  p_owner_user_id uuid,
  p_currency text
)
RETURNS public.delivery_ad_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc public.delivery_ad_accounts;
  v_currency text := upper(trim(coalesce(p_currency, 'PHP')));
BEGIN
  IF p_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner_required';
  END IF;
  IF v_currency IS NULL OR length(v_currency) = 0 THEN
    v_currency := 'PHP';
  END IF;

  INSERT INTO public.delivery_ad_accounts (owner_user_id, currency, status, balance_minor)
  VALUES (p_owner_user_id, v_currency, 'ACTIVE', 0)
  ON CONFLICT (owner_user_id, currency) DO NOTHING;

  SELECT * INTO v_acc
  FROM public.delivery_ad_accounts
  WHERE owner_user_id = p_owner_user_id AND currency = v_currency
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account_missing';
  END IF;
  IF v_acc.status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'account_not_active';
  END IF;
  RETURN v_acc;
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_ad_business_cash_ensure_account(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_business_cash_ensure_account(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_business_cash_ensure_account(uuid, text) TO service_role;

-- ── Admin credit (launch operability; no external top-up) ───────────────────
CREATE OR REPLACE FUNCTION public.admin_delivery_ad_business_cash_credit(
  p_admin_user_id uuid,
  p_owner_user_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc public.delivery_ad_accounts;
  v_existing public.delivery_ad_business_cash_ledger;
  v_ledger_id uuid;
  v_new_balance bigint;
  v_currency text := upper(trim(coalesce(p_currency, 'PHP')));
BEGIN
  IF p_admin_user_id IS NULL OR p_owner_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF length(trim(coalesce(p_reason, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF length(trim(coalesce(p_idempotency_key, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_required');
  END IF;

  SELECT * INTO v_existing
  FROM public.delivery_ad_business_cash_ledger
  WHERE idempotency_key = trim(p_idempotency_key);
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'ledger_id', v_existing.id,
      'balance_minor', v_existing.balance_after_minor,
      'currency', v_existing.currency
    );
  END IF;

  v_acc := public.delivery_ad_business_cash_ensure_account(p_owner_user_id, v_currency);
  v_new_balance := v_acc.balance_minor + p_amount_minor;

  INSERT INTO public.delivery_ad_business_cash_ledger (
    ad_account_id, owner_user_id, entry_kind, direction, amount_minor, currency,
    balance_after_minor, idempotency_key, reason, actor_type, actor_id
  ) VALUES (
    v_acc.id, p_owner_user_id, 'ADMIN_CREDIT', 'credit', p_amount_minor, v_acc.currency,
    v_new_balance, trim(p_idempotency_key), trim(p_reason), 'admin', p_admin_user_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.delivery_ad_business_cash_ledger
    WHERE idempotency_key = trim(p_idempotency_key);
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'ledger_id', v_existing.id,
      'balance_minor', v_existing.balance_after_minor,
      'currency', v_existing.currency
    );
  END IF;

  UPDATE public.delivery_ad_accounts
  SET balance_minor = v_new_balance, updated_at = now()
  WHERE id = v_acc.id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'ledger_id', v_ledger_id,
    'balance_minor', v_new_balance,
    'currency', v_acc.currency
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delivery_ad_business_cash_credit(uuid, uuid, bigint, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delivery_ad_business_cash_credit(uuid, uuid, bigint, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivery_ad_business_cash_credit(uuid, uuid, bigint, text, text, text) TO service_role;

-- ── Owner fund campaign (exactly-once debit) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.owner_fund_delivery_ad_campaign(
  p_owner_user_id uuid,
  p_product_kind text,
  p_campaign_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_snap public.delivery_ad_campaign_commercial_snapshots;
  v_existing_funding public.delivery_ad_campaign_fundings;
  v_existing_ledger public.delivery_ad_business_cash_ledger;
  v_acc public.delivery_ad_accounts;
  v_ledger_id uuid;
  v_funding_id uuid;
  v_new_balance bigint;
  v_amount bigint;
BEGIN
  IF p_owner_user_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;
  IF length(trim(coalesce(p_idempotency_key, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_required');
  END IF;

  SELECT * INTO v_existing_ledger
  FROM public.delivery_ad_business_cash_ledger
  WHERE idempotency_key = trim(p_idempotency_key);
  IF FOUND THEN
    SELECT * INTO v_existing_funding
    FROM public.delivery_ad_campaign_fundings
    WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'funding_status', coalesce(v_existing_funding.funding_status, 'FUNDED'),
      'ledger_id', v_existing_ledger.id,
      'funding_id', v_existing_funding.id,
      'amount_minor', v_existing_ledger.amount_minor,
      'currency', v_existing_ledger.currency,
      'balance_minor', v_existing_ledger.balance_after_minor
    );
  END IF;

  IF p_product_kind = 'banner' THEN
    SELECT * INTO v_row FROM public.store_banner_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  ELSE
    SELECT * INTO v_row FROM public.store_paid_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;

  IF v_row.owner_user_id IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF coalesce(v_row.campaign_source, 'OWNER_PAID') = 'DIBAY_FIRST_PARTY' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'first_party_no_funding');
  END IF;

  IF v_row.lifecycle_status IN ('ENDED', 'TERMINATED', 'ARCHIVED', 'REJECTED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_fundable', 'lifecycle', v_row.lifecycle_status);
  END IF;

  SELECT * INTO v_existing_funding
  FROM public.delivery_ad_campaign_fundings
  WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind
  FOR UPDATE;
  IF FOUND AND v_existing_funding.funding_status = 'FUNDED' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'funding_status', 'FUNDED',
      'funding_id', v_existing_funding.id,
      'ledger_id', v_existing_funding.ledger_transaction_id,
      'amount_minor', v_existing_funding.amount_minor,
      'currency', v_existing_funding.currency
    );
  END IF;
  IF FOUND AND v_existing_funding.funding_status = 'REFUNDED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_refunded');
  END IF;

  SELECT * INTO v_snap
  FROM public.delivery_ad_campaign_commercial_snapshots
  WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'snapshot_missing');
  END IF;
  IF v_snap.campaign_source IS DISTINCT FROM 'OWNER_PAID' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'first_party_no_funding');
  END IF;
  IF v_snap.commercial_status IS DISTINCT FROM 'PRICED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'snapshot_not_priced', 'status', v_snap.commercial_status);
  END IF;
  IF v_snap.final_payable_minor IS NULL OR v_snap.final_payable_minor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payable');
  END IF;

  v_amount := v_snap.final_payable_minor;
  v_acc := public.delivery_ad_business_cash_ensure_account(p_owner_user_id, v_snap.currency);

  IF v_acc.currency IS DISTINCT FROM v_snap.currency THEN
    RETURN jsonb_build_object('ok', false, 'error', 'currency_mismatch');
  END IF;
  IF v_acc.balance_minor < v_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_balance',
      'balance_minor', v_acc.balance_minor,
      'required_minor', v_amount,
      'currency', v_acc.currency
    );
  END IF;

  v_new_balance := v_acc.balance_minor - v_amount;

  INSERT INTO public.delivery_ad_business_cash_ledger (
    ad_account_id, owner_user_id, entry_kind, direction, amount_minor, currency,
    balance_after_minor, campaign_id, product_kind, commercial_snapshot_id,
    idempotency_key, actor_type, actor_id
  ) VALUES (
    v_acc.id, p_owner_user_id, 'AD_FUNDING_DEBIT', 'debit', v_amount, v_acc.currency,
    v_new_balance, p_campaign_id, p_product_kind, v_snap.id,
    trim(p_idempotency_key), 'owner', p_owner_user_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    SELECT * INTO v_existing_ledger
    FROM public.delivery_ad_business_cash_ledger
    WHERE idempotency_key = trim(p_idempotency_key);
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'funding_status', 'FUNDED',
      'ledger_id', v_existing_ledger.id,
      'amount_minor', v_existing_ledger.amount_minor,
      'currency', v_existing_ledger.currency,
      'balance_minor', v_existing_ledger.balance_after_minor
    );
  END IF;

  UPDATE public.delivery_ad_accounts
  SET balance_minor = v_new_balance, updated_at = now()
  WHERE id = v_acc.id;

  INSERT INTO public.delivery_ad_campaign_fundings (
    campaign_id, product_kind, commercial_snapshot_id, amount_minor, currency,
    funding_status, funded_at, ledger_transaction_id
  ) VALUES (
    p_campaign_id, p_product_kind, v_snap.id, v_amount, v_snap.currency,
    'FUNDED', now(), v_ledger_id
  )
  RETURNING id INTO v_funding_id;

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, reason, before_json, after_json
  ) VALUES (
    p_product_kind, p_campaign_id, 'owner', p_owner_user_id, 'business_cash_funded', NULL,
    jsonb_build_object('funding_status', 'UNFUNDED'),
    jsonb_build_object(
      'funding_status', 'FUNDED',
      'amount_minor', v_amount,
      'currency', v_snap.currency,
      'ledger_id', v_ledger_id,
      'commercial_snapshot_id', v_snap.id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'funding_status', 'FUNDED',
    'funding_id', v_funding_id,
    'ledger_id', v_ledger_id,
    'amount_minor', v_amount,
    'currency', v_snap.currency,
    'balance_minor', v_new_balance,
    'funded_at', now()
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing_funding
    FROM public.delivery_ad_campaign_fundings
    WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'funding_status', v_existing_funding.funding_status,
        'funding_id', v_existing_funding.id,
        'ledger_id', v_existing_funding.ledger_transaction_id,
        'amount_minor', v_existing_funding.amount_minor,
        'currency', v_existing_funding.currency
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'conflict');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.owner_fund_delivery_ad_campaign(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_fund_delivery_ad_campaign(uuid, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_fund_delivery_ad_campaign(uuid, text, uuid, text) TO service_role;

-- ── Full refund before go-live / Admin compensation (exact original debit) ──
CREATE OR REPLACE FUNCTION public.admin_refund_delivery_ad_campaign_funding(
  p_admin_user_id uuid,
  p_product_kind text,
  p_campaign_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_funding public.delivery_ad_campaign_fundings;
  v_debit public.delivery_ad_business_cash_ledger;
  v_existing public.delivery_ad_business_cash_ledger;
  v_acc public.delivery_ad_accounts;
  v_ledger_id uuid;
  v_new_balance bigint;
BEGIN
  IF p_admin_user_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;
  IF length(trim(coalesce(p_reason, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF length(trim(coalesce(p_idempotency_key, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_required');
  END IF;

  SELECT * INTO v_existing
  FROM public.delivery_ad_business_cash_ledger
  WHERE idempotency_key = trim(p_idempotency_key);
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'ledger_id', v_existing.id,
      'funding_status', 'REFUNDED'
    );
  END IF;

  SELECT * INTO v_funding
  FROM public.delivery_ad_campaign_fundings
  WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'funding_not_found');
  END IF;
  IF v_funding.funding_status = 'REFUNDED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_refunded');
  END IF;

  SELECT * INTO v_debit
  FROM public.delivery_ad_business_cash_ledger
  WHERE id = v_funding.ledger_transaction_id
  FOR UPDATE;
  IF NOT FOUND OR v_debit.entry_kind IS DISTINCT FROM 'AD_FUNDING_DEBIT' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'debit_missing');
  END IF;

  SELECT * INTO v_acc
  FROM public.delivery_ad_accounts
  WHERE id = v_debit.ad_account_id
  FOR UPDATE;

  v_new_balance := v_acc.balance_minor + v_funding.amount_minor;

  INSERT INTO public.delivery_ad_business_cash_ledger (
    ad_account_id, owner_user_id, entry_kind, direction, amount_minor, currency,
    balance_after_minor, campaign_id, product_kind, commercial_snapshot_id,
    related_ledger_id, idempotency_key, reason, actor_type, actor_id
  ) VALUES (
    v_acc.id, v_debit.owner_user_id, 'AD_REFUND', 'credit', v_funding.amount_minor, v_funding.currency,
    v_new_balance, p_campaign_id, p_product_kind, v_funding.commercial_snapshot_id,
    v_debit.id, trim(p_idempotency_key), trim(p_reason), 'admin', p_admin_user_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.delivery_ad_business_cash_ledger
    WHERE idempotency_key = trim(p_idempotency_key);
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'ledger_id', v_existing.id,
      'funding_status', 'REFUNDED'
    );
  END IF;

  UPDATE public.delivery_ad_accounts
  SET balance_minor = v_new_balance, updated_at = now()
  WHERE id = v_acc.id;

  UPDATE public.delivery_ad_campaign_fundings
  SET funding_status = 'REFUNDED',
      refunded_at = now(),
      refund_ledger_id = v_ledger_id,
      updated_at = now()
  WHERE id = v_funding.id;

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, reason, before_json, after_json
  ) VALUES (
    p_product_kind, p_campaign_id, 'admin', p_admin_user_id, 'business_cash_refunded', trim(p_reason),
    jsonb_build_object('funding_status', 'FUNDED', 'amount_minor', v_funding.amount_minor),
    jsonb_build_object('funding_status', 'REFUNDED', 'refund_ledger_id', v_ledger_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'funding_status', 'REFUNDED',
    'ledger_id', v_ledger_id,
    'amount_minor', v_funding.amount_minor,
    'currency', v_funding.currency,
    'balance_minor', v_new_balance
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refund_delivery_ad_campaign_funding(uuid, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_refund_delivery_ad_campaign_funding(uuid, text, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_delivery_ad_campaign_funding(uuid, text, uuid, text, text) TO service_role;

-- ── Patch admin_delivery_ad_transition: ACTIVE requires funding (MODEL B) ───
CREATE OR REPLACE FUNCTION public.admin_delivery_ad_transition(
  p_admin_user_id uuid,
  p_product_kind text,
  p_campaign_id uuid,
  p_action text,
  p_expected_lifecycle text,
  p_expected_updated_at timestamptz,
  p_reason text DEFAULT NULL,
  p_owner_visible_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text;
  v_row record;
  v_from text;
  v_to text;
  v_review text;
  v_is_active boolean;
  v_now timestamptz := now();
  v_go_live text;
  v_audit_action text;
  v_source text;
BEGIN
  IF p_admin_user_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  v_table := CASE
    WHEN p_product_kind = 'banner' THEN 'store_banner_ad_campaigns'
    ELSE 'store_paid_ad_campaigns'
  END;

  IF p_product_kind = 'banner' THEN
    SELECT * INTO v_row FROM public.store_banner_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  ELSE
    SELECT * INTO v_row FROM public.store_paid_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;

  v_from := v_row.lifecycle_status;
  v_source := coalesce(v_row.campaign_source, 'OWNER_PAID');

  IF p_expected_lifecycle IS NOT NULL AND v_from IS DISTINCT FROM p_expected_lifecycle THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_lifecycle', 'current', v_from);
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  END IF;

  IF p_action = 'start_review' THEN
    v_to := 'UNDER_REVIEW'; v_review := 'IN_REVIEW'; v_audit_action := 'review_started';
  ELSIF p_action = 'request_changes' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'CHANGES_REQUESTED'; v_review := 'CHANGES_REQUESTED'; v_audit_action := 'changes_requested';
  ELSIF p_action = 'approve' THEN
    v_to := 'APPROVED'; v_review := 'APPROVED'; v_audit_action := 'approved';
  ELSIF p_action = 'reject' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'REJECTED'; v_review := 'REJECTED'; v_audit_action := 'rejected';
  ELSIF p_action = 'pause' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'PAUSED_ADMIN'; v_review := NULL; v_audit_action := 'paused_admin';
  ELSIF p_action = 'resume' THEN
    v_to := 'ACTIVE'; v_review := NULL; v_audit_action := 'resumed_admin';
  ELSIF p_action = 'end' THEN
    v_to := 'ENDED'; v_review := NULL; v_audit_action := 'ended_admin';
  ELSIF p_action = 'terminate' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'TERMINATED'; v_review := NULL; v_audit_action := 'terminated_admin';
  ELSIF p_action = 'archive' THEN
    v_to := 'ARCHIVED'; v_review := NULL; v_audit_action := 'archived';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  IF p_action = 'approve' THEN
    IF v_from IS DISTINCT FROM 'UNDER_REVIEW' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', 'APPROVED');
    END IF;
  ELSIF NOT (
    (v_from = 'SUBMITTED' AND v_to = 'UNDER_REVIEW') OR
    (v_from = 'UNDER_REVIEW' AND v_to IN ('CHANGES_REQUESTED','REJECTED')) OR
    (v_from IN ('ACTIVE','SCHEDULED') AND v_to = 'PAUSED_ADMIN') OR
    (v_from = 'PAUSED_ADMIN' AND v_to = 'ACTIVE') OR
    (v_from IN ('ACTIVE','SCHEDULED','PAUSED_ADMIN','PAUSED_OWNER') AND v_to IN ('ENDED','TERMINATED')) OR
    (v_from IN ('ENDED','REJECTED','TERMINATED') AND v_to = 'ARCHIVED') OR
    (v_from = 'CHANGES_REQUESTED' AND v_to IN ('UNDER_REVIEW','REJECTED'))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', v_to);
  END IF;

  IF p_action = 'approve' THEN
    IF v_row.start_at > v_now THEN
      v_go_live := 'SCHEDULED';
    ELSE
      v_go_live := 'ACTIVE';
    END IF;
    v_to := v_go_live;
  END IF;

  -- MODEL B: OWNER_PAID cannot enter ACTIVE without FUNDED Business Cash
  IF v_to = 'ACTIVE' AND NOT public.delivery_ad_campaign_funding_allows_active(
    p_product_kind, p_campaign_id, v_source
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'funding_required');
  END IF;

  v_is_active := (v_to IN ('ACTIVE','SCHEDULED'));

  IF p_product_kind = 'banner' THEN
    UPDATE public.store_banner_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      review_status = COALESCE(v_review, review_status),
      review_notes = CASE
        WHEN p_action IN ('request_changes','reject','pause','terminate')
          THEN nullif(trim(coalesce(p_owner_visible_notes, p_reason)), '')
        WHEN p_action = 'approve' THEN NULL
        ELSE review_notes
      END,
      reviewed_at = CASE WHEN p_action IN ('approve','reject','request_changes','start_review') THEN v_now ELSE reviewed_at END,
      approved_at = CASE WHEN p_action = 'approve' THEN v_now ELSE approved_at END,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      paused_at = CASE WHEN v_to = 'PAUSED_ADMIN' THEN v_now ELSE paused_at END,
      ended_at = CASE WHEN v_to IN ('ENDED','TERMINATED') THEN v_now ELSE ended_at END,
      archived_at = CASE WHEN v_to = 'ARCHIVED' THEN v_now ELSE archived_at END,
      updated_by_user_id = p_admin_user_id,
      updated_at = v_now
    WHERE id = p_campaign_id;

    IF p_action = 'approve' AND v_row.creative_id IS NOT NULL THEN
      UPDATE public.delivery_ad_creatives
      SET review_status = 'APPROVED', updated_at = v_now
      WHERE id = v_row.creative_id;
    ELSIF p_action = 'reject' AND v_row.creative_id IS NOT NULL THEN
      UPDATE public.delivery_ad_creatives
      SET review_status = 'REJECTED', updated_at = v_now
      WHERE id = v_row.creative_id;
    ELSIF p_action = 'request_changes' AND v_row.creative_id IS NOT NULL THEN
      UPDATE public.delivery_ad_creatives
      SET review_status = 'CHANGES_REQUESTED', updated_at = v_now
      WHERE id = v_row.creative_id;
    END IF;
  ELSE
    UPDATE public.store_paid_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      review_status = COALESCE(v_review, review_status),
      review_notes = CASE
        WHEN p_action IN ('request_changes','reject','pause','terminate')
          THEN nullif(trim(coalesce(p_owner_visible_notes, p_reason)), '')
        WHEN p_action = 'approve' THEN NULL
        ELSE review_notes
      END,
      reviewed_at = CASE WHEN p_action IN ('approve','reject','request_changes','start_review') THEN v_now ELSE reviewed_at END,
      approved_at = CASE WHEN p_action = 'approve' THEN v_now ELSE approved_at END,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      paused_at = CASE WHEN v_to = 'PAUSED_ADMIN' THEN v_now ELSE paused_at END,
      ended_at = CASE WHEN v_to IN ('ENDED','TERMINATED') THEN v_now ELSE ended_at END,
      archived_at = CASE WHEN v_to = 'ARCHIVED' THEN v_now ELSE archived_at END,
      updated_by_user_id = p_admin_user_id,
      updated_at = v_now
    WHERE id = p_campaign_id;
  END IF;

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, reason, before_json, after_json
  ) VALUES (
    p_product_kind, p_campaign_id, 'admin', p_admin_user_id, v_audit_action,
    nullif(trim(coalesce(p_reason, '')), ''),
    jsonb_build_object('lifecycle', v_from, 'updated_at', v_row.updated_at),
    jsonb_build_object('lifecycle', v_to, 'action', p_action)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'from', v_from,
    'to', v_to,
    'action', p_action
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delivery_ad_transition(uuid, text, uuid, text, text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delivery_ad_transition(uuid, text, uuid, text, text, timestamptz, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivery_ad_transition(uuid, text, uuid, text, text, timestamptz, text, text) TO service_role;

-- ── Patch schedule promoter: activate_due requires funding ──────────────────
CREATE OR REPLACE FUNCTION public.delivery_ad_system_schedule_transition(
  p_product_kind text,
  p_campaign_id uuid,
  p_action text,
  p_expected_lifecycle text,
  p_expected_updated_at timestamptz
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
  v_now timestamptz := now();
  v_audit_action text;
  v_audit_id uuid;
  v_is_active boolean;
  v_source text;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;

  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  IF p_action NOT IN ('activate_due', 'end_due') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  IF p_product_kind = 'banner' THEN
    SELECT * INTO v_row FROM public.store_banner_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  ELSE
    SELECT * INTO v_row FROM public.store_paid_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;

  v_from := v_row.lifecycle_status;
  v_source := coalesce(v_row.campaign_source, 'OWNER_PAID');

  IF p_expected_lifecycle IS NOT NULL AND v_from IS DISTINCT FROM p_expected_lifecycle THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_lifecycle', 'current', v_from);
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  END IF;

  IF p_action = 'activate_due' THEN
    IF v_from IS DISTINCT FROM 'SCHEDULED' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', 'ACTIVE');
    END IF;
    IF v_row.start_at > v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_due', 'detail', 'start_at_future');
    END IF;
    IF v_row.end_at <= v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_due', 'detail', 'end_at_passed');
    END IF;
    IF NOT public.delivery_ad_campaign_funding_allows_active(
      p_product_kind, p_campaign_id, v_source
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'funding_required');
    END IF;
    v_to := 'ACTIVE';
    v_audit_action := 'system_activated';
  ELSE
    IF v_from NOT IN ('ACTIVE', 'SCHEDULED') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', 'ENDED');
    END IF;
    IF v_row.end_at > v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_due', 'detail', 'end_at_future');
    END IF;
    v_to := 'ENDED';
    v_audit_action := 'system_ended';
  END IF;

  v_is_active := (v_to IN ('ACTIVE', 'SCHEDULED'));

  IF p_product_kind = 'banner' THEN
    UPDATE public.store_banner_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      ended_at = CASE WHEN v_to = 'ENDED' THEN v_now ELSE ended_at END,
      updated_at = v_now
    WHERE id = p_campaign_id;
  ELSE
    UPDATE public.store_paid_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      ended_at = CASE WHEN v_to = 'ENDED' THEN v_now ELSE ended_at END,
      updated_at = v_now
    WHERE id = p_campaign_id;
  END IF;

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, reason, before_json, after_json
  ) VALUES (
    p_product_kind,
    p_campaign_id,
    'system',
    NULL,
    v_audit_action,
    NULL,
    jsonb_build_object('lifecycle', v_from, 'updated_at', v_row.updated_at),
    jsonb_build_object('lifecycle', v_to, 'action', p_action)
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

COMMENT ON FUNCTION public.delivery_ad_system_schedule_transition(text, uuid, text, text, timestamptz) IS
  'System schedule promoter with MODEL B Business Cash ACTIVE gate for OWNER_PAID.';

REVOKE ALL ON FUNCTION public.delivery_ad_system_schedule_transition(text, uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_system_schedule_transition(text, uuid, text, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_system_schedule_transition(text, uuid, text, text, timestamptz) TO service_role;

COMMIT;
