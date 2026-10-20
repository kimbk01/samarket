-- Owner 승인 O-9 · V3-04 (DEF-7): 배달 광고 사장님 제출(submit/resubmit) = 비즈캐시 차감 + 상태 전이를 한 트랜잭션으로.
-- 이전 구현(app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions)은
--   (1) business_cash_delivery_ad_spend — 차감 원장 INSERT + funding SECURED
--   (2) owner_delivery_ad_transition — DRAFT/CHANGES_REQUESTED → SUBMITTED + 감사 로그
-- 를 별도 요청으로 실행해, (2) 실패(stale·경합·중단) 시 "돈은 빠졌는데 캠페인은 DRAFT" 가 남았다
-- (관리자 refund_orphan_funding 수동 복구 대상).
--
-- 이 함수는 기존 두 함수를 **그대로** 한 plpgsql 본문(=한 트랜잭션) 안에서 순서대로 호출한다.
--   - 금액·잔액 검사·원장 idempotency_key 'bc_spend:<kind>:<id>' (append-only 원장, SECURED 재호출 멱등) = business_cash_delivery_ad_spend
--   - 상태 전이·CAS(p_expected_lifecycle)·SECURED funding 확인·감사 로그 = owner_delivery_ad_transition
--   차감 실패 → stage 'cash' + 차감 결과(cash) 그대로 반환 (INSUFFICIENT_BUSINESS_CASH 금액 필드 포함)
--   전이 실패 → 서브트랜잭션 롤백으로 차감도 취소, stage 'transition' + 전이 결과 반환
-- 호출: service_role 전용. TS 는 함수 미배포(42883/PGRST202) 시에만 기존 2단계 경로로 폴백.
-- **운영 DB 적용은 Owner 배포 승인 후.**

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
  EXCEPTION WHEN SQLSTATE 'DA502' THEN
    -- 차감·전이 모두 롤백됨 (서브트랜잭션). 지역 변수 v_tr 는 유지된다.
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

REVOKE ALL ON FUNCTION public.owner_submit_delivery_ad_with_business_cash(uuid, uuid, text, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_submit_delivery_ad_with_business_cash(uuid, uuid, text, uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_submit_delivery_ad_with_business_cash(uuid, uuid, text, uuid, text, text, text) TO service_role;

COMMENT ON FUNCTION public.owner_submit_delivery_ad_with_business_cash(uuid, uuid, text, uuid, text, text, text) IS
  'O-9/V3-04 DEF-7: 배달 광고 사장님 제출 — 비즈캐시 차감 + 상태 전이 단일 트랜잭션 (service_role 전용).';
