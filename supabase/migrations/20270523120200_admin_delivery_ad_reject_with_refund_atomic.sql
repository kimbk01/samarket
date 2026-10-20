-- Owner 승인 O-9 · V3-04 (DEF-5): 배달 광고 관리자 반려 + 비즈캐시 환불을 한 트랜잭션으로 처리한다.
-- 이전 구현(lib/stores/advertising/admin-delivery-ad-writer.ts)은
--   (1) admin_delivery_ad_transition(p_action='reject') — 상태 REJECTED + 감사 로그
--   (2) business_cash_delivery_ad_refund — 환불 원장 INSERT + funding REFUNDED
-- 를 별도 요청으로 실행했고, (2) 실패는 refundWarning + 운영 case 대기열로만 남았다
-- ("반려됐는데 캐시는 묶여 있음").
--
-- 이 함수는 기존 두 함수를 **그대로** 한 plpgsql 본문(=한 트랜잭션) 안에서 순서대로 호출한다.
--   - 상태 전이 규칙·CAS(p_expected_lifecycle / p_expected_updated_at)·감사 로그 = admin_delivery_ad_transition
--   - 환불 원장·idempotency_key 'bc_refund:<kind>:<id>' (append-only 원장) = business_cash_delivery_ad_refund
--   전이 실패 → 그 결과 그대로 반환 (아무것도 쓰지 않음)
--   환불 funding_not_found(무상·자사 캠페인) → 반려만 확정 (기존 동작과 동일)
--   그 외 환불 실패 → 서브트랜잭션 롤백으로 반려도 취소, refund_failed 반환
-- 호출: service_role 전용. TS 는 함수 미배포(42883/PGRST202) 시에만 기존 2단계 + refundWarning 경로로 폴백.
-- **운영 DB 적용은 Owner 배포 승인 후.**

CREATE OR REPLACE FUNCTION public.admin_delivery_ad_reject_with_refund(
  p_admin_user_id uuid,
  p_product_kind text,
  p_campaign_id uuid,
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
  v_tr jsonb;
  v_refund jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  BEGIN
    v_tr := public.admin_delivery_ad_transition(
      p_admin_user_id, p_product_kind, p_campaign_id, 'reject',
      p_expected_lifecycle, p_expected_updated_at, p_reason, p_owner_visible_notes
    );
    IF coalesce((v_tr->>'ok')::boolean, false) IS NOT TRUE THEN
      RETURN v_tr;
    END IF;

    v_refund := public.business_cash_delivery_ad_refund(p_admin_user_id, p_campaign_id, p_product_kind);
    IF coalesce((v_refund->>'ok')::boolean, false) IS NOT TRUE
       AND coalesce(v_refund->>'error', '') <> 'funding_not_found' THEN
      RAISE EXCEPTION USING ERRCODE = 'DA501', MESSAGE = 'delivery_ad_reject_refund_failed';
    END IF;
  EXCEPTION WHEN SQLSTATE 'DA501' THEN
    -- 반려·감사 로그·환불 모두 롤백됨 (서브트랜잭션). 지역 변수 v_refund 는 유지된다.
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'refund_failed',
      'detail', coalesce(v_refund->>'error', 'refund_failed')
    );
  END;

  RETURN v_tr || jsonb_build_object(
    'refund', v_refund,
    'refunded', coalesce((v_refund->>'ok')::boolean, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delivery_ad_reject_with_refund(uuid, text, uuid, text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delivery_ad_reject_with_refund(uuid, text, uuid, text, timestamptz, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivery_ad_reject_with_refund(uuid, text, uuid, text, timestamptz, text, text) TO service_role;

COMMENT ON FUNCTION public.admin_delivery_ad_reject_with_refund(uuid, text, uuid, text, timestamptz, text, text) IS
  'O-9/V3-04 DEF-5: 배달 광고 관리자 반려 + 비즈캐시 환불 단일 트랜잭션 (service_role 전용).';
