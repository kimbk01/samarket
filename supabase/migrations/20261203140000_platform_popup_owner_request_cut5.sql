-- CUT 5 — Owner Paid Platform Popup request SSOT + pricing + BC product_kind.
-- payment != approval. One request → max one campaign.

BEGIN;

-- 1) Pricing registry (Admin-owned; Owner UI never hardcodes price)
CREATE TABLE IF NOT EXISTS public.platform_popup_ad_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'BUSINESS_CASH'
    CHECK (currency = 'BUSINESS_CASH'),
  price_minor bigint NOT NULL CHECK (price_minor > 0),
  duration_days integer NOT NULL DEFAULT 7 CHECK (duration_days > 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_popup_ad_packages (code, name, price_minor, duration_days, sort_order)
VALUES ('POPUP_7D', 'Platform Popup — 7 days', 500000, 7, 10)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.platform_popup_ad_packages IS
  'CUT 5 Admin-owned Popup Advertisement pricing SSOT. Currency = BUSINESS_CASH only.';

-- 2) Owner request authority (NOT the campaign)
CREATE TABLE IF NOT EXISTS public.platform_popup_owner_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  request_status text NOT NULL DEFAULT 'draft'
    CHECK (request_status IN (
      'draft',
      'submitted',
      'under_review',
      'revision_required',
      'approved',
      'rejected',
      'cancelled'
    )),
  payment_status text NOT NULL DEFAULT 'unfunded'
    CHECK (payment_status IN (
      'unfunded',
      'funded',
      'refunded',
      'failed'
    )),
  package_id uuid NULL REFERENCES public.platform_popup_ad_packages (id) ON DELETE SET NULL,
  price_minor bigint NULL CHECK (price_minor IS NULL OR price_minor > 0),
  currency text NOT NULL DEFAULT 'BUSINESS_CASH'
    CHECK (currency = 'BUSINESS_CASH'),
  requested_surfaces text[] NOT NULL DEFAULT ARRAY['GLOBAL']::text[],
  requested_start_at timestamptz NULL,
  requested_end_at timestamptz NULL,
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  cta_type text NOT NULL DEFAULT 'store'
    CHECK (cta_type IN (
      'trade_listing',
      'community_post',
      'store',
      'internal_page',
      'external_url'
    )),
  cta_target text NOT NULL DEFAULT '',
  external_url text NULL,
  suppression_mode text NOT NULL DEFAULT 'TODAY'
    CHECK (suppression_mode IN (
      'CLOSE', 'SESSION', 'TODAY', 'DURATION', 'CAMPAIGN'
    )),
  suppression_duration_seconds integer NULL
    CHECK (suppression_duration_seconds IS NULL OR suppression_duration_seconds > 0),
  creative_asset_path text NULL,
  creative_asset_url text NULL,
  creative_alt_text text NULL,
  revision_reason text NULL,
  rejection_reason text NULL,
  admin_campaign_id uuid NULL REFERENCES public.platform_popup_campaigns (id) ON DELETE SET NULL,
  submit_idempotency_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL,
  reviewed_at timestamptz NULL,
  CONSTRAINT platform_popup_owner_requests_window_check CHECK (
    requested_start_at IS NULL OR requested_end_at IS NULL
    OR requested_start_at < requested_end_at
  ),
  CONSTRAINT platform_popup_owner_requests_submit_idem_uidx UNIQUE (submit_idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_popup_owner_requests_one_campaign_uidx
  ON public.platform_popup_owner_requests (admin_campaign_id)
  WHERE admin_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_popup_owner_requests_owner_store_idx
  ON public.platform_popup_owner_requests (owner_user_id, store_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS platform_popup_owner_requests_status_idx
  ON public.platform_popup_owner_requests (request_status, updated_at DESC);

COMMENT ON TABLE public.platform_popup_owner_requests IS
  'CUT 5 Owner paid popup request SSOT. payment_status != admin approval. One request → max one campaign.';

-- Link campaign.owner_request_id → request (nullable FK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_popup_campaigns_owner_request_fk'
  ) THEN
    ALTER TABLE public.platform_popup_campaigns
      ADD CONSTRAINT platform_popup_campaigns_owner_request_fk
      FOREIGN KEY (owner_request_id)
      REFERENCES public.platform_popup_owner_requests (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS platform_popup_campaigns_one_per_owner_request_uidx
  ON public.platform_popup_campaigns (owner_request_id)
  WHERE owner_request_id IS NOT NULL;

-- RLS
ALTER TABLE public.platform_popup_ad_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_popup_owner_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_popup_ad_packages FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_popup_ad_packages FROM anon, authenticated;
GRANT SELECT ON TABLE public.platform_popup_ad_packages TO authenticated;
GRANT ALL ON TABLE public.platform_popup_ad_packages TO service_role;

REVOKE ALL ON TABLE public.platform_popup_owner_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_popup_owner_requests FROM anon, authenticated;
GRANT SELECT ON TABLE public.platform_popup_owner_requests TO authenticated;
GRANT ALL ON TABLE public.platform_popup_owner_requests TO service_role;

-- Match CUT 1 / Delivery Ads: is_platform_admin(auth.uid()).
-- Packages: authenticated may SELECT (Owner pricing discovery). Writes = service_role only.
DROP POLICY IF EXISTS platform_popup_ad_packages_admin_select ON public.platform_popup_ad_packages;
DROP POLICY IF EXISTS platform_popup_ad_packages_authenticated_select ON public.platform_popup_ad_packages;
CREATE POLICY platform_popup_ad_packages_authenticated_select
  ON public.platform_popup_ad_packages FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS platform_popup_owner_requests_owner_select ON public.platform_popup_owner_requests;
CREATE POLICY platform_popup_owner_requests_owner_select
  ON public.platform_popup_owner_requests FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
  );

-- 3) Extend Business Cash funding product_kind for platform_popup
ALTER TABLE public.delivery_ad_canonical_bc_fundings
  DROP CONSTRAINT IF EXISTS delivery_ad_canonical_bc_fundings_product_kind_check;

ALTER TABLE public.delivery_ad_canonical_bc_fundings
  ADD CONSTRAINT delivery_ad_canonical_bc_fundings_product_kind_check
  CHECK (product_kind IN ('store_sponsored', 'banner', 'partner', 'platform_popup'));

-- Spend: treat platform_popup like partner (explicit amount_minor + store ownership)
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
  v_req public.platform_popup_owner_requests;
  v_amount_minor bigint;
  v_bal bigint;
  v_new bigint;
  v_ledger uuid;
  v_fund uuid;
BEGIN
  IF p_owner_user_id IS NULL OR p_store_id IS NULL OR p_application_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner', 'partner', 'platform_popup') THEN
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

  IF p_product_kind IN ('partner', 'platform_popup') THEN
    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
    END IF;
    IF p_product_kind = 'platform_popup' THEN
      SELECT * INTO v_req
      FROM public.platform_popup_owner_requests
      WHERE id = p_application_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
      END IF;
      IF v_req.owner_user_id IS DISTINCT FROM p_owner_user_id
         OR v_req.store_id IS DISTINCT FROM p_store_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
      END IF;
      IF v_req.request_status NOT IN ('draft', 'revision_required') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_debit_eligible', 'status', v_req.request_status);
      END IF;
      IF v_req.price_minor IS NULL OR v_req.price_minor <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'price_missing');
      END IF;
      IF p_amount_minor IS DISTINCT FROM v_req.price_minor THEN
        RETURN jsonb_build_object('ok', false, 'error', 'amount_mismatch');
      END IF;
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
    store_id, entry_type, amount_minor, balance_after_minor,
    meta, idempotency_key, created_by
  ) VALUES (
    p_store_id,
    CASE WHEN p_product_kind = 'partner' THEN 'PARTNER_SPEND' ELSE 'AD_SPEND' END,
    -v_amount_minor,
    v_new,
    jsonb_build_object('product_kind', p_product_kind, 'application_id', p_application_id::text),
    'bc_spend:' || p_product_kind || ':' || p_application_id::text,
    p_owner_user_id
  )
  RETURNING id INTO v_ledger;

  INSERT INTO public.delivery_ad_canonical_bc_fundings (
    store_id, product_kind, application_id, amount_minor,
    status, spend_ledger_id, created_by
  ) VALUES (
    p_store_id, p_product_kind, p_application_id, v_amount_minor,
    'SECURED', v_ledger, p_owner_user_id
  )
  RETURNING id INTO v_fund;

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
  v_existing public.delivery_ad_canonical_bc_fundings;
  v_bal bigint;
  v_new bigint;
  v_ledger uuid;
