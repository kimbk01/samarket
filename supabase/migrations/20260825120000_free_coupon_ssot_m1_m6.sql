-- FREE COUPON SSOT M1–M6 (extend store_coupon_campaigns; no paid voucher tables)

BEGIN;

ALTER TABLE public.store_coupon_campaigns
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS funding_mode text NOT NULL DEFAULT 'STORE_FUNDED',
  ADD COLUMN IF NOT EXISTS store_funded_amount numeric(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS issue_limit integer NULL,
  ADD COLUMN IF NOT EXISTS issued_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spend_budget_php numeric(14, 2) NULL,
  ADD COLUMN IF NOT EXISTS reserved_spend_php numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_discount numeric(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS first_order_scope text NULL,
  ADD COLUMN IF NOT EXISTS max_uses_per_user integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS restore_on_full_refund boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_admin_approval boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_coupon_campaigns
  DROP CONSTRAINT IF EXISTS store_coupon_campaigns_funding_mode_chk;
ALTER TABLE public.store_coupon_campaigns
  ADD CONSTRAINT store_coupon_campaigns_funding_mode_chk
  CHECK (funding_mode IN ('STORE_FUNDED', 'PLATFORM_FUNDED', 'SHARED_FUNDED'));

ALTER TABLE public.store_coupon_campaigns
  DROP CONSTRAINT IF EXISTS store_coupon_campaigns_lifecycle_chk;
ALTER TABLE public.store_coupon_campaigns
  ADD CONSTRAINT store_coupon_campaigns_lifecycle_chk
  CHECK (lifecycle_state IN (
    'draft', 'requested', 'approved', 'rejected', 'scheduled',
    'active', 'paused', 'ended', 'revoked'
  ));

UPDATE public.store_coupon_campaigns
   SET funding_mode = 'STORE_FUNDED'
 WHERE funding_mode IS NULL OR funding_mode = '';

CREATE TABLE IF NOT EXISTS public.coupon_user_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.store_coupon_campaigns (id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'redeemed', 'expired', 'revoked', 'restored')),
  reserved_php numeric(12, 2) NOT NULL CHECK (reserved_php >= 0),
  expires_at timestamptz NOT NULL,
  redeemed_order_id uuid NULL REFERENCES public.store_orders (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coupon_user_entitlements_active_buyer_campaign_uidx
  ON public.coupon_user_entitlements (buyer_user_id, campaign_id)
  WHERE status IN ('available', 'restored');

CREATE INDEX IF NOT EXISTS coupon_user_entitlements_buyer_idx
  ON public.coupon_user_entitlements (buyer_user_id, status, expires_at);

CREATE TABLE IF NOT EXISTS public.coupon_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NULL REFERENCES public.store_coupon_campaigns (id) ON DELETE SET NULL,
  entitlement_id uuid NULL REFERENCES public.coupon_user_entitlements (id) ON DELETE SET NULL,
  actor_user_id uuid NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS user_coupon_id uuid NULL
    REFERENCES public.coupon_user_entitlements (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store_funded_amount numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_funded_amount numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_base_amount numeric(12, 2) NULL;

ALTER TABLE public.store_coupon_redemptions
  ADD COLUMN IF NOT EXISTS user_coupon_id uuid NULL
    REFERENCES public.coupon_user_entitlements (id) ON DELETE RESTRICT;

ALTER TABLE public.coupon_user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_audit_events ENABLE ROW LEVEL SECURITY;

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

  INSERT INTO public.coupon_user_entitlements (
    campaign_id, store_id, buyer_user_id, status, reserved_php, expires_at
  ) VALUES (
    v_campaign.id,
    v_campaign.store_id,
    p_buyer_user_id,
    'available',
    v_reserve,
    v_campaign.end_at
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
    jsonb_build_object('reserved_php', v_reserve)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'entitlement', jsonb_build_object(
      'id', v_id,
      'campaign_id', v_campaign.id,
      'reserved_php', v_reserve,
      'expires_at', v_campaign.end_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_store_coupon_entitlement(
  p_order_id uuid,
  p_allow_after_completed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent record;
  v_campaign record;
BEGIN
  SELECT e.*
    INTO v_ent
    FROM public.coupon_user_entitlements e
   WHERE e.redeemed_order_id = p_order_id
     AND e.status = 'redeemed'
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'restored', false);
  END IF;

  SELECT restore_on_full_refund, first_order_scope
    INTO v_campaign
    FROM public.store_coupon_campaigns
   WHERE id = v_ent.campaign_id;

  IF p_allow_after_completed IS TRUE THEN
    IF v_campaign.first_order_scope IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'restored', false, 'reason', 'first_order_no_restore');
    END IF;
    IF v_campaign.restore_on_full_refund IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', true, 'restored', false, 'reason', 'policy_no_restore');
    END IF;
  END IF;

  UPDATE public.coupon_user_entitlements
     SET status = 'available',
         redeemed_order_id = NULL,
         updated_at = now()
   WHERE id = v_ent.id;

  UPDATE public.store_coupon_campaigns
     SET reserved_spend_php = reserved_spend_php + v_ent.reserved_php,
         updated_at = now()
   WHERE id = v_ent.campaign_id;

  DELETE FROM public.store_coupon_redemptions
   WHERE order_id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'restored', true);
END;
$$;

COMMIT;
