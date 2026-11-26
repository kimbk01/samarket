-- C-DB 되돌리기 (supabase/migrations/20271127120000_ad_db_c_store_ads.sql)
-- 옛 정의 = 2026-11-27 운영 pg_get_functiondef 읽기 전용 조회 — 동작 문장은 원문 그대로, 함수 안 영어 주석 몇 줄만 뺐다.
-- 순서: 코드를 먼저 되돌린 뒤(새 함수 호출 제거) 이 SQL 을 적용한다.

DROP FUNCTION IF EXISTS public.owner_submit_delivery_ad_with_business_cash_v2(uuid, uuid, text, uuid, text, text, text, jsonb, integer);
DROP FUNCTION IF EXISTS public.delivery_ad_sponsored_slots_used_for(uuid, text, text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.delivery_ad_sponsored_overlap_count(uuid);
DROP FUNCTION IF EXISTS public.delivery_ad_sponsored_slots_used(text, timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.delivery_ad_sponsored_scope_key(uuid);
DROP FUNCTION IF EXISTS public.delivery_ad_sponsored_scope_key_for(uuid, text, text, text, text);

DROP FUNCTION IF EXISTS public.owner_apply_partner_membership(uuid, uuid, text, bigint);
CREATE OR REPLACE FUNCTION public.owner_apply_partner_membership(p_store_id uuid, p_owner_user_id uuid, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_request_id, '')), '');
  v_store record;
  v_cfg public.delivery_ad_partner_config;
  v_existing public.delivery_ad_partner_memberships;
  v_fund public.delivery_ad_canonical_bc_fundings;
  v_row public.delivery_ad_partner_memberships;
  v_id uuid := gen_random_uuid();
  v_spend jsonb;
