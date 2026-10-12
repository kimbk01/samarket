-- DIBAY Finance SSOT-19 · D2 (Delivery ads Cash funding) — F-09
--
-- 1) owner_delivery_ad_transition: submit/resubmit of an OWNER_PAID campaign
--    requires SECURED Business Cash funding (checked under the campaign lock).
-- 2) business_cash_delivery_ad_refund_orphan_draft: controlled admin recovery of
--    Cash secured for a campaign that is still DRAFT (e.g. transition failed and
--    resubmission is impossible). Locks funding then campaign (same order as
--    business_cash_delivery_ad_spend), requires DRAFT + SECURED + reason, uses the
--    canonical idempotency key bc_refund:{kind}:{id}, writes the audit log.
-- owner_delivery_ad_transition body = 20261201210000 (= production) + the check only.

BEGIN;

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

  -- SSOT-19 F-09: an OWNER_PAID submission must be funded (Cash SECURED).
  IF p_action IN ('submit', 'resubmit')
     AND NOT public.delivery_ad_campaign_funding_allows_active(
       p_product_kind, p_campaign_id, v_row.campaign_source
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'funding_required');
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

CREATE OR REPLACE FUNCTION public.business_cash_delivery_ad_refund_orphan_draft(
  p_admin_user_id uuid,
  p_application_id uuid,
  p_product_kind text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fund public.delivery_ad_canonical_bc_fundings;
  v_lifecycle text;
  v_source text;
  v_bal bigint;
  v_ledger uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR p_application_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT * INTO v_fund
    FROM public.delivery_ad_canonical_bc_fundings
   WHERE product_kind = p_product_kind AND application_id = p_application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_fund.status = 'REFUNDED' THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'refunded_minor', v_fund.amount_minor,
      'refund_ledger_id', v_fund.refund_ledger_id
    );
  END IF;
  IF v_fund.status IS DISTINCT FROM 'SECURED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_secured');
  END IF;

  IF p_product_kind = 'banner' THEN
    SELECT lifecycle_status, campaign_source INTO v_lifecycle, v_source
      FROM public.store_banner_ad_campaigns
     WHERE id = p_application_id
     FOR UPDATE;
  ELSE
    SELECT lifecycle_status, campaign_source INTO v_lifecycle, v_source
      FROM public.store_paid_ad_campaigns
     WHERE id = p_application_id
     FOR UPDATE;
  END IF;
  -- A deleted campaign (no row) is an orphan too; anything not DRAFT is not.
  IF FOUND AND (v_lifecycle IS DISTINCT FROM 'DRAFT'
                OR coalesce(v_source, 'OWNER_PAID') = 'DIBAY_FIRST_PARTY') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_orphan', 'lifecycle', v_lifecycle);
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
    v_fund.store_id, 'AD_REFUND', 'credit', v_fund.amount_minor, v_bal,
    'delivery_ad_canonical_bc_fundings', v_fund.id::text,
    'bc_refund:' || p_product_kind || ':' || p_application_id::text,
    'admin', p_admin_user_id
  ) RETURNING id INTO v_ledger;

  UPDATE public.delivery_ad_canonical_bc_fundings
     SET status = 'REFUNDED', refund_ledger_id = v_ledger,
         refunded_at = now(), updated_at = now()
   WHERE id = v_fund.id;

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action,
    before_json, after_json, reason
  ) VALUES (
    p_product_kind, p_application_id, 'admin', p_admin_user_id,
    'admin_refund_orphan_funding',
    jsonb_build_object('funding_status', 'SECURED', 'lifecycle', v_lifecycle),
    jsonb_build_object('funding_status', 'REFUNDED', 'refund_ledger_id', v_ledger,
                       'amount_minor', v_fund.amount_minor),
    btrim(p_reason)
  );

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false,
    'refunded_minor', v_fund.amount_minor,
    'refund_ledger_id', v_ledger
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_cash_delivery_ad_refund_orphan_draft(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_cash_delivery_ad_refund_orphan_draft(uuid, uuid, text, text) TO service_role;

COMMIT;
