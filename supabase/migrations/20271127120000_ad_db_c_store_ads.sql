-- 광고 DB 묶음 C-DB (Owner 「C-DB 진행」 2026-11-27) — 매장 광고
-- 설계: docs/audit/ad-db-bundle-design-2026-11-27.md C-DB (운영 정의 읽기 전용 확인 2026-11-27)
--
-- SA-02 요금 기록: TS 가 요금 기록(스냅샷)을 **먼저** 저장하고 차감 함수를 따로 불렀다 — 차감이 실패해도 기록이 남았다.
--        → 새 함수 `owner_submit_delivery_ad_with_business_cash_v2` 가 요금 기록 저장 + 차감 + 상태 전이를 **한 트랜잭션**으로.
--          차감 안 된 옛 기록은 같은 함수가 새 값으로 바꾸고(UPDATE — 다른 표가 기록 id 를 참조), 이미 확보된 캐시가 있으면 기록을 건드리지 않는다.
-- SA-03 자리: 매장 홍보는 자리 검사 없이 팔렸다 → 같은 함수 안에서, 같은 지면(업종은 같은 업종 대상)·겹치는 기간의
--        점유 수(심사·승인·예정·진행·정지 — 상단 배너 `HERO_OCCUPYING_LIFECYCLES` 와 같음) ≥ 정책 최대면 `capacity_full`(차감 없음).
--        정책 최대(홈 = `homePaidAdInsertion.max_items` · 업종 = 업종 정책 `maxInsertion`)는 고객 화면과 같은 TS 해석으로 구해 넘긴다
--        (값이 없으면 제한 없음 — 고객 삽입과 같음). 같은 지면 제출은 잠금(advisory lock)으로 차례로만.
--        점유 수 함수 `delivery_ad_sponsored_slots_used` 하나를 제출과 사장님 화면 「남은 자리」가 같이 쓴다.
-- SA-09 파트너: 가입이 회비를 대조하지 않았고, 할인율·기간을 **승인 때** 정했다
--        → `owner_apply_partner_membership` 에 `p_expected_fee_minor`(다르면 `price_changed` · 차감 없음) ·
--          신청 때 회비·할인율·혜택 기록 · 승인 함수는 그 기록만 쓰고 기간은 30일 고정(`p_period_days` 무시).
-- 옛 코드 호환: 기존 제출 함수는 그대로 둔다. 파트너 가입은 새 인자에 기본값(null = 옛 동작) — 이 마이그레이션만 적용돼도 지금 코드가 동작한다.
-- 운영 데이터(2026-11-27 읽기 전용): 검토 중 파트너 신청 0건 · 진행 중 매장 홍보 0건 · 홈 홍보 최대 5.
-- 되돌리기: docs/audit/ad-db-c-rollback-2026-11-27.sql

