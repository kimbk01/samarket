-- 배달 오너 G-1 2단계 2-C · FIN-05 ⊃ ADS-21 ⊃ GFT-05(원자화) · ADS-25
--   docs/audit/delivery-owner-2026-10-20/G-1-stage1-2-design.md §5-C · H-stage2-money-policy.md §5
--
-- 목적: 종료 전이(cancelled / refunded)의 금전 부수효과를 주문 상태 UPDATE 와 같은 DB 트랜잭션으로 묶는다.
--   (기존: TS 가 상태 커밋 후 Coin 역분개·쿠폰 복원·상품권 취소 복원·배달 행 종료를 별도 호출, 실패는 로그만)
--   - 환불: gift_certificate_refund_order_atomic 안에서 상태 UPDATE 직후
--       reverse_coin_credits_for_order(order, 'coin_reversal:order:'||id, 'order_refund')  (Coin 원장에 적립된 만큼 그대로 역분개)
--       restore_store_coupon_entitlement(order, true)
--     를 호출. 실패(ok=false 또는 예외) → 예외 → 환불 상태 롤백.
--   - 취소: 내부 전용 store_order_apply_cancel_side_effects(order) 신설
--       쿠폰 복원(p_allow_after_completed=false) + 상품권 취소 복원(gift_certificate_cancel_order_restore)
--       + 열린 배달 행 종료(DLV-02 ③: delivery_failed / failure_note='order_cancelled')
--     모든 취소 경로가 상태 UPDATE 직후 같은 TX 에서 호출:
--       store_order_owner_cancel_atomic (오너 직접 취소)
--       store_order_cancel_request_decide_atomic (취소요청 승인, approve 일 때만)
--       store_order_cancel_direct_atomic (신설: 구매자 접수 전 취소 · 관리자 직접 취소 · SYSTEM accept_timeout / payment_failure)
--   - GFT-05 만료 복원: 현행(그대로 복원) 유지. 복원 대상 상품권이 이미 만료(gift_certificate_instance_is_expired)면
--     결과에 restored_expired=true → TS 가 주문 상태 이벤트 metadata 에 기록(관리자 확인용, D-20).
--   - ADS-25: restore_store_coupon_entitlement 가 store_coupon_redemptions 행을 DELETE 하지 않고 reversed_at·reversed_reason 마킹.
--       UNIQUE(buyer_user_id, campaign_id) → reversed_at IS NULL 부분 UNIQUE (재사용 허용 유지)
--       user_coupon_id 부분 UNIQUE 도 reversed_at IS NULL 조건 추가 (복원된 같은 쿠폰 재사용)
--       예산 재가산은 캠페인 lifecycle_state='active' 일 때만 · 엔타이틀먼트 상태 'restored'
--       (create_store_order_atomic 은 이미 status IN ('available','restored') 를 claim — 재정의하지 않음)
--       admin_store_coupon_campaign_page 의 사용 집계는 reversed_at IS NULL 만 (DELETE 시절과 같은 수치)
--   - 재고 복원(restore_store_order_stock_atomic)은 Recovery Chain HARD LOCK — TS 유지(변경 없음).
--   - 수수료: 주문 UPDATE 가 trg_store_orders_commission_lifecycle 를 같은 TX 에서 발화(기존). 환급은 관리자 결정 함수만.
--
-- 잠금 순서: 배달 행(FOR NO KEY UPDATE) → 주문 행(FOR UPDATE). 픽업 트리거(배달 UPDATE → 주문 FOR SHARE)와 같은 순서.
--   오너 직접 취소의 배달 행 잠금을 FOR SHARE → FOR NO KEY UPDATE 로 올림(같은 TX 에서 배달 행을 종료하므로
--   공유 잠금 승격 교착 방지). 픽업 판정(picked_up)·결과 의미는 그대로.
--
-- 운영 원문 기준(2026-10-21 읽기 전용 조회, md5(prosrc)) — 저장소 최신 정의와 동일함을 격리 DB 에서 확인:
--   gift_certificate_refund_order_atomic(uuid, uuid)                       cb3267c206e2da28ee69aa5a3d31bef5
--   restore_store_coupon_entitlement(uuid, boolean)                        ac77b283ccb6e199e1622968948446d5
--   store_order_owner_cancel_atomic(uuid, uuid, uuid, text, text, text)    2cceb2c3a5bdff181519dfe1c76a8a55
--   store_order_cancel_request_decide_atomic(uuid x3, text x5, timestamptz) e9e6ba25b0f24e777c16abc23ffdad5b
--   admin_store_coupon_campaign_page(text, text, uuid, uuid, int, int)     c2c07dfcf8d4565f9a3bdcd8d77cfeab
--   (호출만 하는 함수 — 변경 없음: reverse_coin_credits_for_order d4b9c896ff27db5dd4ed87bcbe56690f,
--    gift_certificate_cancel_order_restore d3b8126d739a4161edeafaf57f41cc49,
--    gift_certificate_redemption_reverse da8e00cd131551f5454712b7571513df)
--
-- 권한: 신설 store_order_cancel_direct_atomic 은 service_role 만 EXECUTE + auth.role() 검사.
--       store_order_apply_cancel_side_effects 는 내부 전용(EXECUTE 전부 회수 — DEFINER 취소 함수에서만 호출).
-- 과거 데이터 변경 없음(D-5): 기존 redemption 행·엔타이틀먼트·예산·Coin 원장 무변. 함수 본문은 ASCII 만.
--
-- 배포 순서: 이 마이그레이션 → 웹(TS 가 store_order_cancel_direct_atomic 호출, store_coupon_redemptions.reversed_at 조회).
-- 롤백:
--   1) 웹을 이전 커밋으로 되돌린다(TS 가 부수효과를 다시 직접 호출).
--   2) 아래 5개 함수를 위 md5 의 운영 원문(저장소: 20270101150000_gift_refund_order_atomic_from_status_cas.sql,
--      20260825120000_free_coupon_ssot_m1_m6.sql, 20270602120000_store_order_cancel_ledger_atomic.sql,
--      20270601140000_r7_admin_store_coupon_campaign_page.sql)으로 재실행.
--   3) DROP FUNCTION IF EXISTS public.store_order_cancel_direct_atomic(uuid, text, text, text);
--      DROP FUNCTION IF EXISTS public.store_order_apply_cancel_side_effects(uuid);
--   4) 인덱스: reversed_at 이 채워진 행이 없을 때만 원복 가능 —
--      DROP INDEX public.store_coupon_redemptions_buyer_campaign_active_uidx;
--      ALTER TABLE public.store_coupon_redemptions ADD CONSTRAINT store_coupon_redemptions_buyer_campaign_unique UNIQUE (buyer_user_id, campaign_id);
--      DROP INDEX public.store_coupon_redemptions_user_coupon_uidx;
--      CREATE UNIQUE INDEX store_coupon_redemptions_user_coupon_uidx ON public.store_coupon_redemptions (user_coupon_id) WHERE user_coupon_id IS NOT NULL;
--      (컬럼 reversed_at / reversed_reason 은 남겨도 무해)