BEGIN
  IF p_admin_user_id IS NULL OR p_application_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner', 'partner', 'platform_popup') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  SELECT * INTO v_existing
  FROM public.delivery_ad_canonical_bc_fundings
  WHERE product_kind = p_product_kind AND application_id = p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'funding_not_found');
  END IF;
  IF v_existing.status = 'REFUNDED' THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'status', 'REFUNDED',
      'funding_id', v_existing.id,
      'refund_ledger_id', v_existing.refund_ledger_id,
      'amount_minor', v_existing.amount_minor
    );
  END IF;
  IF v_existing.status IS DISTINCT FROM 'SECURED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_refundable');
  END IF;

  PERFORM public.ensure_business_cash_account(v_existing.store_id);
  SELECT balance_minor INTO v_bal FROM public.business_cash_accounts WHERE store_id = v_existing.store_id FOR UPDATE;
  v_new := v_bal + v_existing.amount_minor;
  UPDATE public.business_cash_accounts
  SET balance_minor = v_new, updated_at = now()
  WHERE store_id = v_existing.store_id;

  INSERT INTO public.business_cash_ledger (
    store_id, entry_type, amount_minor, balance_after_minor,
    meta, idempotency_key, created_by
  ) VALUES (
    v_existing.store_id,
    CASE WHEN p_product_kind = 'partner' THEN 'PARTNER_REFUND' ELSE 'AD_REFUND' END,
    v_existing.amount_minor,
    v_new,
    jsonb_build_object('product_kind', p_product_kind, 'application_id', p_application_id::text),
    'bc_refund:' || p_product_kind || ':' || p_application_id::text,
    p_admin_user_id
  )
  RETURNING id INTO v_ledger;

  UPDATE public.delivery_ad_canonical_bc_fundings
  SET status = 'REFUNDED', refund_ledger_id = v_ledger, updated_at = now()
  WHERE id = v_existing.id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', 'REFUNDED',
    'funding_id', v_existing.id,
    'refund_ledger_id', v_ledger,
    'amount_minor', v_existing.amount_minor
  );
END;
$$;

COMMIT;
