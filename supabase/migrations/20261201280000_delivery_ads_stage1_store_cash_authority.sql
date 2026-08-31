-- Stage 1 — Delivery Ads STORE FINANCE AUTHORITY
-- ADS_SPEND_AUTHORITY = Store Cash (AD_SPEND / AD_REFUND)
-- DEBIT_REFUND: debit on valid submit; refund on terminal REJECT only.
-- CHANGES_REQUESTED / RESUBMIT: no refund, no second debit.
-- Legacy delivery_ad_* Business Cash tables PRESERVED (MIGRATE; no drop / no balance transfer).

BEGIN;

-- ── 1) Extend Store Cash ledger vocabulary ──────────────────────────────────
ALTER TABLE public.store_cash_ledger
  DROP CONSTRAINT IF EXISTS store_cash_ledger_source_type_check;

ALTER TABLE public.store_cash_ledger
  ADD CONSTRAINT store_cash_ledger_source_type_check
  CHECK (source_type IN (
    'GIFT_REVENUE_CONVERSION',
    'GIFT_REDEMPTION_REVERSAL',
    'RECOVERY_CLEAR',
    'GIFT_RECOGNITION_CORRECTION',
    'AD_SPEND',
    'AD_REFUND'
  ));

-- ── 2) Campaign ↔ Store Cash spend binding (canonical funds-secured mark) ───
CREATE TABLE IF NOT EXISTS public.delivery_ad_store_cash_spends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id),
  campaign_id uuid NOT NULL,
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  amount_php integer NOT NULL CHECK (amount_php > 0),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'PHP',
  commercial_snapshot_id uuid NULL
    REFERENCES public.delivery_ad_campaign_commercial_snapshots (id),
  spend_ledger_id uuid NOT NULL REFERENCES public.store_cash_ledger (id),
  refund_ledger_id uuid NULL REFERENCES public.store_cash_ledger (id),
  status text NOT NULL CHECK (status IN ('SECURED', 'REFUNDED')),
  secured_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_store_cash_spends_campaign_uidx UNIQUE (campaign_id, product_kind)
);

CREATE INDEX IF NOT EXISTS delivery_ad_store_cash_spends_store_idx
  ON public.delivery_ad_store_cash_spends (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS delivery_ad_store_cash_spends_status_idx
  ON public.delivery_ad_store_cash_spends (status);

COMMENT ON TABLE public.delivery_ad_store_cash_spends IS
  'Stage 1 Delivery Ads funds-secured mark backed by Store Cash AD_SPEND. Legacy Business Cash fundings are MIGRATION_SOURCE only.';

ALTER TABLE public.delivery_ad_store_cash_spends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_ad_store_cash_spends_owner_select ON public.delivery_ad_store_cash_spends;
CREATE POLICY delivery_ad_store_cash_spends_owner_select
  ON public.delivery_ad_store_cash_spends FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_user_id = auth.uid()
    )
  );

-- ── 3) ACTIVE gate — Store Cash SECURED (not Business Cash FUNDED) ──────────
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
    FROM public.delivery_ad_store_cash_spends s
    WHERE s.campaign_id = p_campaign_id
      AND s.product_kind = p_product_kind
      AND s.status = 'SECURED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_campaign_funding_allows_active(text, uuid, text) TO service_role;

