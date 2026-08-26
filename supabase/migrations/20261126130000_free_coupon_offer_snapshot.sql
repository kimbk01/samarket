-- FREE COUPON SSOT v1.0 — offer_snapshot on Coupon Instance (claim-time Offer contract)
-- PRODUCT: new claims must write snapshot. Historical rows: NULL OK (live JOIN fallback).
-- No fake backfill. No global NOT NULL on coupon_number.

BEGIN;

ALTER TABLE public.coupon_user_entitlements
  ADD COLUMN IF NOT EXISTS offer_snapshot jsonb NULL;

COMMENT ON COLUMN public.coupon_user_entitlements.offer_snapshot IS
  'SSOT Coupon Face contract at claim: title, benefit, conditions, period, provider. JPEG is not authority.';

-- Order display snapshot (title + number at checkout). Historical NULL OK.
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS coupon_offer_title text NULL;
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS coupon_number text NULL;

COMMENT ON COLUMN public.store_orders.coupon_offer_title IS
  'Coupon Offer title snapshot at checkout for buyer/order UI.';
COMMENT ON COLUMN public.store_orders.coupon_number IS
  'Coupon Instance number snapshot at checkout for buyer/order UI.';

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
  v_lifetime_count int;
  v_coupon_number text;
  v_attempt int;
  v_insert_ok boolean;
  v_snapshot jsonb;
  v_benefit text;
  v_provider text;
  v_conditions text;
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

  SELECT count(*)::int INTO v_lifetime_count
    FROM public.coupon_user_entitlements e
   WHERE e.buyer_user_id = p_buyer_user_id
     AND e.campaign_id = p_campaign_id;

  IF v_lifetime_count >= coalesce(v_campaign.max_uses_per_user, 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed', 'http_status', 409);
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
    v_benefit := trim(to_char(v_campaign.discount_value, 'FM999990.##')) || '%';
  ELSE
    v_reserve := v_campaign.discount_value;
    v_benefit := 'PHP ' || trim(to_char(v_campaign.discount_value, 'FM9999990'));
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

  v_provider := CASE coalesce(v_campaign.funding_mode, 'STORE_FUNDED')
    WHEN 'PLATFORM_FUNDED' THEN 'platform'
    WHEN 'SHARED_FUNDED' THEN 'shared'
    ELSE 'store'
  END;
  v_conditions := CASE
    WHEN v_campaign.min_order_amount IS NOT NULL AND v_campaign.min_order_amount > 0
      THEN 'min_order_php=' || trim(to_char(v_campaign.min_order_amount, 'FM9999990'))
    ELSE 'min_order_none'
  END;
  IF coalesce(v_campaign.first_order_scope, '') <> '' AND coalesce(v_campaign.first_order_scope, '') <> 'NONE' THEN
    v_conditions := v_conditions || ';first_order=' || v_campaign.first_order_scope;
  END IF;

  v_snapshot := jsonb_build_object(
    'title', coalesce(v_campaign.title, ''),
    'benefit', v_benefit,
    'discount_type', v_campaign.discount_type,
    'discount_value', v_campaign.discount_value,
    'max_discount', v_campaign.max_discount,
    'min_order_amount', v_campaign.min_order_amount,
    'conditions', v_conditions,
    'period_end', v_expires,
    'provider', v_provider,
    'funding_mode', coalesce(v_campaign.funding_mode, 'STORE_FUNDED'),
    'purpose', v_campaign.campaign_purpose,
    'offer_id', v_campaign.id
  );

  v_insert_ok := false;
  FOR v_attempt IN 1..12 LOOP
    v_coupon_number := public.generate_coupon_serial();
    BEGIN
      INSERT INTO public.coupon_user_entitlements (
        campaign_id, store_id, buyer_user_id, status, reserved_php, expires_at, coupon_number, offer_snapshot
      ) VALUES (
        v_campaign.id,
        v_campaign.store_id,
        p_buyer_user_id,
        'available',
        v_reserve,
        v_expires,
        v_coupon_number,
        v_snapshot
      )
      RETURNING id INTO v_id;
      v_insert_ok := true;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt >= 12 THEN
          RAISE;
        END IF;
    END;
  END LOOP;

  IF NOT v_insert_ok OR v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'serial_collision', 'http_status', 500);
  END IF;

  UPDATE public.store_coupon_campaigns
     SET issued_count = issued_count + 1,
         reserved_spend_php = reserved_spend_php + v_reserve,
         updated_at = now()
   WHERE id = v_campaign.id;

  INSERT INTO public.coupon_audit_events (campaign_id, entitlement_id, actor_user_id, action, payload)
  VALUES (
    v_campaign.id, v_id, p_buyer_user_id, 'claim',
    jsonb_build_object(
      'reserved_php', v_reserve,
      'expires_at', v_expires,
      'coupon_number', v_coupon_number
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'entitlement', jsonb_build_object(
      'id', v_id,
      'campaign_id', v_campaign.id,
      'reserved_php', v_reserve,
      'expires_at', v_expires,
      'coupon_number', v_coupon_number,
      'offer_snapshot', v_snapshot
    )
  );
END;
$$;

COMMIT;
