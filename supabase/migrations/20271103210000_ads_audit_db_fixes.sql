-- 광고 감사 DB 3건 (Owner 「DB 3건 진행」 2026-11-03) — docs/audit/ads-full-audit-2026-11-03.md
-- 백업: docs/audit/ads-db-changes-backup-2026-11-03.json (적용 직전 운영 값)
--
-- 1) P-4 상위노출 중복 결제: 일시정지(paused) 주문이 있는 글에도 새 주문이 들어가 재개 시 활성 주문이 2개가 되던 것.
--    중복 확인을 order_status IN ('active','paused') 로 넓힌다. 방법: 운영 함수 정의를 그대로 읽어 그 조건 한 줄만 바꿔
--    다시 만든다(손으로 옮겨 쓰지 않음 · 인자·권한·나머지 로직 불변). 바꿀 줄이 없으면 오류로 멈춘다(이미 바뀐 정의면 건너뜀).
-- 2) A-6 판매하지 않는 지면: 배달 검색 상단(STORES_SEARCH_TOP)은 코드에서 판매 불가(NOT_SELLABLE)인데 패키지 3개가 켜져 있던 것 → 끈다.
--    캠페인·신청 0건. 어드민 「배달 광고 상업 설정」에서 다시 켤 수 있다. (팝업 POPUP_7D 는 기존 초안 신청과 얽혀 이번에 바꾸지 않음)
-- 3) R-4 PTR 집계 오염: 노출 화면·노출 ID 가 없는 수동 입력 impression 1건(QA 캠페인, 테스트 사용자) 삭제.

DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_old text := '       AND order_status = ''active''
       AND end_at >= now()
     LIMIT 1
  ) THEN
    RETURN jsonb_build_object(''ok'', false, ''error'', ''already_active_promotion'');';
  v_new text := '       AND order_status IN (''active'', ''paused'')
       AND end_at >= now()
     LIMIT 1
  ) THEN
    RETURN jsonb_build_object(''ok'', false, ''error'', ''already_active_promotion'');';
BEGIN
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'purchase_member_content_promotion';
  v_def := pg_get_functiondef(v_oid);
  IF position('order_status IN (''active'', ''paused'')' IN v_def) = 0 THEN
    IF position(v_old IN v_def) = 0 THEN
      RAISE EXCEPTION 'purchase_member_content_promotion: 바꿀 중복 확인 조건을 찾지 못함';
    END IF;
    EXECUTE replace(v_def, v_old, v_new);
  END IF;
END $$;

UPDATE public.delivery_ad_packages
   SET enabled = false,
       updated_at = now()
 WHERE inventory_key = 'STORES_SEARCH_TOP'
   AND enabled = true;

DELETE FROM public.platform_popup_campaign_events
 WHERE id = '53446ca2-79b8-4c0d-8a61-13cde45c3104'
   AND event_type = 'impression'
   AND surface IS NULL
   AND campaign_id = '5f811614-b537-4603-908b-972f16591ba6';