-- ── 4) Debit Store Cash for Delivery Ad (exactly-once per campaign) ─────────
CREATE OR REPLACE FUNCTION public.store_cash_delivery_ad_spend(
  p_owner_user_id uuid,
  p_store_id uuid,
  p_campaign_id uuid,
  p_product_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_snap public.delivery_ad_campaign_commercial_snapshots;
  v_existing public.delivery_ad_store_cash_spends;
  v_cash_balance integer;
  v_new_cash integer;
  v_amount_minor bigint;
  v_amount_php integer;
  v_ledger_id uuid;
  v_spend_id uuid;
BEGIN
  IF p_owner_user_id IS NULL OR p_store_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  -- Idempotent: already secured
  SELECT * INTO v_existing
  FROM public.delivery_ad_store_cash_spends
  WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status = 'SECURED' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'status', 'SECURED',
        'spend_id', v_existing.id,
        'spend_ledger_id', v_existing.spend_ledger_id,
        'amount_php', v_existing.amount_php,
        'amount_minor', v_existing.amount_minor,
        'store_id', v_existing.store_id
      );
    END IF;
    IF v_existing.status = 'REFUNDED' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_refunded');
    END IF;
  END IF;

  IF p_product_kind = 'banner' THEN
    SELECT id, store_id, owner_user_id, lifecycle_status, campaign_source
      INTO v_row
    FROM public.store_banner_ad_campaigns
    WHERE id = p_campaign_id
    FOR UPDATE;
  ELSE
    SELECT id, store_id, owner_user_id, lifecycle_status, campaign_source
      INTO v_row
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
  IF v_row.store_id IS DISTINCT FROM p_store_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF coalesce(v_row.campaign_source, 'OWNER_PAID') = 'DIBAY_FIRST_PARTY' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'first_party_no_store_cash');
  END IF;
  -- Debit-eligible pre-submit states only (first submit or already-secured resubmit path handled above)
  IF v_row.lifecycle_status NOT IN ('DRAFT', 'CHANGES_REQUESTED') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_debit_eligible',
      'lifecycle', v_row.lifecycle_status
    );
  END IF;

  -- CHANGES_REQUESTED without prior spend should not happen under product contract;
  -- still allow debit once if somehow missing (fail-closed to one spend via unique).
  SELECT * INTO v_snap
  FROM public.delivery_ad_campaign_commercial_snapshots
  WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'snapshot_missing');
  END IF;
  IF v_snap.campaign_source IS DISTINCT FROM 'OWNER_PAID' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'first_party_no_store_cash');
  END IF;
  IF v_snap.commercial_status IS DISTINCT FROM 'PRICED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'snapshot_not_priced', 'status', v_snap.commercial_status);
  END IF;
  IF v_snap.final_payable_minor IS NULL OR v_snap.final_payable_minor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payable');
  END IF;

  v_amount_minor := v_snap.final_payable_minor;
  -- Store Cash = whole PHP pesos; commercial = minor (centavos). Require exact pesos.
  IF (v_amount_minor % 100) <> 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'payable_not_whole_peso',
      'amount_minor', v_amount_minor
    );
  END IF;
  v_amount_php := (v_amount_minor / 100)::integer;
  IF v_amount_php <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payable');
  END IF;

  INSERT INTO public.store_cash_accounts (store_id, balance)
  VALUES (p_store_id, 0)
  ON CONFLICT (store_id) DO NOTHING;

  SELECT balance INTO v_cash_balance
  FROM public.store_cash_accounts
  WHERE store_id = p_store_id
  FOR UPDATE;

  IF coalesce(v_cash_balance, 0) < v_amount_php THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INSUFFICIENT_STORE_CASH',
      'available_php', coalesce(v_cash_balance, 0),
      'required_php', v_amount_php,
      'shortage_php', v_amount_php - coalesce(v_cash_balance, 0),
      'available_minor', coalesce(v_cash_balance, 0) * 100,
      'required_minor', v_amount_minor,
      'shortage_minor', (v_amount_php - coalesce(v_cash_balance, 0)) * 100,
      'currency', coalesce(v_snap.currency, 'PHP')
    );
  END IF;

  v_new_cash := coalesce(v_cash_balance, 0) - v_amount_php;
  UPDATE public.store_cash_accounts
  SET balance = v_new_cash, updated_at = now()
  WHERE store_id = p_store_id;

  BEGIN
    INSERT INTO public.store_cash_ledger (
      store_id, amount, balance_after, source_type, related_type, related_id
    ) VALUES (
      p_store_id, -v_amount_php, v_new_cash,
      'AD_SPEND', 'delivery_ad_campaign', p_campaign_id::text
    )
    RETURNING id INTO v_ledger_id;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent second debit blocked by ledger unique; recover existing spend mark if any
    SELECT * INTO v_existing
    FROM public.delivery_ad_store_cash_spends
    WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind;
    IF FOUND AND v_existing.status = 'SECURED' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'status', 'SECURED',
        'spend_id', v_existing.id,
        'spend_ledger_id', v_existing.spend_ledger_id,
        'amount_php', v_existing.amount_php,
        'amount_minor', v_existing.amount_minor,
        'store_id', v_existing.store_id
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_spend');
  END;

  INSERT INTO public.delivery_ad_store_cash_spends (
    store_id, campaign_id, product_kind, amount_php, amount_minor, currency,
    commercial_snapshot_id, spend_ledger_id, status
  ) VALUES (
    p_store_id, p_campaign_id, p_product_kind, v_amount_php, v_amount_minor,
    coalesce(v_snap.currency, 'PHP'), v_snap.id, v_ledger_id, 'SECURED'
  )
  RETURNING id INTO v_spend_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', 'SECURED',
    'spend_id', v_spend_id,
    'spend_ledger_id', v_ledger_id,
    'amount_php', v_amount_php,
    'amount_minor', v_amount_minor,
    'balance_after_php', v_new_cash,
    'store_id', p_store_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.store_cash_delivery_ad_spend(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_cash_delivery_ad_spend(uuid, uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_cash_delivery_ad_spend(uuid, uuid, uuid, text) TO service_role;

-- ── 5) Refund Store Cash on terminal Admin REJECT (exactly-once) ────────────
CREATE OR REPLACE FUNCTION public.store_cash_delivery_ad_refund(
  p_admin_user_id uuid,
  p_campaign_id uuid,
  p_product_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spend public.delivery_ad_store_cash_spends;
  v_lifecycle text;
  v_cash_balance integer;
  v_new_cash integer;
  v_refund_ledger_id uuid;
BEGIN
  IF p_admin_user_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  SELECT * INTO v_spend
  FROM public.delivery_ad_store_cash_spends
  WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'spend_not_found');
  END IF;
  IF v_spend.status = 'REFUNDED' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', 'REFUNDED',
      'spend_id', v_spend.id,
      'refund_ledger_id', v_spend.refund_ledger_id,
      'amount_php', v_spend.amount_php
    );
  END IF;
  IF v_spend.status IS DISTINCT FROM 'SECURED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_secured');
  END IF;

  IF p_product_kind = 'banner' THEN
    SELECT lifecycle_status INTO v_lifecycle
    FROM public.store_banner_ad_campaigns
    WHERE id = p_campaign_id;
  ELSE
    SELECT lifecycle_status INTO v_lifecycle
    FROM public.store_paid_ad_campaigns
    WHERE id = p_campaign_id;
  END IF;
  IF v_lifecycle IS DISTINCT FROM 'REJECTED' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_terminal_reject',
      'lifecycle', v_lifecycle
    );
  END IF;

  INSERT INTO public.store_cash_accounts (store_id, balance)
  VALUES (v_spend.store_id, 0)
  ON CONFLICT (store_id) DO NOTHING;

  SELECT balance INTO v_cash_balance
  FROM public.store_cash_accounts
  WHERE store_id = v_spend.store_id
  FOR UPDATE;

  v_new_cash := coalesce(v_cash_balance, 0) + v_spend.amount_php;
  UPDATE public.store_cash_accounts
  SET balance = v_new_cash, updated_at = now()
  WHERE store_id = v_spend.store_id;

  BEGIN
    INSERT INTO public.store_cash_ledger (
      store_id, amount, balance_after, source_type, related_type, related_id
    ) VALUES (
      v_spend.store_id, v_spend.amount_php, v_new_cash,
      'AD_REFUND', 'delivery_ad_spend', v_spend.spend_ledger_id::text
    )
    RETURNING id INTO v_refund_ledger_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_spend
    FROM public.delivery_ad_store_cash_spends
    WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind;
    IF FOUND AND v_spend.status = 'REFUNDED' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'status', 'REFUNDED',
        'spend_id', v_spend.id,
        'refund_ledger_id', v_spend.refund_ledger_id,
        'amount_php', v_spend.amount_php
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_refund');
  END;

  UPDATE public.delivery_ad_store_cash_spends
  SET status = 'REFUNDED',
      refund_ledger_id = v_refund_ledger_id,
      refunded_at = now(),
      updated_at = now()
  WHERE id = v_spend.id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', 'REFUNDED',
    'spend_id', v_spend.id,
    'refund_ledger_id', v_refund_ledger_id,
    'amount_php', v_spend.amount_php,
    'balance_after_php', v_new_cash,
    'store_id', v_spend.store_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.store_cash_delivery_ad_refund(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_cash_delivery_ad_refund(uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_cash_delivery_ad_refund(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.store_cash_delivery_ad_spend(uuid, uuid, uuid, text) IS
  'Stage 1: exactly-once Store Cash AD_SPEND for OWNER_PAID Delivery Ad submit. Amount from commercial snapshot. No Business Cash.';
COMMENT ON FUNCTION public.store_cash_delivery_ad_refund(uuid, uuid, text) IS
  'Stage 1: exactly-once Store Cash AD_REFUND after terminal REJECTED. Original spend amount only.';

COMMIT;
