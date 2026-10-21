-- 배달 오너 감사 3단계 3-D(1) 광고 수명주기·가격 — ADS-01 · ADS-11 · ADS-12 · ADS-02 (DB 부분)
-- 설계: docs/audit/delivery-owner-2026-10-20/G-2-stage3-5-design.md §3-D · Owner 결정 D-19 = 권장안
--       (승인 시점 기준 기간 재계산 + 기간 지난 미심사 신청 자동 반려·전액 환불, 상태명 REJECTED 재사용) · D-5.
--
-- 변경 (모두 운영 본문 기준 최소 diff · 본문 ASCII 전용 · md5(prosrc) 는 운영 읽기 전용 조회 2026-10-21)
--   1. admin_delivery_ad_transition                base c93d346fce96859931231969081f0046
--      - approve: 원 신청 end_at <= now → period_expired 거절.
--        OWNER_PAID 는 start_at = max(now, 요청 시작), end_at = start_at + snapshot.duration_days_snapshot
--        (스냅샷 기간 없음 = 레거시 → 원 기간 길이 유지). 감사 after_json·반환에 새 기간 포함.
--      - resume(PAUSED_ADMIN→ACTIVE): end_at <= now → period_ended (ADS-11).
--   2. owner_delivery_ad_transition                base 27c0218065edc80c708242b3bd34b05a
--      - 재개(PAUSED_OWNER→ACTIVE) end_at 검사를 배너까지 확대, 오류 코드 period_ended (ADS-11).
--   3. delivery_ad_system_schedule_transition      base ca29308b9cf8fe9692c2a0c715510211
--      - 새 action expire_unreviewed: SUBMITTED/UNDER_REVIEW/CHANGES_REQUESTED + end_at 경과
--        + submitted_at >= c_apply_from(2026-10-20 20:30 UTC) 만 → 같은 TX 에서 환불 + REJECTED
--        (review_notes 'period_expired'). 환불 실패(funding_not_found 제외) → 전체 롤백 refund_failed.
--      - end_due 대상에 PAUSED_OWNER/PAUSED_ADMIN 포함 — end_at >= c_apply_from 만 (ADS-11, D-5).
--      기존 크론 delivery-ads-schedule-transitions(vercel.json) 재사용 — 크론 추가 없음.
--   4. owner_submit_delivery_ad_with_business_cash base 66ea22a4ef48d9b8e3f1661bb68b1fcc
--      - 차감·전이 후 같은 TX 에서 스냅샷 결합 검사(ADS-02): end_at-start_at <= duration_days_snapshot,
--        junction 인벤토리 정확히 1개 = snapshot.inventory_key. 실패 → 차감·전이 롤백, stage 'quote' · quote_stale.
--   5. admin_delivery_ad_campaign_index            base 3dc39172fdd19f33c25ba2e1afe28450
--      - 심사 단계인데 펀딩 없음(delivery_ad_campaign_funding_allows_active = false) → list_bucket 'review_unfunded'
--        (처리 필요·승인 대기 집계에서 빠짐, 「레거시·미펀딩(조치 불요)」 ADS-12). 본문 한글 주석 → ASCII.
--   신규 6. business_cash_delivery_ad_refund_system(uuid, text) — business_cash_delivery_ad_refund 와 같은 원장 형태·
--        같은 멱등 키 bc_refund:<kind>:<id>(UNIQUE) · actor_type 'system'. 클라이언트·service_role EXECUTE 없음
--        (SECURITY DEFINER 시스템 함수 내부 호출 전용).
--   신규 7. delivery_ad_owner_snapshot_binding_error(text, uuid) — 4번 검사 (NULL = 통과). 내부 전용.
--
-- 운영 데이터(D-5): 기존 미심사 4건(₱480, submitted_at 2026-09-01~09-04 < c_apply_from) 은 자동 반려·환불 안 함.
--   과거 PAUSED 잔류 행 변경 0. 미펀딩 UNDER_REVIEW 1건은 반려하지 않음(목록 버킷만 분리).
-- 기대 new md5(prosrc): 격리 테스트 run.sh 출력 (보고서 참조).
-- DROP 없음. 롤백: 각 함수를 base 본문(20261201220000 / 20270421120400 / 20261201197000 / 20270523120300 /
--   20270601100100 의 정의)으로 CREATE OR REPLACE. 신규 두 함수는 미사용 상태로 남겨도 무해.
-- 배포 순서: 이 마이그레이션(DB) → 웹. (웹이 먼저 나가면 크론 expire_unreviewed 호출이 invalid_action 으로
--   실패 처리될 뿐 상태 변경 없음 — 안전.)

