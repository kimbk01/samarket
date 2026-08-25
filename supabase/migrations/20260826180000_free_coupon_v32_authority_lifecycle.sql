-- FREE COUPON v3.2 — issuer_role, campaign_purpose, coupon_number, lifecycle RPCs
-- Historical rows: NULL allowed, no backfill. Forward writes set authority explicitly.

BEGIN;

ALTER TABLE public.store_coupon_campaigns
  ADD COLUMN IF NOT EXISTS issuer_role text NULL,
  ADD COLUMN IF NOT EXISTS campaign_purpose text NULL;

ALTER TABLE public.store_coupon_campaigns
  DROP CONSTRAINT IF EXISTS store_coupon_campaigns_issuer_role_chk;
ALTER TABLE public.store_coupon_campaigns
  ADD CONSTRAINT store_coupon_campaigns_issuer_role_chk
  CHECK (issuer_role IS NULL OR issuer_role IN ('owner', 'admin', 'system'));

ALTER TABLE public.store_coupon_campaigns
  DROP CONSTRAINT IF EXISTS store_coupon_campaigns_purpose_chk;
ALTER TABLE public.store_coupon_campaigns
  ADD CONSTRAINT store_coupon_campaigns_purpose_chk
  CHECK (
    campaign_purpose IS NULL OR campaign_purpose IN (
      'new_customer_acquisition',
      'repeat_purchase',
      'new_menu_promotion',
      'store_promotion',
      'platform_event'
    )
  );

ALTER TABLE public.coupon_user_entitlements
  ADD COLUMN IF NOT EXISTS coupon_number text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coupon_user_entitlements_coupon_number_uidx
  ON public.coupon_user_entitlements (coupon_number)
  WHERE coupon_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_coupon_serial()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_chars constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_date text;
  v_part text := '';
  v_seq int;
  i int;
BEGIN
  v_date := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYMMDD');
  v_seq := floor(random() * 100)::int;
  FOR i IN 1..5 LOOP
    v_part := v_part || substr(v_chars, (floor(random() * length(v_chars))::int + 1), 1);
  END LOOP;
  RETURN 'CP-' || v_date || '-' || v_part || '-' || lpad(v_seq::text, 2, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_coupon_campaign_issued(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issued int;
  v_count int;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_campaign_id');
  END IF;
  SELECT issued_count INTO v_issued
    FROM public.store_coupon_campaigns
   WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;
  SELECT count(*)::int INTO v_count
    FROM public.coupon_user_entitlements
   WHERE campaign_id = p_campaign_id;
  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'issued_count', coalesce(v_issued, 0),
    'entitlement_count', coalesce(v_count, 0),
    'consistent', coalesce(v_issued, 0) = coalesce(v_count, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_coupon_entitlements(p_batch_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent record;
  v_expired int := 0;
  v_reserved_released numeric := 0;
BEGIN
  FOR v_ent IN
    SELECT e.id, e.campaign_id, e.reserved_php
      FROM public.coupon_user_entitlements e
     WHERE e.status IN ('available', 'restored')
       AND e.expires_at <= clock_timestamp()
     ORDER BY e.expires_at ASC
     LIMIT greatest(1, least(coalesce(p_batch_limit, 500), 5000))
     FOR UPDATE OF e
  LOOP
    UPDATE public.coupon_user_entitlements
       SET status = 'expired',
           updated_at = now()
     WHERE id = v_ent.id
       AND status IN ('available', 'restored');

    IF FOUND THEN
      UPDATE public.store_coupon_campaigns
         SET reserved_spend_php = greatest(0, reserved_spend_php - v_ent.reserved_php),
             updated_at = now()
       WHERE id = v_ent.campaign_id;
      v_expired := v_expired + 1;
      v_reserved_released := v_reserved_released + coalesce(v_ent.reserved_php, 0);
      INSERT INTO public.coupon_audit_events (campaign_id, entitlement_id, action, payload)
      VALUES (
        v_ent.campaign_id,
        v_ent.id,
        'expire',
        jsonb_build_object('reserved_released', v_ent.reserved_php)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'expired_count', v_expired,
    'reserved_released', v_reserved_released
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_campaign_active_entitlements(
  p_campaign_id uuid,
  p_actor_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent record;
  v_revoked int := 0;
  v_reserved_released numeric := 0;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_campaign_id');
  END IF;

  PERFORM 1 FROM public.store_coupon_campaigns WHERE id = p_campaign_id FOR UPDATE;

  FOR v_ent IN
    SELECT id, reserved_php
      FROM public.coupon_user_entitlements
     WHERE campaign_id = p_campaign_id
       AND status IN ('available', 'restored')
     FOR UPDATE
  LOOP
    UPDATE public.coupon_user_entitlements
       SET status = 'revoked',
           updated_at = now()
     WHERE id = v_ent.id
       AND status IN ('available', 'restored');

    IF FOUND THEN
      UPDATE public.store_coupon_campaigns
         SET reserved_spend_php = greatest(0, reserved_spend_php - v_ent.reserved_php),
             updated_at = now()
       WHERE id = p_campaign_id;
      v_revoked := v_revoked + 1;
      v_reserved_released := v_reserved_released + coalesce(v_ent.reserved_php, 0);
      INSERT INTO public.coupon_audit_events (campaign_id, entitlement_id, actor_user_id, action, payload)
      VALUES (
        p_campaign_id,
        v_ent.id,
        p_actor_user_id,
        'revoke',
        jsonb_build_object('reason', coalesce(p_reason, ''), 'reserved_released', v_ent.reserved_php)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'revoked_count', v_revoked,
    'reserved_released', v_reserved_released
  );
END;
$$;

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

  v_insert_ok := false;
  FOR v_attempt IN 1..12 LOOP
    v_coupon_number := public.generate_coupon_serial();
    BEGIN
      INSERT INTO public.coupon_user_entitlements (
        campaign_id, store_id, buyer_user_id, status, reserved_php, expires_at, coupon_number
      ) VALUES (
        v_campaign.id,
        v_campaign.store_id,
        p_buyer_user_id,
        'available',
        v_reserve,
        v_expires,
        v_coupon_number
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
      'coupon_number', v_coupon_number
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_coupon_serial() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_coupon_campaign_issued(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_coupon_entitlements(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_campaign_active_entitlements(uuid, uuid, text) TO authenticated, service_role;

DO $expire_cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'expire_stale_coupon_entitlements';
    PERFORM cron.schedule(
      'expire_stale_coupon_entitlements',
      '*/15 * * * *',
      $cmd$SELECT public.expire_stale_coupon_entitlements(500);$cmd$
    );
    RAISE NOTICE 'expire_stale_coupon_entitlements: cron.schedule registered (*/15 * * * *)';
  ELSE
    RAISE NOTICE 'expire_stale_coupon_entitlements: pg_cron not found — schedule skipped';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'expire_stale_coupon_entitlements: cron.schedule skipped — %', SQLERRM;
END;
$expire_cron$;

COMMIT;
