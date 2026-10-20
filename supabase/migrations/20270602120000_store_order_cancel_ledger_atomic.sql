-- 배달 오너 G-1 1-E · ORD-06 (+ ORD-09 사유 원장, DLV-02 ④ 픽업 잠금) — docs/audit/delivery-owner-2026-10-20/G-1-stage1-2-design.md §4-E
-- 목적: 오너 직접 취소·취소요청 결정(오너·관리자)의 원장(store_order_cancel_requests) 쓰기를
--       주문 상태 UPDATE 와 같은 트랜잭션으로 묶는다. (기존: 상태 전이 후 별도 INSERT/UPDATE, 실패는 로그만)
-- 기준(R-DB-1): 운영 store_order_buyer_cancel_request_atomic 정의(2026-10-21 조회)와 같은 잠금 순서·권한 검사.
--   - 배달 행 FOR SHARE → 주문 행 FOR UPDATE (픽업 UPDATE → 픽업 트리거가 주문 행을 잠그는 순서와 동일, 교착 없음)
--   - auth.role() = service_role 만 실행 (EXECUTE 도 service_role 만)
-- 수수료: 주문 UPDATE 가 trg_store_orders_commission_lifecycle 를 같은 트랜잭션에서 발화한다.
--   부과 실패(store_commission_charge_failed)는 예외로 전체 롤백 → TS 가 기존 409 매핑.
-- 원장 쓰기 실패(제약 위반 등)도 예외 → 주문 상태 롤백(같은 트랜잭션).
-- 과거 데이터 변경 없음(D-5). 함수 본문은 ASCII 만.
-- 롤백:
--   DROP FUNCTION IF EXISTS public.store_order_owner_cancel_atomic(uuid, uuid, uuid, text, text, text);
--   DROP FUNCTION IF EXISTS public.store_order_cancel_request_decide_atomic(uuid, uuid, uuid, text, text, text, text, text, timestamptz);
--   (TS 는 함수가 없으면 503 *_missing 을 반환하므로 롤백 시 웹도 이전 커밋으로 되돌린다)

CREATE OR REPLACE FUNCTION public.store_order_owner_cancel_atomic(
  p_order_id uuid,
  p_store_id uuid,
  p_owner_user_id uuid,
  p_expected_status text,
  p_reason text,
  p_detail text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_delivery_status text;
  v_owner uuid;
  v_request_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR p_store_id IS NULL OR p_owner_user_id IS NULL
     OR coalesce(btrim(p_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- Lock order: delivery row first, then order row (same order as the pickup guard trigger).
  SELECT delivery_status INTO v_delivery_status
    FROM public.store_order_deliveries
   WHERE order_id = p_order_id
   FOR SHARE;

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

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'request_id', v_request_id,
    'previous_order_status', v_order.order_status
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.store_order_owner_cancel_atomic(uuid, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_order_owner_cancel_atomic(uuid, uuid, uuid, text, text, text)
  TO service_role;

-- 취소 요청 결정(오너·관리자 공용): pending 원장 FOR UPDATE → 결정 + 상태 UPDATE 1 트랜잭션.
-- approve: cancel_requested → cancelled (원장 approved, refund_status pending — 기존 TS 와 동일 값)
-- reject : cancel_requested → 원장 previous_order_status (p_restore_status 와 일치해야 함, 원장 rejected)
-- p_auto_complete_at: 복원 상태의 자동완료 시각(TS 전이 규칙이 계산 — 상태 기계 SSOT 는 TS 유지)
CREATE OR REPLACE FUNCTION public.store_order_cancel_request_decide_atomic(
  p_order_id uuid,
  p_store_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_expected_status text,
  p_decision text,
  p_restore_status text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_auto_complete_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_owner uuid;
  v_req public.store_order_cancel_requests%ROWTYPE;
  v_to text;
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

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'request_id', v_req.id,
    'previous_order_status', v_req.previous_order_status,
    'order_status', v_to
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.store_order_cancel_request_decide_atomic(uuid, uuid, uuid, text, text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_order_cancel_request_decide_atomic(uuid, uuid, uuid, text, text, text, text, text, timestamptz)
  TO service_role;