BEGIN
  IF p_store_id IS NULL OR p_owner_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_store');
  END IF;
  IF v_key IS NULL OR length(v_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;

  SELECT id, owner_user_id INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND OR v_store.owner_user_id IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_existing
  FROM public.delivery_ad_partner_memberships
  WHERE store_id = p_store_id AND apply_idempotency_key = v_key;
  IF FOUND THEN
    SELECT * INTO v_fund FROM public.delivery_ad_canonical_bc_fundings
    WHERE product_kind = 'partner' AND application_id = v_existing.id;
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true,
      'membership', to_jsonb(v_existing),
      'funding_id', v_fund.id,
      'amount_minor', coalesce(v_fund.amount_minor, v_existing.fee_snapshot_minor)
    );
  END IF;

  SELECT * INTO v_cfg FROM public.delivery_ad_partner_config WHERE id = 'default';
  IF NOT FOUND OR v_cfg.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'config_disabled');
  END IF;
  IF v_cfg.accepting_new_members IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_accepting');
  END IF;
  IF v_cfg.monthly_fee_minor IS NULL OR v_cfg.monthly_fee_minor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fee_not_configured');
  END IF;

  PERFORM public.delivery_ad_partner_membership_expire_due_internal(p_store_id, 50);

  SELECT * INTO v_existing
  FROM public.delivery_ad_partner_memberships
  WHERE store_id = p_store_id
    AND (
      status IN ('PENDING_REVIEW', 'PAST_DUE')
      OR (status IN ('ACTIVE', 'CANCEL_PENDING') AND (period_end IS NULL OR period_end > now()))
    )
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_open', 'membership_id', v_existing.id);
  END IF;

  v_spend := public.business_cash_delivery_ad_spend(
    p_owner_user_id, p_store_id, v_id, 'partner', v_cfg.monthly_fee_minor
  );
  IF coalesce((v_spend ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_spend || jsonb_build_object('ok', false, 'stage', 'debit');
  END IF;

  INSERT INTO public.delivery_ad_partner_memberships (
    id, store_id, status, period_start, period_end, fee_snapshot_minor, currency,
    benefit_snapshot, advertising_discount_percent_snapshot, config_version_snapshot,
    cancel_requested_at, apply_idempotency_key, created_at, updated_at
  ) VALUES (
    v_id, p_store_id, 'PENDING_REVIEW', NULL, NULL, v_cfg.monthly_fee_minor, v_cfg.currency,
    '{}'::jsonb, 0, v_cfg.version,
    NULL, v_key, now(), now()
  )
  RETURNING * INTO v_row;

  INSERT INTO public.delivery_ad_commercial_override_audit (
    entity_type, entity_id, actor_user_id, reason, before_json, after_json
  ) VALUES (
    'partner_membership', v_row.id::text, p_owner_user_id, 'owner_partner_apply', '{}'::jsonb,
    jsonb_build_object(
      'status', v_row.status, 'store_id', v_row.store_id,
      'payment', 'BUSINESS_CASH_SECURED',
      'amount_minor', v_spend -> 'amount_minor',
      'funding_id', v_spend -> 'funding_id'
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false,
    'membership', to_jsonb(v_row),
    'funding_id', v_spend -> 'funding_id',
    'amount_minor', v_spend -> 'amount_minor',
    'balance_after_minor', v_spend -> 'balance_after_minor'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.owner_apply_partner_membership(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_apply_partner_membership(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_partner_membership_decide(p_admin_user_id uuid, p_membership_id uuid, p_action text, p_reason text, p_period_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.delivery_ad_partner_memberships;
  v_after public.delivery_ad_partner_memberships;
  v_fund public.delivery_ad_canonical_bc_fundings;
  v_cfg public.delivery_ad_partner_config;
  v_days integer;
  v_refund jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF p_admin_user_id IS NULL OR NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  SELECT * INTO v_row FROM public.delivery_ad_partner_memberships
  WHERE id = p_membership_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_row.status IS DISTINCT FROM 'PENDING_REVIEW' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'status', v_row.status);
  END IF;

  IF p_action = 'approve' THEN
    SELECT * INTO v_fund FROM public.delivery_ad_canonical_bc_fundings
    WHERE product_kind = 'partner' AND application_id = v_row.id
    FOR UPDATE;
    IF NOT FOUND OR v_fund.status IS DISTINCT FROM 'SECURED' OR v_fund.store_id IS DISTINCT FROM v_row.store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'funding_required');
    END IF;
    SELECT * INTO v_cfg FROM public.delivery_ad_partner_config WHERE id = 'default';
    IF NOT FOUND OR v_cfg.enabled IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'error', 'config_disabled');
    END IF;
    IF v_cfg.monthly_fee_minor IS NULL OR v_cfg.monthly_fee_minor < 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'fee_not_configured');
    END IF;
    v_days := CASE WHEN p_period_days IS NOT NULL AND p_period_days BETWEEN 1 AND 366
                   THEN p_period_days ELSE 30 END;

    UPDATE public.delivery_ad_partner_memberships
    SET status = 'ACTIVE',
        period_start = now(),
        period_end = now() + make_interval(days => v_days),
        fee_snapshot_minor = coalesce(v_row.fee_snapshot_minor, v_cfg.monthly_fee_minor),
        currency = v_cfg.currency,
        benefit_snapshot = v_cfg.benefit_json,
        advertising_discount_percent_snapshot = v_cfg.advertising_discount_percent,
        config_version_snapshot = v_cfg.version,
        cancel_requested_at = NULL,
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_after;

    INSERT INTO public.delivery_ad_commercial_override_audit (
      entity_type, entity_id, actor_user_id, reason, before_json, after_json
    ) VALUES (
      'partner_membership', v_row.id::text, p_admin_user_id,
      coalesce(v_reason, 'admin_partner_approve'),
      jsonb_build_object('status', v_row.status),
      jsonb_build_object(
        'status', v_after.status,
        'fee_snapshot_minor', v_after.fee_snapshot_minor,
        'advertising_discount_percent_snapshot', v_after.advertising_discount_percent_snapshot,
        'config_version_snapshot', v_after.config_version_snapshot,
        'period_start', v_after.period_start,
        'period_end', v_after.period_end,
        'payment', 'BUSINESS_CASH_SECURED',
        'funding_id', v_fund.id
      )
    );
    RETURN jsonb_build_object('ok', true, 'membership', to_jsonb(v_after));
  END IF;

  v_refund := public.business_cash_delivery_ad_refund(p_admin_user_id, v_row.id, 'partner');
  IF coalesce((v_refund ->> 'ok')::boolean, false) IS NOT TRUE
     AND coalesce(v_refund ->> 'error', '') <> 'funding_not_found' THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'refund_failed', 'detail', coalesce(v_refund ->> 'error', 'refund_failed')
    );
  END IF;

  UPDATE public.delivery_ad_partner_memberships
  SET status = 'REJECTED', updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_after;

  INSERT INTO public.delivery_ad_commercial_override_audit (
    entity_type, entity_id, actor_user_id, reason, before_json, after_json
  ) VALUES (
    'partner_membership', v_row.id::text, p_admin_user_id,
    coalesce(v_reason, 'admin_partner_reject'),
    jsonb_build_object('status', v_row.status),
    jsonb_build_object(
      'status', v_after.status,
      'refund', coalesce((v_refund ->> 'ok')::boolean, false),
      'refund_idempotent', coalesce((v_refund ->> 'idempotent')::boolean, false),
      'refund_ledger_id', v_refund -> 'refund_ledger_id'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'membership', to_jsonb(v_after),
    'refund', coalesce((v_refund ->> 'ok')::boolean, false),
    'refund_idempotent', coalesce((v_refund ->> 'idempotent')::boolean, false)
  );
END;
$function$;