BEGIN;

CREATE OR REPLACE FUNCTION public.business_cash_delivery_ad_refund_system(
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
  IF p_application_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
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
    related_type, related_id, idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    v_fund.store_id,
    'AD_REFUND',
    'credit', v_fund.amount_minor, v_bal,
    'delivery_ad_canonical_bc_fundings', v_fund.id::text,
    'bc_refund:' || p_product_kind || ':' || p_application_id::text,
    'system', NULL,
    jsonb_build_object('reason', 'period_expired')
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

REVOKE ALL ON FUNCTION public.business_cash_delivery_ad_refund_system(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delivery_ad_owner_snapshot_binding_error(
  p_product_kind text,
  p_campaign_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_source text;
  v_snap public.delivery_ad_campaign_commercial_snapshots;
  v_n integer;
  v_key text;
BEGIN
  IF p_product_kind = 'banner' THEN
    SELECT c.start_at, c.end_at, coalesce(c.campaign_source, 'OWNER_PAID')
      INTO v_start, v_end, v_source
      FROM public.store_banner_ad_campaigns c WHERE c.id = p_campaign_id;
  ELSE
    SELECT c.start_at, c.end_at, coalesce(c.campaign_source, 'OWNER_PAID')
      INTO v_start, v_end, v_source
      FROM public.store_paid_ad_campaigns c WHERE c.id = p_campaign_id;
  END IF;
  IF NOT FOUND THEN
    RETURN 'campaign_not_found';
  END IF;
  IF v_source = 'DIBAY_FIRST_PARTY' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_snap
    FROM public.delivery_ad_campaign_commercial_snapshots s
   WHERE s.campaign_id = p_campaign_id AND s.product_kind = p_product_kind;
  IF NOT FOUND THEN
    RETURN 'snapshot_missing';
  END IF;
  IF v_snap.campaign_source IS DISTINCT FROM 'OWNER_PAID'
     OR v_snap.commercial_status IS DISTINCT FROM 'PRICED' THEN
    RETURN NULL;
  END IF;

  IF v_snap.duration_days_snapshot IS NOT NULL
     AND (v_end - v_start) > make_interval(days => v_snap.duration_days_snapshot) THEN
    RETURN 'period_exceeds_snapshot';
  END IF;

  IF p_product_kind = 'banner' THEN
    SELECT count(*), min(i.key) INTO v_n, v_key
      FROM public.delivery_banner_campaign_inventories ci
      JOIN public.delivery_ad_inventories i ON i.id = ci.inventory_id
     WHERE ci.campaign_id = p_campaign_id;
  ELSE
    SELECT count(*), min(i.key) INTO v_n, v_key
      FROM public.delivery_store_sponsored_campaign_inventories ci
      JOIN public.delivery_ad_inventories i ON i.id = ci.inventory_id
     WHERE ci.campaign_id = p_campaign_id;
  END IF;
  IF v_n IS DISTINCT FROM 1 THEN
    RETURN 'inventory_count';
  END IF;
  IF v_key IS DISTINCT FROM v_snap.inventory_key THEN
    RETURN 'inventory_mismatch';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_ad_owner_snapshot_binding_error(text, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delivery_ad_transition(
  p_admin_user_id uuid,
  p_product_kind text,
  p_campaign_id uuid,
  p_action text,
  p_expected_lifecycle text,
  p_expected_updated_at timestamptz,
  p_reason text DEFAULT NULL,
  p_owner_visible_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text;
  v_row record;
  v_from text;
  v_to text;
  v_review text;
  v_is_active boolean;
  v_now timestamptz := now();
  v_go_live text;
  v_audit_action text;
  v_audit_id uuid;
  v_source text;
  v_snap_days integer;
  v_new_start timestamptz;
  v_new_end timestamptz;
BEGIN
  IF p_admin_user_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  v_table := CASE
    WHEN p_product_kind = 'banner' THEN 'store_banner_ad_campaigns'
    ELSE 'store_paid_ad_campaigns'
  END;

  IF p_product_kind = 'banner' THEN
    SELECT * INTO v_row FROM public.store_banner_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  ELSE
    SELECT * INTO v_row FROM public.store_paid_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;

  v_from := v_row.lifecycle_status;
  v_source := coalesce(v_row.campaign_source, 'OWNER_PAID');

  IF p_expected_lifecycle IS NOT NULL AND v_from IS DISTINCT FROM p_expected_lifecycle THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_lifecycle', 'current', v_from);
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  END IF;

  IF p_action = 'start_review' THEN
    v_to := 'UNDER_REVIEW'; v_review := 'IN_REVIEW'; v_audit_action := 'review_started';
  ELSIF p_action = 'request_changes' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'CHANGES_REQUESTED'; v_review := 'CHANGES_REQUESTED'; v_audit_action := 'changes_requested';
  ELSIF p_action = 'approve' THEN
    v_to := 'APPROVED'; v_review := 'APPROVED'; v_audit_action := 'approved';
  ELSIF p_action = 'reject' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'REJECTED'; v_review := 'REJECTED'; v_audit_action := 'rejected';
  ELSIF p_action = 'pause' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'PAUSED_ADMIN'; v_review := NULL; v_audit_action := 'paused_admin';
  ELSIF p_action = 'resume' THEN
    v_to := 'ACTIVE'; v_review := NULL; v_audit_action := 'resumed_admin';
  ELSIF p_action = 'end' THEN
    v_to := 'ENDED'; v_review := NULL; v_audit_action := 'ended_admin';
  ELSIF p_action = 'terminate' THEN
    IF length(trim(coalesce(p_reason, ''))) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
    END IF;
    v_to := 'TERMINATED'; v_review := NULL; v_audit_action := 'terminated_admin';
  ELSIF p_action = 'archive' THEN
    v_to := 'ARCHIVED'; v_review := NULL; v_audit_action := 'archived';
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  IF p_action = 'approve' THEN
    IF v_from IS DISTINCT FROM 'UNDER_REVIEW' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', 'APPROVED');
    END IF;
  ELSIF NOT (
    (v_from = 'SUBMITTED' AND v_to = 'UNDER_REVIEW') OR
    (v_from = 'UNDER_REVIEW' AND v_to IN ('CHANGES_REQUESTED','REJECTED')) OR
    (v_from IN ('ACTIVE','SCHEDULED') AND v_to = 'PAUSED_ADMIN') OR
    (v_from = 'PAUSED_ADMIN' AND v_to = 'ACTIVE') OR
    (v_from IN ('ACTIVE','SCHEDULED','PAUSED_ADMIN','PAUSED_OWNER') AND v_to IN ('ENDED','TERMINATED')) OR
    (v_from IN ('ENDED','REJECTED','TERMINATED') AND v_to = 'ARCHIVED') OR
    (v_from = 'CHANGES_REQUESTED' AND v_to IN ('UNDER_REVIEW','REJECTED'))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', v_to);
  END IF;

  -- ADS-11: a resume into ACTIVE requires the paid period to still be running.
  IF p_action = 'resume' AND v_row.end_at <= v_now THEN
    RETURN jsonb_build_object('ok', false, 'error', 'period_ended', 'from', v_from, 'to', v_to);
  END IF;

  v_new_start := v_row.start_at;
  v_new_end := v_row.end_at;
  IF p_action = 'approve' THEN
    -- ADS-01 / D-19: an application whose requested period already ended cannot be approved.
    IF v_row.end_at <= v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'period_expired', 'from', v_from);
    END IF;
    -- ADS-01 / D-19: OWNER_PAID period is recalculated from the approval instant
    -- (start = max(now, requested start), end = start + snapshot duration; legacy rows keep their length).
    IF v_source = 'OWNER_PAID' THEN
      SELECT s.duration_days_snapshot INTO v_snap_days
        FROM public.delivery_ad_campaign_commercial_snapshots s
       WHERE s.campaign_id = p_campaign_id AND s.product_kind = p_product_kind;
      v_new_start := greatest(v_now, v_row.start_at);
      IF v_snap_days IS NOT NULL AND v_snap_days > 0 THEN
        v_new_end := v_new_start + make_interval(days => v_snap_days);
      ELSE
        v_new_end := v_new_start + (v_row.end_at - v_row.start_at);
      END IF;
    END IF;
    IF v_new_start > v_now THEN
      v_go_live := 'SCHEDULED';
    ELSE
      v_go_live := 'ACTIVE';
    END IF;
    v_to := v_go_live;
  END IF;

  -- MODEL B: OWNER_PAID cannot enter ACTIVE without FUNDED Business Cash
  IF v_to = 'ACTIVE' AND NOT public.delivery_ad_campaign_funding_allows_active(
    p_product_kind, p_campaign_id, v_source
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'funding_required');
  END IF;

  v_is_active := (v_to IN ('ACTIVE','SCHEDULED'));

  IF p_product_kind = 'banner' THEN
    UPDATE public.store_banner_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      review_status = COALESCE(v_review, review_status),
      review_notes = CASE
        WHEN p_action IN ('request_changes','reject','pause','terminate')
          THEN nullif(trim(coalesce(p_owner_visible_notes, p_reason)), '')
        WHEN p_action = 'approve' THEN NULL
        ELSE review_notes
      END,
      reviewed_at = CASE WHEN p_action IN ('approve','reject','request_changes','start_review') THEN v_now ELSE reviewed_at END,
      approved_at = CASE WHEN p_action = 'approve' THEN v_now ELSE approved_at END,
      start_at = CASE WHEN p_action = 'approve' THEN v_new_start ELSE start_at END,
      end_at = CASE WHEN p_action = 'approve' THEN v_new_end ELSE end_at END,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      paused_at = CASE WHEN v_to = 'PAUSED_ADMIN' THEN v_now ELSE paused_at END,
      ended_at = CASE WHEN v_to IN ('ENDED','TERMINATED') THEN v_now ELSE ended_at END,
      archived_at = CASE WHEN v_to = 'ARCHIVED' THEN v_now ELSE archived_at END,
      updated_by_user_id = p_admin_user_id,
      updated_at = v_now
    WHERE id = p_campaign_id;

    IF p_action = 'approve' AND v_row.creative_id IS NOT NULL THEN
      UPDATE public.delivery_ad_creatives
      SET review_status = 'APPROVED', updated_at = v_now
      WHERE id = v_row.creative_id;
    ELSIF p_action = 'reject' AND v_row.creative_id IS NOT NULL THEN
      UPDATE public.delivery_ad_creatives
      SET review_status = 'REJECTED', updated_at = v_now
      WHERE id = v_row.creative_id;
    ELSIF p_action = 'request_changes' AND v_row.creative_id IS NOT NULL THEN
      UPDATE public.delivery_ad_creatives
      SET review_status = 'CHANGES_REQUESTED', updated_at = v_now
      WHERE id = v_row.creative_id;
    END IF;
  ELSE
    UPDATE public.store_paid_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      review_status = COALESCE(v_review, review_status),
      review_notes = CASE
        WHEN p_action IN ('request_changes','reject','pause','terminate')
          THEN nullif(trim(coalesce(p_owner_visible_notes, p_reason)), '')
        WHEN p_action = 'approve' THEN NULL
        ELSE review_notes
      END,
      reviewed_at = CASE WHEN p_action IN ('approve','reject','request_changes','start_review') THEN v_now ELSE reviewed_at END,
      approved_at = CASE WHEN p_action = 'approve' THEN v_now ELSE approved_at END,
      start_at = CASE WHEN p_action = 'approve' THEN v_new_start ELSE start_at END,
      end_at = CASE WHEN p_action = 'approve' THEN v_new_end ELSE end_at END,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      paused_at = CASE WHEN v_to = 'PAUSED_ADMIN' THEN v_now ELSE paused_at END,
      ended_at = CASE WHEN v_to IN ('ENDED','TERMINATED') THEN v_now ELSE ended_at END,
      archived_at = CASE WHEN v_to = 'ARCHIVED' THEN v_now ELSE archived_at END,
      updated_by_user_id = p_admin_user_id,
      updated_at = v_now
    WHERE id = p_campaign_id;
  END IF;

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, reason, before_json, after_json
  ) VALUES (
    p_product_kind, p_campaign_id, 'admin', p_admin_user_id, v_audit_action,
    nullif(trim(coalesce(p_reason, '')), ''),
    jsonb_build_object('lifecycle', v_from, 'updated_at', v_row.updated_at),
    jsonb_build_object('lifecycle', v_to, 'action', p_action)
      || CASE WHEN p_action = 'approve'
           THEN jsonb_build_object('start_at', v_new_start, 'end_at', v_new_end)
           ELSE '{}'::jsonb END
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'from', v_from,
    'to', v_to,
    'action', p_action,
    'audit_id', v_audit_id,
    'start_at', v_new_start,
    'end_at', v_new_end
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

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

  -- ADS-11: every resume into ACTIVE (store_sponsored and banner) requires end_at in the future.
  IF v_from = 'PAUSED_OWNER' AND v_to = 'ACTIVE' THEN
    IF v_row.end_at IS NULL OR v_row.end_at <= v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'period_ended', 'from', v_from, 'to', v_to);
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

CREATE OR REPLACE FUNCTION public.delivery_ad_system_schedule_transition(
  p_product_kind text,
  p_campaign_id uuid,
  p_action text,
  p_expected_lifecycle text,
  p_expected_updated_at timestamptz
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
  v_now timestamptz := now();
  v_audit_action text;
  v_audit_id uuid;
  v_is_active boolean;
  v_source text;
  -- D-5 apply instant: rows before it are never auto-ended/auto-rejected/refunded by this function.
  c_apply_from constant timestamptz := '2026-10-20 20:30:00+00';
  v_refund jsonb;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;

  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  IF p_action NOT IN ('activate_due', 'end_due', 'expire_unreviewed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  IF p_product_kind = 'banner' THEN
    SELECT * INTO v_row FROM public.store_banner_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  ELSE
    SELECT * INTO v_row FROM public.store_paid_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;

  v_from := v_row.lifecycle_status;
  v_source := coalesce(v_row.campaign_source, 'OWNER_PAID');

  IF p_expected_lifecycle IS NOT NULL AND v_from IS DISTINCT FROM p_expected_lifecycle THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_lifecycle', 'current', v_from);
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  END IF;

  IF p_action = 'activate_due' THEN
    IF v_from IS DISTINCT FROM 'SCHEDULED' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', 'ACTIVE');
    END IF;
    IF v_row.start_at > v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_due', 'detail', 'start_at_future');
    END IF;
    IF v_row.end_at <= v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_due', 'detail', 'end_at_passed');
    END IF;
    IF NOT public.delivery_ad_campaign_funding_allows_active(
      p_product_kind, p_campaign_id, v_source
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'funding_required');
    END IF;
    v_to := 'ACTIVE';
    v_audit_action := 'system_activated';
  ELSIF p_action = 'expire_unreviewed' THEN
    -- ADS-01 / D-19: unreviewed application whose requested period passed -> REJECTED + full refund (same TX).
    IF v_from NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', 'REJECTED');
    END IF;
    IF v_row.end_at > v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_due', 'detail', 'end_at_future');
    END IF;
    IF v_row.submitted_at IS NULL OR v_row.submitted_at < c_apply_from THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_eligible', 'detail', 'before_apply_from');
    END IF;
    v_to := 'REJECTED';
    v_audit_action := 'system_expired_unreviewed';
  ELSE
    -- ADS-11: paused campaigns are ended too, but only when the period ended after the apply instant (D-5).
    IF v_from NOT IN ('ACTIVE', 'SCHEDULED', 'PAUSED_OWNER', 'PAUSED_ADMIN') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', 'ENDED');
    END IF;
    IF v_row.end_at > v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_due', 'detail', 'end_at_future');
    END IF;
    IF v_from IN ('PAUSED_OWNER', 'PAUSED_ADMIN') AND v_row.end_at < c_apply_from THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_eligible', 'detail', 'before_apply_from');
    END IF;
    v_to := 'ENDED';
    v_audit_action := 'system_ended';
  END IF;

  v_is_active := (v_to IN ('ACTIVE', 'SCHEDULED'));

  IF p_product_kind = 'banner' THEN
    UPDATE public.store_banner_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      review_status = CASE WHEN v_to = 'REJECTED' THEN 'REJECTED' ELSE review_status END,
      review_notes = CASE WHEN v_to = 'REJECTED' THEN 'period_expired' ELSE review_notes END,
      reviewed_at = CASE WHEN v_to = 'REJECTED' THEN v_now ELSE reviewed_at END,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      ended_at = CASE WHEN v_to = 'ENDED' THEN v_now ELSE ended_at END,
      updated_at = v_now
    WHERE id = p_campaign_id;

    IF v_to = 'REJECTED' AND v_row.creative_id IS NOT NULL THEN
      UPDATE public.delivery_ad_creatives
      SET review_status = 'REJECTED', updated_at = v_now
      WHERE id = v_row.creative_id;
    END IF;
  ELSE
    UPDATE public.store_paid_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      review_status = CASE WHEN v_to = 'REJECTED' THEN 'REJECTED' ELSE review_status END,
      review_notes = CASE WHEN v_to = 'REJECTED' THEN 'period_expired' ELSE review_notes END,
      reviewed_at = CASE WHEN v_to = 'REJECTED' THEN v_now ELSE reviewed_at END,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      ended_at = CASE WHEN v_to = 'ENDED' THEN v_now ELSE ended_at END,
      updated_at = v_now
    WHERE id = p_campaign_id;
  END IF;

  IF v_to = 'REJECTED' THEN
    v_refund := public.business_cash_delivery_ad_refund_system(p_campaign_id, p_product_kind);
    IF coalesce((v_refund->>'ok')::boolean, false) IS NOT TRUE
       AND coalesce(v_refund->>'error', '') <> 'funding_not_found' THEN
      RAISE EXCEPTION USING ERRCODE = 'DA503', MESSAGE = 'delivery_ad_expire_refund_failed';
    END IF;
  END IF;

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, reason, before_json, after_json
  ) VALUES (
    p_product_kind,
    p_campaign_id,
    'system',
    NULL,
    v_audit_action,
    CASE WHEN v_to = 'REJECTED' THEN 'period_expired' ELSE NULL END,
    jsonb_build_object('lifecycle', v_from, 'updated_at', v_row.updated_at),
    jsonb_build_object('lifecycle', v_to, 'action', p_action)
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'from', v_from,
    'to', v_to,
    'action', p_action,
    'audit_id', v_audit_id,
    'refund', v_refund
  );
EXCEPTION
  WHEN SQLSTATE 'DA503' THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'refund_failed',
      'detail', coalesce(v_refund->>'error', 'refund_failed')
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_submit_delivery_ad_with_business_cash(
  p_owner_user_id uuid,
  p_store_id uuid,
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
  v_cash jsonb;
  v_tr jsonb;
  v_bind text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;
  IF p_action NOT IN ('submit', 'resubmit') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  BEGIN
    v_cash := public.business_cash_delivery_ad_spend(
      p_owner_user_id, p_store_id, p_campaign_id, p_product_kind, NULL
    );
    IF coalesce((v_cash->>'ok')::boolean, false) IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false,
        'stage', 'cash',
        'error', coalesce(v_cash->>'error', 'debit_failed'),
        'cash', v_cash
      );
    END IF;

    v_tr := public.owner_delivery_ad_transition(
      p_owner_user_id, p_product_kind, p_campaign_id, p_action,
      p_expected_lifecycle, p_audit_action
    );
    IF coalesce((v_tr->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'DA502', MESSAGE = 'delivery_ad_submit_transition_failed';
    END IF;

    -- ADS-02: the paid snapshot must cover the submitted period and the single linked inventory.
    -- Checked after the transition (campaign row locked FOR UPDATE in this TX); failure rolls back debit + transition.
    v_bind := public.delivery_ad_owner_snapshot_binding_error(p_product_kind, p_campaign_id);
    IF v_bind IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'DA504', MESSAGE = 'delivery_ad_submit_quote_stale';
    END IF;
  EXCEPTION WHEN SQLSTATE 'DA504' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'stage', 'quote',
      'error', 'quote_stale',
      'detail', v_bind
    );
  WHEN SQLSTATE 'DA502' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'stage', 'transition',
      'error', coalesce(v_tr->>'error', 'transition_failed'),
      'transition', v_tr
    );
  END;

  RETURN v_tr || jsonb_build_object('cash', v_cash);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delivery_ad_campaign_index(p_pending_asset text)
RETURNS TABLE (
  product_kind text,
  id uuid,
  store_id uuid,
  owner_user_id uuid,
  lifecycle_status text,
  review_status text,
  review_notes text,
  title text,
  headline text,
  image_url text,
  campaign_source text,
  start_at timestamptz,
  end_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  inventory_keys text[],
  store_name text,
  store_primary_slug text,
  store_sub_slug text,
  list_bucket text,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH camp AS (
    SELECT 'store_sponsored'::text AS product_kind, c.id, c.store_id, c.owner_user_id,
           coalesce(c.lifecycle_status, 'DRAFT') AS lifecycle_status, c.review_status, c.review_notes,
           c.title, c.headline, c.image_url, coalesce(c.campaign_source, 'OWNER_PAID') AS campaign_source,
           c.start_at, c.end_at, c.submitted_at, c.created_at, c.updated_at,
           ARRAY(SELECT i.key FROM public.delivery_store_sponsored_campaign_inventories ci
                   JOIN public.delivery_ad_inventories i ON i.id = ci.inventory_id
                  WHERE ci.campaign_id = c.id ORDER BY ci.priority, ci.created_at, i.key) AS inventory_keys,
           NULL::integer AS sort_order
      FROM public.store_paid_ad_campaigns c
    UNION ALL
    SELECT 'banner'::text, c.id, c.store_id, c.owner_user_id,
           coalesce(c.lifecycle_status, 'DRAFT'), c.review_status, c.review_notes,
           c.title, c.subtitle, c.image_url, coalesce(c.campaign_source, 'OWNER_PAID'),
           c.start_at, c.end_at, c.submitted_at, c.created_at, c.updated_at,
           ARRAY(SELECT i.key FROM public.delivery_banner_campaign_inventories ci
                   JOIN public.delivery_ad_inventories i ON i.id = ci.inventory_id
                  WHERE ci.campaign_id = c.id ORDER BY ci.priority, ci.created_at, i.key),
           c.sort_order
      FROM public.store_banner_ad_campaigns c
  )
  SELECT camp.product_kind, camp.id, camp.store_id, camp.owner_user_id, camp.lifecycle_status,
         camp.review_status, camp.review_notes, camp.title, camp.headline, camp.image_url,
         camp.campaign_source, camp.start_at, camp.end_at, camp.submitted_at, camp.created_at,
         camp.updated_at, camp.inventory_keys, s.store_name,
         nullif(lower(btrim(sc.slug)), '') AS store_primary_slug,
         nullif(lower(btrim(st.slug)), '') AS store_sub_slug,
         CASE
           -- ADS-12: review lifecycle without any funding (legacy, unfunded) -> separate no-action bucket
           WHEN camp.lifecycle_status IN ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED')
                AND NOT public.delivery_ad_campaign_funding_allows_active(
                  camp.product_kind, camp.id, camp.campaign_source) THEN 'review_unfunded'
           -- banner creative production needed (empty or pending placeholder)
           WHEN camp.product_kind = 'banner'
                AND (nullif(btrim(coalesce(camp.image_url, '')), '') IS NULL
                     OR btrim(camp.image_url) = p_pending_asset) THEN 'needs_creative'
           WHEN camp.lifecycle_status IN ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED') THEN 'review'
           WHEN camp.lifecycle_status IN ('APPROVED', 'SCHEDULED') THEN 'scheduled'
           WHEN camp.lifecycle_status = 'ACTIVE' THEN 'active'
           WHEN camp.lifecycle_status IN ('PAUSED_ADMIN', 'PAUSED_OWNER') THEN 'held'
           WHEN camp.lifecycle_status IN ('ENDED', 'TERMINATED', 'ARCHIVED', 'EXHAUSTED') THEN 'ended'
           WHEN camp.lifecycle_status = 'REJECTED' THEN 'rejected'
           ELSE NULL
         END AS list_bucket,
         camp.sort_order
    FROM camp
    LEFT JOIN public.stores s ON s.id = camp.store_id
    LEFT JOIN public.store_categories sc ON sc.id = s.store_category_id
    LEFT JOIN public.store_topics st ON st.id = s.store_topic_id;
$$;

-- Existing grants are kept by CREATE OR REPLACE (service_role EXECUTE only, unchanged).

COMMIT;