-- ---------------------------------------------------------------------------------------------
-- ADS-25 schema: keep redemption history (reversed_at marking), uniqueness only among active rows.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.store_coupon_redemptions
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_reason text;

ALTER TABLE public.store_coupon_redemptions
  DROP CONSTRAINT IF EXISTS store_coupon_redemptions_buyer_campaign_unique;
CREATE UNIQUE INDEX IF NOT EXISTS store_coupon_redemptions_buyer_campaign_active_uidx
  ON public.store_coupon_redemptions (buyer_user_id, campaign_id)
  WHERE reversed_at IS NULL;

DROP INDEX IF EXISTS public.store_coupon_redemptions_user_coupon_uidx;
CREATE UNIQUE INDEX store_coupon_redemptions_user_coupon_uidx
  ON public.store_coupon_redemptions (user_coupon_id)
  WHERE user_coupon_id IS NOT NULL AND reversed_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- restore_store_coupon_entitlement (base md5 ac77b283ccb6e199e1622968948446d5)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_store_coupon_entitlement(p_order_id uuid, p_allow_after_completed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ent record;
  v_campaign record;
  v_budget_restored boolean := false;
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

  SELECT restore_on_full_refund, first_order_scope, lifecycle_state
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

  -- One usable entitlement per (buyer, campaign): never raise inside the cancel/refund TX for it.
  IF EXISTS (
    SELECT 1 FROM public.coupon_user_entitlements x
     WHERE x.buyer_user_id = v_ent.buyer_user_id
       AND x.campaign_id = v_ent.campaign_id
       AND x.id <> v_ent.id
       AND x.status IN ('available', 'restored')
  ) THEN
    RETURN jsonb_build_object('ok', true, 'restored', false, 'reason', 'active_entitlement_exists');
  END IF;

  UPDATE public.coupon_user_entitlements
     SET status = 'restored',
         redeemed_order_id = NULL,
         updated_at = now()
   WHERE id = v_ent.id;

  -- ADS-25: budget goes back only to a campaign that can still spend it.
  IF v_campaign.lifecycle_state = 'active' THEN
    UPDATE public.store_coupon_campaigns
       SET reserved_spend_php = reserved_spend_php + v_ent.reserved_php,
           updated_at = now()
     WHERE id = v_ent.campaign_id;
    v_budget_restored := true;
  END IF;

  -- ADS-25: keep the redemption history; mark it reversed instead of deleting it.
  UPDATE public.store_coupon_redemptions
     SET reversed_at = now(),
         reversed_reason = CASE WHEN p_allow_after_completed IS TRUE THEN 'order_refund' ELSE 'order_cancel' END
   WHERE order_id = p_order_id
     AND reversed_at IS NULL;

  RETURN jsonb_build_object('ok', true, 'restored', true, 'budget_restored', v_budget_restored);
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- store_order_apply_cancel_side_effects (new, internal): money/dispatch side effects of a cancel,
-- called by every cancel function right after its status UPDATE (same transaction).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_order_apply_cancel_side_effects(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_coupon jsonb;
  v_gift jsonb;
  v_restored_expired boolean;
  v_delivery_closed integer := 0;
BEGIN
  SELECT order_status INTO v_status
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF v_status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'store_order_cancel_side_effects_not_cancelled:%', coalesce(v_status, 'missing');
  END IF;

  -- Coupon (ADS-21): cancel restore, never after-completed policy.
  v_coupon := public.restore_store_coupon_entitlement(p_order_id, false);
  IF coalesce(v_coupon->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'coupon_restore_failed: %', coalesce(v_coupon->>'error', 'unknown');
  END IF;

  -- GFT-05: keep restoring an expired certificate (D-20 default), but flag it for admin review.
  SELECT EXISTS (
    SELECT 1
      FROM public.gift_certificate_redemptions r
      JOIN public.gift_certificate_instances i ON i.id = r.instance_id
     WHERE r.order_id = p_order_id
       AND r.reversed = false
       AND public.gift_certificate_instance_is_expired(i.valid_until)
  ) INTO v_restored_expired;

  v_gift := public.gift_certificate_cancel_order_restore(p_order_id);
  IF coalesce(v_gift->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'gift_cancel_restore_failed: %', coalesce(v_gift->>'error', 'unknown');
  END IF;

  -- DLV-02 (3): the order closed -> an open delivery row leaves the dispatch queue.
  UPDATE public.store_order_deliveries
     SET delivery_status = 'delivery_failed',
         failure_note = 'order_cancelled',
         failed_at = now()
   WHERE order_id = p_order_id
     AND delivery_status IN ('waiting_rider', 'rider_assigned', 'pickup_in_progress', 'delivering');
  GET DIAGNOSTICS v_delivery_closed = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'coupon_restore', v_coupon,
    'gift_restore', v_gift,
    'restored_expired', coalesce(v_restored_expired, false),
    'delivery_closed', v_delivery_closed > 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.store_order_apply_cancel_side_effects(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- store_order_cancel_direct_atomic (new): plain cancels without a cancel ledger row
-- (buyer pre-accept cancel, admin direct cancel, SYSTEM accept_timeout / payment_failure).
-- Same CAS as the former TS UPDATE: order_status=expected -> cancelled + payment terminal.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_order_cancel_direct_atomic(
  p_order_id uuid,
  p_expected_status text,
  p_payment_status text,
  p_actor text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_side jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL
     OR p_payment_status NOT IN ('cancelled', 'failed')
     OR p_actor NOT IN ('CUSTOMER', 'OWNER', 'ADMIN', 'SYSTEM')
     OR p_expected_status NOT IN ('pending', 'accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived', 'cancel_requested') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- Lock order: delivery row first, then order row (same order as the pickup guard trigger).
  PERFORM 1
     FROM public.store_order_deliveries
    WHERE order_id = p_order_id
    FOR NO KEY UPDATE;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  IF v_order.order_status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transition_conflict', 'order_status', v_order.order_status);
  END IF;

  UPDATE public.store_orders
     SET order_status = 'cancelled',
         payment_status = p_payment_status,
         auto_complete_at = NULL,
         needs_admin_attention = false,
         updated_at = now()
   WHERE id = p_order_id
     AND order_status = p_expected_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_cancel_direct_race';
  END IF;

  v_side := public.store_order_apply_cancel_side_effects(p_order_id);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'previous_order_status', v_order.order_status,
    'side_effects', v_side
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.store_order_cancel_direct_atomic(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_order_cancel_direct_atomic(uuid, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- store_order_owner_cancel_atomic (base md5 2cceb2c3a5bdff181519dfe1c76a8a55)
-- diff: delivery lock FOR SHARE -> FOR NO KEY UPDATE; side effects after the ledger insert; result + side_effects.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_order_owner_cancel_atomic(p_order_id uuid, p_store_id uuid, p_owner_user_id uuid, p_expected_status text, p_reason text, p_detail text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_delivery_status text;
  v_owner uuid;
  v_request_id uuid;
  v_side jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR p_store_id IS NULL OR p_owner_user_id IS NULL
     OR coalesce(btrim(p_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- Lock order: delivery row first, then order row (same order as the pickup guard trigger).
  -- NO KEY UPDATE (not SHARE): the cancel side effects close this row in the same TX.
  SELECT delivery_status INTO v_delivery_status
    FROM public.store_order_deliveries
   WHERE order_id = p_order_id
   FOR NO KEY UPDATE;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id AND store_id = p_store_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  SELECT owner_user_id INTO v_owner FROM public.stores WHERE id = p_store_id;
  IF v_owner IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF coalesce(v_order.admin_locked, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_admin_locked');
  END IF;
  IF v_order.order_status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transition_conflict', 'order_status', v_order.order_status);
  END IF;
  IF v_order.order_status NOT IN ('pending', 'accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition', 'order_status', v_order.order_status);
  END IF;
  IF v_delivery_status IN ('pickup_in_progress', 'delivering', 'delivered', 'delivery_failed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'picked_up', 'delivery_status', v_delivery_status);
  END IF;

  UPDATE public.store_orders
     SET order_status = 'cancelled',
         payment_status = 'cancelled',
         auto_complete_at = NULL,
         needs_admin_attention = false,
         updated_at = now()
   WHERE id = p_order_id
     AND order_status = p_expected_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_owner_cancel_race';
  END IF;

  INSERT INTO public.store_order_cancel_requests (
    order_id, previous_order_status, requested_by, requested_role, reason, detail_reason,
    status, approved_by, approved_at, refund_status
  ) VALUES (
    p_order_id, v_order.order_status, p_owner_user_id, 'owner', left(btrim(p_reason), 500),
    nullif(left(btrim(coalesce(p_detail, '')), 500), ''),
    'approved', p_owner_user_id, now(), 'not_applicable'
  )
  RETURNING id INTO v_request_id;

  -- FIN-05 / ADS-21 / GFT-05: coupon + gift restore + delivery close in this TX.
  v_side := public.store_order_apply_cancel_side_effects(p_order_id);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'request_id', v_request_id,
    'previous_order_status', v_order.order_status,
    'side_effects', v_side
  );
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- store_order_cancel_request_decide_atomic (base md5 e9e6ba25b0f24e777c16abc23ffdad5b)
-- diff: delivery row locked first (NO KEY UPDATE); approve -> side effects after the ledger update;
--       result + side_effects (approve only).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_order_cancel_request_decide_atomic(p_order_id uuid, p_store_id uuid, p_actor_user_id uuid, p_actor_role text, p_expected_status text, p_decision text, p_restore_status text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_auto_complete_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_owner uuid;
  v_req public.store_order_cancel_requests%ROWTYPE;
  v_to text;
  v_side jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR p_store_id IS NULL OR p_actor_user_id IS NULL
     OR p_actor_role NOT IN ('owner', 'admin')
     OR p_decision NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF p_decision = 'reject' AND coalesce(btrim(p_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  -- Lock order: delivery row first, then order row (approve closes the delivery row in this TX).
  PERFORM 1
     FROM public.store_order_deliveries
    WHERE order_id = p_order_id
    FOR NO KEY UPDATE;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id AND store_id = p_store_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF p_actor_role = 'owner' THEN
    SELECT owner_user_id INTO v_owner FROM public.stores WHERE id = p_store_id;
    IF v_owner IS DISTINCT FROM p_actor_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    IF coalesce(v_order.admin_locked, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'order_admin_locked');
    END IF;
  END IF;

  IF v_order.order_status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transition_conflict', 'order_status', v_order.order_status);
  END IF;
  IF v_order.order_status IS DISTINCT FROM 'cancel_requested' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition', 'order_status', v_order.order_status);
  END IF;

  SELECT * INTO v_req
    FROM public.store_order_cancel_requests
   WHERE order_id = p_order_id AND status = 'pending'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cancel_request_not_found');
  END IF;

  IF p_decision = 'approve' THEN
    v_to := 'cancelled';
    UPDATE public.store_orders
       SET order_status = 'cancelled',
           payment_status = 'cancelled',
           auto_complete_at = NULL,
           needs_admin_attention = false,
           updated_at = now()
     WHERE id = p_order_id
       AND order_status = 'cancel_requested';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'store_order_cancel_decide_race';
    END IF;
    UPDATE public.store_order_cancel_requests
       SET status = 'approved',
           approved_by = p_actor_user_id,
           approved_at = now(),
           refund_status = 'pending'
     WHERE id = v_req.id
       AND status = 'pending';
  ELSE
    v_to := v_req.previous_order_status;
    IF v_to IS NULL
       OR v_to NOT IN ('accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived')
       OR v_to IS DISTINCT FROM p_restore_status THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'restore_status_mismatch',
        'previous_order_status', v_req.previous_order_status
      );
    END IF;
    UPDATE public.store_orders
       SET order_status = v_to,
           auto_complete_at = p_auto_complete_at,
           needs_admin_attention = false,
           updated_at = now()
     WHERE id = p_order_id
       AND order_status = 'cancel_requested';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'store_order_cancel_decide_race';
    END IF;
    UPDATE public.store_order_cancel_requests
       SET status = 'rejected',
           rejected_at = now(),
           rejected_reason = left(btrim(p_reason), 500),
           refund_status = 'not_applicable'
     WHERE id = v_req.id
       AND status = 'pending';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_cancel_ledger_race';
  END IF;

  -- FIN-05 / ADS-21 / GFT-05: approve -> coupon + gift restore + delivery close in this TX.
  IF p_decision = 'approve' THEN
    v_side := public.store_order_apply_cancel_side_effects(p_order_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'request_id', v_req.id,
    'previous_order_status', v_req.previous_order_status,
    'order_status', v_to,
    'side_effects', v_side
  );
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- gift_certificate_refund_order_atomic (base md5 cb3267c206e2da28ee69aa5a3d31bef5)
-- diff: after the refunded UPDATE + store_payments, Coin reversal (mirror of what the coin ledger credited,
--       same key/reason as the former TS call) and coupon restore in the same TX; failure -> RAISE.
--       Idempotent branch (already refunded) unchanged.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_refund_order_atomic(p_order_id uuid, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_reverse jsonb;
  v_coin jsonb;
  v_coupon jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order.order_status = 'refunded' THEN
    v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', p_order_id,
      'gift_reverse', v_reverse
    );
  END IF;

  IF v_order.order_status IS DISTINCT FROM 'refund_requested' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'unexpected_from_status',
      'order_status', v_order.order_status
    );
  END IF;

  -- Gift reverse FIRST in same TX. Failure => RAISE => refund not terminal.
  v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
  IF coalesce(v_reverse->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'gift_reverse_failed: %', coalesce(v_reverse->>'error', 'unknown');
  END IF;

  UPDATE public.store_orders
     SET order_status = 'refunded',
         payment_status = 'refunded',
         refunded_at = coalesce(refunded_at, now()),
         refund_approved_at = coalesce(refund_approved_at, now()),
         updated_at = now()
   WHERE id = p_order_id
     AND order_status = 'refund_requested';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_refund_status_race';
  END IF;

  UPDATE public.store_payments
     SET status = 'refunded'
   WHERE order_id = p_order_id
     AND status = 'succeeded';

  -- FIN-05: Coin clawback of exactly what the coin ledger credited for this order (idempotent key).
  v_coin := public.reverse_coin_credits_for_order(p_order_id, 'coin_reversal:order:' || p_order_id::text, 'order_refund');
  IF coalesce(v_coin->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'coin_reversal_failed: %', coalesce(v_coin->>'error', 'unknown');
  END IF;

  -- ADS-21: coupon restore (refund policy: restore_on_full_refund / first-order scope).
  v_coupon := public.restore_store_coupon_entitlement(p_order_id, true);
  IF coalesce(v_coupon->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'coupon_restore_failed: %', coalesce(v_coupon->>'error', 'unknown');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'gift_reverse', v_reverse,
    'coin_reversal', v_coin,
    'coupon_restore', v_coupon
  );
END;
$function$;

-- ---------------------------------------------------------------------------------------------
-- admin_store_coupon_campaign_page (base md5 c2c07dfcf8d4565f9a3bdcd8d77cfeab)
-- diff: usage aggregate counts active redemptions only (r.reversed_at IS NULL) - same numbers as when
--       restore deleted the row.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_store_coupon_campaign_page(
  p_status text,
  p_funding text,
  p_store_id uuid,
  p_campaign_id uuid,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT nullif(nullif(btrim(coalesce(p_status, '')), ''), 'all') AS status_q,
           nullif(nullif(btrim(coalesce(p_funding, '')), ''), 'all') AS funding_q,
           LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  classified AS (
    SELECT c.id, c.store_id, c.funding_mode, c.created_at,
           CASE
             WHEN btrim(coalesce(c.lifecycle_state, '')) IN ('requested', 'draft') THEN 'waiting'
             WHEN btrim(coalesce(c.lifecycle_state, '')) IN ('ended', 'revoked', 'rejected') THEN 'ended'
             ELSE 'active'
           END AS bucket
      FROM public.store_coupon_campaigns c
  ),
  filtered AS (
    SELECT k.*
      FROM classified k
     CROSS JOIN params pr
     WHERE (pr.status_q IS NULL OR k.bucket = pr.status_q)
       AND (pr.funding_q IS NULL OR k.funding_mode = pr.funding_q)
       AND (p_store_id IS NULL OR k.store_id = p_store_id)
       AND (p_campaign_id IS NULL OR k.id = p_campaign_id)
  ),
  page AS (
    SELECT f.id, f.created_at
      FROM filtered f
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  ),
  ent AS (
    SELECT e.campaign_id,
           count(*) AS claimed,
           count(*) FILTER (WHERE e.status = 'redeemed') AS redeemed,
           count(*) FILTER (WHERE e.status = 'revoked') AS revoked,
           count(*) FILTER (
             WHERE e.status = 'expired'
                OR (e.status IN ('available', 'restored') AND e.expires_at <= now())
           ) AS expired,
           count(*) FILTER (
             WHERE e.status IN ('available', 'restored') AND e.expires_at > now()
           ) AS active_held
      FROM public.coupon_user_entitlements e
     WHERE e.campaign_id IN (SELECT id FROM page)
     GROUP BY e.campaign_id
  ),
  red AS (
    SELECT r.campaign_id,
           count(*) AS order_count,
           sum(GREATEST(0, round(coalesce(o.discount_amount, 0)::numeric))) AS customer_discount,
           sum(GREATEST(0, round(coalesce(o.store_funded_amount, 0)::numeric))) AS store_funded,
           sum(GREATEST(0, round(coalesce(o.platform_funded_amount, 0)::numeric))) AS platform_funded,
           sum(round(coalesce(o.payment_amount, 0)::numeric)) AS order_sales_php
      FROM public.store_coupon_redemptions r
      JOIN public.store_orders o ON o.id = r.order_id
     WHERE r.campaign_id IN (SELECT id FROM page)
       AND r.reversed_at IS NULL
     GROUP BY r.campaign_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'limit', (SELECT lim FROM params),
    'offset', (SELECT off FROM params),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pg.id,
               'claimed', coalesce(en.claimed, 0),
               'redeemed', coalesce(en.redeemed, 0),
               'active_held', coalesce(en.active_held, 0),
               'expired', coalesce(en.expired, 0),
               'revoked', coalesce(en.revoked, 0),
               'order_count', coalesce(rd.order_count, 0),
               'customer_discount', coalesce(rd.customer_discount, 0),
               'store_funded', coalesce(rd.store_funded, 0),
               'platform_funded', coalesce(rd.platform_funded, 0),
               'order_sales_php', coalesce(rd.order_sales_php, 0)
             ) ORDER BY pg.created_at DESC, pg.id DESC)
        FROM page pg
        LEFT JOIN ent en ON en.campaign_id = pg.id
        LEFT JOIN red rd ON rd.campaign_id = pg.id
    ), '[]'::jsonb),
    'kpi', (
      SELECT jsonb_build_object(
               'total', count(*),
               'active', count(*) FILTER (WHERE bucket = 'active'),
               'waiting', count(*) FILTER (WHERE bucket = 'waiting'),
               'ended', count(*) FILTER (WHERE bucket = 'ended'))
        FROM classified
    ),
    'stores', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.store_name) ORDER BY s.store_name, s.id)
        FROM public.stores s
       WHERE s.id IN (SELECT DISTINCT store_id FROM classified)
    ), '[]'::jsonb),
    'recent', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'created_at', x.created_at,
               'title', x.title,
               'actor_label', x.actor_label,
               'action', x.action
             ) ORDER BY x.created_at DESC, x.id DESC)
        FROM (
          SELECT a.id, a.created_at, a.action, c.title,
                 coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.nickname), ''), nullif(btrim(p.username), '')) AS actor_label
            FROM public.coupon_audit_events a
            JOIN public.store_coupon_campaigns c ON c.id = a.campaign_id
            LEFT JOIN public.profiles p ON p.id = a.actor_user_id
           ORDER BY a.created_at DESC, a.id DESC
           LIMIT 8
        ) x
    ), '[]'::jsonb)
  );
$$;
