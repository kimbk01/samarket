-- P6 first-divergence fix:
-- CUT5 rewrote business_cash_delivery_ad_spend/refund with bogus ledger columns
-- (entry_type / meta / created_by). Canonical AST-005 ledger uses
-- entry_kind + direction + related_* + actor_*.
-- Restore AST insert shape while keeping platform_popup product_kind support.

BEGIN;

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
  IF p_product_kind NOT IN ('store_sponsored', 'banner', 'partner', 'platform_popup') THEN
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
      'refund_ledger_id', v_fund.refund_ledger_id,
      'amount_minor', v_fund.amount_minor,
      'status', 'REFUNDED'
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
  SET
    status = 'REFUNDED',
    refund_ledger_id = v_ledger,
    refunded_at = now(),
    updated_at = now()
  WHERE id = v_fund.id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', 'REFUNDED',
    'funding_id', v_fund.id,
    'refund_ledger_id', v_ledger,
    'amount_minor', v_fund.amount_minor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_cash_delivery_ad_spend(uuid, uuid, uuid, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_cash_delivery_ad_refund(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_cash_delivery_ad_spend(uuid, uuid, uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_cash_delivery_ad_refund(uuid, uuid, text) TO service_role;

COMMIT;