-- ── SA-03 매장 홍보 지면 키 (지면 + 업종 대상) ─────────────────────────
-- 업종 대상이 비어 있으면 매장 업종으로 본다 (TS `assertSponsoredCampaignCategoryFeedSellable` 와 같은 보충)
CREATE OR REPLACE FUNCTION public.delivery_ad_sponsored_scope_key_for(
  p_store_id uuid, p_inventory_key text, p_target_kind text, p_primary_slug text, p_secondary_slug text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN nullif(btrim(p_inventory_key), '') IS NULL THEN NULL
    WHEN p_inventory_key = 'STORES_CATEGORY_FEED' THEN
      p_inventory_key || '|' || coalesce(nullif(btrim(p_target_kind), ''), 'primary') || ':'
        || lower(coalesce(nullif(btrim(p_primary_slug), ''),
                          (SELECT sc.slug FROM public.stores s JOIN public.store_categories sc ON sc.id = s.store_category_id
                            WHERE s.id = p_store_id), ''))
        || CASE WHEN coalesce(nullif(btrim(p_target_kind), ''), 'primary') = 'secondary'
                THEN '/' || lower(coalesce(nullif(btrim(p_secondary_slug), ''),
                                           (SELECT st.slug FROM public.stores s JOIN public.store_topics st ON st.id = s.store_topic_id
                                             WHERE s.id = p_store_id), ''))
                ELSE '' END
    ELSE p_inventory_key
  END
$function$;

CREATE OR REPLACE FUNCTION public.delivery_ad_sponsored_scope_key(p_campaign_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.delivery_ad_sponsored_scope_key_for(
           c.store_id, i.key, c.browse_target_kind, c.browse_primary_slug, c.browse_secondary_slug)
    FROM public.store_paid_ad_campaigns c
    JOIN public.delivery_store_sponsored_campaign_inventories ci ON ci.campaign_id = c.id
    JOIN public.delivery_ad_inventories i ON i.id = ci.inventory_id
   WHERE c.id = p_campaign_id
   ORDER BY i.key
   LIMIT 1
$function$;

-- ── SA-03 같은 지면·겹치는 기간 점유 수 — 점유 상태는 상단 배너 `HERO_OCCUPYING_LIFECYCLES` 와 같음 ──
CREATE OR REPLACE FUNCTION public.delivery_ad_sponsored_slots_used(
  p_scope_key text, p_start timestamptz, p_end timestamptz, p_exclude_campaign_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer
    FROM public.store_paid_ad_campaigns o
   WHERE p_scope_key IS NOT NULL
     AND o.id IS DISTINCT FROM p_exclude_campaign_id
     AND o.deleted_at IS NULL
     AND o.lifecycle_status IN ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED',
                                'SCHEDULED', 'ACTIVE', 'PAUSED_OWNER', 'PAUSED_ADMIN')
     AND (o.start_at IS NULL OR p_end IS NULL OR o.start_at <= p_end)
     AND (o.end_at IS NULL OR p_start IS NULL OR o.end_at >= p_start)
     AND public.delivery_ad_sponsored_scope_key(o.id) = p_scope_key
$function$;

-- 제출 함수용: 이 신청(자기 자신 제외)과 같은 지면·겹치는 기간 점유 수
CREATE OR REPLACE FUNCTION public.delivery_ad_sponsored_overlap_count(p_campaign_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.delivery_ad_sponsored_slots_used(
           public.delivery_ad_sponsored_scope_key(c.id), c.start_at, c.end_at, c.id)
    FROM public.store_paid_ad_campaigns c
   WHERE c.id = p_campaign_id
$function$;

-- 사장님 신청 화면 「남은 자리」용: 아직 신청서가 없을 때 같은 판정
CREATE OR REPLACE FUNCTION public.delivery_ad_sponsored_slots_used_for(
  p_store_id uuid, p_inventory_key text, p_target_kind text, p_start timestamptz, p_end timestamptz
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.delivery_ad_sponsored_slots_used(
           public.delivery_ad_sponsored_scope_key_for(p_store_id, p_inventory_key, p_target_kind, NULL, NULL),
           p_start, p_end, NULL)
$function$;

-- ── SA-02 · SA-03 제출 v2: 요금 기록 + 자리 + 차감 + 전이 = 한 트랜잭션 ─────
CREATE OR REPLACE FUNCTION public.owner_submit_delivery_ad_with_business_cash_v2(
  p_owner_user_id uuid, p_store_id uuid, p_product_kind text, p_campaign_id uuid, p_action text,
  p_expected_lifecycle text, p_audit_action text, p_snapshot jsonb, p_capacity_max integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_secured boolean;
  v_snap public.delivery_ad_campaign_commercial_snapshots;
  v_new public.delivery_ad_campaign_commercial_snapshots;
  v_key text;
  v_used integer;
  v_res jsonb;
  v_out jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  BEGIN
    -- 이미 확보된 캐시가 있으면 묶인 요금 기록이 기준 — 다시 쓰지 않는다 (지금과 같음)
    SELECT EXISTS (
      SELECT 1 FROM public.delivery_ad_canonical_bc_fundings f
       WHERE f.product_kind = p_product_kind AND f.application_id = p_campaign_id AND f.status = 'SECURED'
    ) INTO v_secured;

    IF NOT v_secured THEN
      IF p_snapshot IS NULL THEN
        v_out := jsonb_build_object('ok', false, 'stage', 'quote', 'error', 'quote_stale', 'detail', 'snapshot_required');
        RAISE EXCEPTION USING ERRCODE = 'DA505', MESSAGE = 'delivery_ad_submit_v2_abort';
      END IF;
      v_new := jsonb_populate_record(NULL::public.delivery_ad_campaign_commercial_snapshots, p_snapshot);
      IF v_new.campaign_id IS DISTINCT FROM p_campaign_id OR v_new.product_kind IS DISTINCT FROM p_product_kind THEN
        v_out := jsonb_build_object('ok', false, 'stage', 'quote', 'error', 'quote_stale', 'detail', 'snapshot_mismatch');
        RAISE EXCEPTION USING ERRCODE = 'DA505', MESSAGE = 'delivery_ad_submit_v2_abort';
      END IF;

      SELECT * INTO v_snap FROM public.delivery_ad_campaign_commercial_snapshots
       WHERE campaign_id = p_campaign_id AND product_kind = p_product_kind
       FOR UPDATE;
      IF FOUND THEN
        -- 차감 안 된 옛 기록 = 이번에 화면이 확인한 새 값으로 (다른 표가 기록 id 를 참조하므로 UPDATE)
        UPDATE public.delivery_ad_campaign_commercial_snapshots
           SET campaign_source = v_new.campaign_source,
               inventory_key = v_new.inventory_key,
               package_id = v_new.package_id,
               package_code = v_new.package_code,
               package_display_name = v_new.package_display_name,
               duration_days_snapshot = v_new.duration_days_snapshot,
               base_price_minor_snapshot = v_new.base_price_minor_snapshot,
               partner_membership_id = v_new.partner_membership_id,
               partner_discount_percent_snapshot = v_new.partner_discount_percent_snapshot,
               partner_benefit_snapshot = v_new.partner_benefit_snapshot,
               final_payable_minor = v_new.final_payable_minor,
               currency = v_new.currency,
               priced_at = coalesce(v_new.priced_at, now()),
               commercial_status = v_new.commercial_status
         WHERE id = v_snap.id;
      ELSE
        INSERT INTO public.delivery_ad_campaign_commercial_snapshots (
          campaign_id, product_kind, campaign_source, inventory_key, package_id, package_code,
          package_display_name, duration_days_snapshot, base_price_minor_snapshot, partner_membership_id,
          partner_discount_percent_snapshot, partner_benefit_snapshot, final_payable_minor, currency,
          priced_at, commercial_status
        ) VALUES (
          p_campaign_id, p_product_kind, v_new.campaign_source, v_new.inventory_key, v_new.package_id, v_new.package_code,
          v_new.package_display_name, v_new.duration_days_snapshot, v_new.base_price_minor_snapshot, v_new.partner_membership_id,
          v_new.partner_discount_percent_snapshot, v_new.partner_benefit_snapshot, v_new.final_payable_minor, v_new.currency,
          coalesce(v_new.priced_at, now()), v_new.commercial_status
        );
      END IF;

      -- SA-03 자리 — 이미 돈을 낸(확보된) 신청은 이미 자리를 잡은 것이므로 검사하지 않는다
      IF p_product_kind = 'store_sponsored' AND p_capacity_max IS NOT NULL THEN
        v_key := public.delivery_ad_sponsored_scope_key(p_campaign_id);
        PERFORM pg_advisory_xact_lock(hashtext('delivery_ad_sponsored_capacity:' || coalesce(v_key, '')));
        v_used := coalesce(public.delivery_ad_sponsored_overlap_count(p_campaign_id), 0);
        IF v_used >= greatest(p_capacity_max, 0) THEN
          v_out := jsonb_build_object('ok', false, 'stage', 'capacity', 'error', 'capacity_full',
            'used', v_used, 'capacity', p_capacity_max);
          RAISE EXCEPTION USING ERRCODE = 'DA505', MESSAGE = 'delivery_ad_submit_v2_abort';
        END IF;
      END IF;
    END IF;

    -- 차감 + 전이 + 기간·지면 대조 = 기존 함수 그대로
    v_res := public.owner_submit_delivery_ad_with_business_cash(
      p_owner_user_id, p_store_id, p_product_kind, p_campaign_id, p_action, p_expected_lifecycle, p_audit_action
    );
    IF coalesce((v_res ->> 'ok')::boolean, false) IS NOT TRUE THEN
      -- 실패면 이번 요금 기록도 남기지 않는다 (SA-02)
      v_out := v_res;
      RAISE EXCEPTION USING ERRCODE = 'DA505', MESSAGE = 'delivery_ad_submit_v2_abort';
    END IF;
  EXCEPTION WHEN SQLSTATE 'DA505' THEN
    RETURN v_out;
  END;

  RETURN v_res;
END;
$function$;

-- ── SA-09 파트너 가입: 회비 대조 + 신청 때 할인율·혜택 기록 ─────────────
-- 인자 추가는 옛 3인자 함수를 지우고 만든다(같은 이름 두 개면 이름 인자 호출이 모호해짐). 새 인자 기본값 null = 옛 동작.
DROP FUNCTION IF EXISTS public.owner_apply_partner_membership(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.owner_apply_partner_membership(
  p_store_id uuid, p_owner_user_id uuid, p_request_id text, p_expected_fee_minor bigint DEFAULT NULL
)
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

  -- Serialise every apply of this store (spend locks the same row again inside this TX).
  SELECT id, owner_user_id INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND OR v_store.owner_user_id IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Replay of the same request: return the row created by the first call (회비 대조보다 먼저).
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
  -- SA-09 (C-DB 2026-11-27): 화면이 본 회비와 지금 회비가 다르면 차감 없이 멈춘다
  IF p_expected_fee_minor IS NOT NULL AND p_expected_fee_minor IS DISTINCT FROM v_cfg.monthly_fee_minor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'fee_minor', v_cfg.monthly_fee_minor);
  END IF;

  -- ADS-05: memberships created after the apply instant whose period ended are closed first.
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

  -- SA-09: 신청 때 회비·할인율·혜택을 기록 — 승인은 이 기록만 쓴다
  INSERT INTO public.delivery_ad_partner_memberships (
    id, store_id, status, period_start, period_end, fee_snapshot_minor, currency,
    benefit_snapshot, advertising_discount_percent_snapshot, config_version_snapshot,
    cancel_requested_at, apply_idempotency_key, created_at, updated_at
  ) VALUES (
    v_id, p_store_id, 'PENDING_REVIEW', NULL, NULL, v_cfg.monthly_fee_minor, v_cfg.currency,
    coalesce(v_cfg.benefit_json, '{}'::jsonb), coalesce(v_cfg.advertising_discount_percent, 0), v_cfg.version,
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
      'funding_id', v_spend -> 'funding_id',
      'advertising_discount_percent_snapshot', v_row.advertising_discount_percent_snapshot,
      'config_version_snapshot', v_row.config_version_snapshot
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

-- ── SA-09 파트너 승인: 신청 때 기록한 회비·할인율·혜택만 · 기간 30일 고정 ──
CREATE OR REPLACE FUNCTION public.admin_partner_membership_decide(
  p_admin_user_id uuid, p_membership_id uuid, p_action text, p_reason text, p_period_days integer DEFAULT NULL::integer
)
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
  -- SA-09 (C-DB 2026-11-27): 기간 30일 고정 — p_period_days 는 옛 호출 호환용으로만 받고 쓰지 않는다
  v_days constant integer := 30;
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

    -- SA-09: 신청 때 기록한 값 그대로 (승인 시점 설정으로 바꾸지 않는다)
    UPDATE public.delivery_ad_partner_memberships
    SET status = 'ACTIVE',
        period_start = now(),
        period_end = now() + make_interval(days => v_days),
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

  -- reject
  v_refund := public.business_cash_delivery_ad_refund(p_admin_user_id, v_row.id, 'partner');
  IF coalesce((v_refund ->> 'ok')::boolean, false) IS NOT TRUE
     AND coalesce(v_refund ->> 'error', '') <> 'funding_not_found' THEN
    -- refund wrote nothing; membership stays PENDING_REVIEW.
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

-- 권한: 서비스 롤만 (기존 함수와 같음)
REVOKE ALL ON FUNCTION public.delivery_ad_sponsored_scope_key_for(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delivery_ad_sponsored_scope_key(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delivery_ad_sponsored_slots_used(text, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delivery_ad_sponsored_overlap_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delivery_ad_sponsored_slots_used_for(uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owner_submit_delivery_ad_with_business_cash_v2(uuid, uuid, text, uuid, text, text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owner_apply_partner_membership(uuid, uuid, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_partner_membership_decide(uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_sponsored_slots_used_for(uuid, text, text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.owner_submit_delivery_ad_with_business_cash_v2(uuid, uuid, text, uuid, text, text, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.owner_apply_partner_membership(uuid, uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_partner_membership_decide(uuid, uuid, text, text, integer) TO service_role;
