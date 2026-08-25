-- FREE COUPON: usage window + first-order claim + entitlements RLS

BEGIN;

ALTER TABLE public.store_coupon_campaigns
  ADD COLUMN IF NOT EXISTS usage_end_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS claim_valid_days integer NULL;

CREATE OR REPLACE FUNCTION public.claim_store_coupon(
  p_buyer_user_id uuid,
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign record;
  v_reserve numeric;
  v_id uuid;
  v_expires timestamptz;
  v_ttl timestamptz;
BEGIN
  IF p_buyer_user_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_ids', 'http_status', 400);
  END IF;

  SELECT *
    INTO v_campaign
    FROM public.store_coupon_campaigns
   WHERE id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'coupon_not_found', 'http_status', 404);
  END IF;

  IF v_campaign.lifecycle_state = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'coupon_revoked', 'http_status', 400);
  END IF;

  IF v_campaign.lifecycle_state NOT IN ('active', 'scheduled')
     OR v_campaign.is_active IS NOT TRUE
     OR v_campaign.start_at > clock_timestamp()
     OR v_campaign.end_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'coupon_inactive', 'http_status', 400);
  END IF;

  IF v_campaign.first_order_scope = 'STORE' THEN
    IF EXISTS (
      SELECT 1 FROM public.store_orders o
       WHERE o.store_id = v_campaign.store_id
         AND o.buyer_user_id = p_buyer_user_id
         AND o.order_status = 'completed'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'first_order_ineligible', 'http_status', 403);
    END IF;
  ELSIF v_campaign.first_order_scope = 'PLATFORM' THEN
    IF EXISTS (
      SELECT 1 FROM public.store_orders o
       WHERE o.buyer_user_id = p_buyer_user_id
         AND o.order_status = 'completed'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'first_order_ineligible', 'http_status', 403);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coupon_user_entitlements e
     WHERE e.buyer_user_id = p_buyer_user_id
       AND e.campaign_id = p_campaign_id
       AND e.status IN ('available', 'restored')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed', 'http_status', 409);
  END IF;

  IF v_campaign.issue_limit IS NOT NULL AND v_campaign.issued_count >= v_campaign.issue_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ISSUE_LIMIT_REACHED', 'http_status', 409);
  END IF;

  IF v_campaign.discount_type = 'percent' THEN
    IF v_campaign.spend_budget_php IS NOT NULL AND v_campaign.max_discount IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'max_discount_required', 'http_status', 400);
    END IF;
    v_reserve := coalesce(v_campaign.max_discount, 0);
    IF v_reserve <= 0 THEN
      v_reserve := 0;
    END IF;
  ELSE
    v_reserve := v_campaign.discount_value;
  END IF;

  IF v_campaign.spend_budget_php IS NOT NULL
     AND (v_campaign.reserved_spend_php + v_reserve) > v_campaign.spend_budget_php THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ISSUE_LIMIT_REACHED', 'http_status', 409);
  END IF;

  v_expires := coalesce(v_campaign.usage_end_at, v_campaign.end_at);
  IF v_campaign.claim_valid_days IS NOT NULL AND v_campaign.claim_valid_days > 0 THEN
    v_ttl := clock_timestamp() + make_interval(days => v_campaign.claim_valid_days);
    IF v_ttl < v_expires THEN
      v_expires := v_ttl;
    END IF;
  END IF;

  INSERT INTO public.coupon_user_entitlements (
    campaign_id, store_id, buyer_user_id, status, reserved_php, expires_at
  ) VALUES (
    v_campaign.id,
    v_campaign.store_id,
    p_buyer_user_id,
    'available',
    v_reserve,
    v_expires
  )
  RETURNING id INTO v_id;

  UPDATE public.store_coupon_campaigns
     SET issued_count = issued_count + 1,
         reserved_spend_php = reserved_spend_php + v_reserve,
         updated_at = now()
   WHERE id = v_campaign.id;

  INSERT INTO public.coupon_audit_events (campaign_id, entitlement_id, actor_user_id, action, payload)
  VALUES (
    v_campaign.id, v_id, p_buyer_user_id, 'claim',
    jsonb_build_object('reserved_php', v_reserve, 'expires_at', v_expires)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'entitlement', jsonb_build_object(
      'id', v_id,
      'campaign_id', v_campaign.id,
      'reserved_php', v_reserve,
      'expires_at', v_expires
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_store_coupon(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_store_coupon_entitlement(uuid, boolean) TO authenticated, service_role;

DROP POLICY IF EXISTS coupon_user_entitlements_select_own ON public.coupon_user_entitlements;
CREATE POLICY coupon_user_entitlements_select_own
  ON public.coupon_user_entitlements
  FOR SELECT
  USING (buyer_user_id = auth.uid());

COMMIT;
