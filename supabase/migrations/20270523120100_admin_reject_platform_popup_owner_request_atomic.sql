-- Owner 승인 O-9 · V3-03 (P-4b): 플랫폼 팝업 사장님 신청 거절을 한 트랜잭션으로 처리한다.
-- 이전 구현(lib/platform-popup/owner-request-approve.ts reject)은
--   (1) business_cash_delivery_ad_refund — 비즈캐시 환불 원장 INSERT + funding REFUNDED
--   (2) platform_popup_owner_requests request_status → rejected, payment_status → refunded
-- 를 별도 요청으로 실행해, (2) 실패·경합 시 "환불됐는데 신청은 submitted/under_review" 로 남거나
-- 동시 승인과 엇갈릴 수 있었다.
--
-- 이 함수는 신청 행 잠금(FOR UPDATE) 아래에서:
--   없음 → not_found
--   request_status 가 submitted / under_review / revision_required 가 아님 → illegal_transition
--     (TS canAdminTransitionPlatformPopupRequest(…, 'rejected') 와 동일한 간선)
--   payment_status = 'funded' 이면 기존 public.business_cash_delivery_ad_refund(admin, request_id, 'platform_popup')
--     를 그대로 호출 (원장 INSERT·idempotency_key 'bc_refund:platform_popup:<id>' 동일, append-only 원장 유지)
--     실패하면 refund_failed:<원인> 반환 — 아무것도 쓰지 않는다
--     payment_status → refunded (TS nextPaymentAfterReject 와 동일)
--   request_status rejected + rejection_reason + reviewed_at
-- 를 한 트랜잭션으로 수행한다. 연결된 캠페인 거절(드묾)·감사 로그는 기존처럼 TS 에서 이어서 처리한다.
-- 호출: service_role 전용 (관리자 API). **운영 DB 적용은 Owner 배포 승인 후.**

CREATE OR REPLACE FUNCTION public.admin_reject_platform_popup_owner_request(
  p_request_id uuid,
  p_reason text,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.platform_popup_owner_requests%ROWTYPE;
  v_payment text;
  v_refund jsonb := NULL;
  v_now timestamptz := now();
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_request_id IS NULL OR p_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_req
    FROM public.platform_popup_owner_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.request_status NOT IN ('submitted', 'under_review', 'revision_required') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'request_status', v_req.request_status);
  END IF;

  v_payment := v_req.payment_status;
  IF v_req.payment_status = 'funded' THEN
    v_refund := public.business_cash_delivery_ad_refund(p_actor, p_request_id, 'platform_popup');
    IF coalesce((v_refund->>'ok')::boolean, false) IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'refund_failed:' || coalesce(v_refund->>'error', 'refund_failed'),
        'detail', v_refund->>'detail'
      );
    END IF;
    v_payment := 'refunded';
  END IF;

  UPDATE public.platform_popup_owner_requests
     SET request_status = 'rejected',
         payment_status = v_payment,
         rejection_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         reviewed_at = v_now,
         updated_at = v_now
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'request_status', 'rejected',
    'previous_request_status', v_req.request_status,
    'previous_payment_status', v_req.payment_status,
    'payment_status', v_payment,
    'admin_campaign_id', v_req.admin_campaign_id,
    'refund', v_refund
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_platform_popup_owner_request(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_platform_popup_owner_request(uuid, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_platform_popup_owner_request(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.admin_reject_platform_popup_owner_request(uuid, text, uuid) IS
  'O-9/V3-03: 플랫폼 팝업 사장님 신청 거절 — 비즈캐시 환불 + 상태 rejected 단일 트랜잭션 (service_role 전용).';
