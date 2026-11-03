-- 거래 상위노출 포인트 내역 문구 (Owner 2026-11-03 「계획된 부분 정확히 구현」 · 계획 D/E)
-- 1) 결제 내역: 「프로모션 구매 (trade_promote_7, 7일)」(내부 상품 ID 노출) → 거래면 「거래 상위노출 7일」 (커뮤니티 문구 그대로)
-- 2) 심사 보류·승인·반려·종료 환급 문구: 「거래 더 알리기 …」 → 「거래 상위노출 …」
-- 방법: 운영 함수 정의를 그대로 읽어 문구만 바꿔 다시 만든다(손으로 옮겨 쓰지 않음 · 인자·권한·로직 불변).
--       바꿀 문구가 없으면 오류로 멈춘다(이미 바뀐 정의면 건너뜀). 이미 쌓인 내역 행은 고치지 않는다(화면 표시 단계에서 바꿔 보여 줌).
DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_old text := 'left(''프로모션 구매 ('' || trim(p_product_id) || '', '' || p_duration_days || ''일)'', 500)';
  v_new text := 'left(CASE WHEN coalesce(nullif(trim(p_domain), ''''), ''trade'') = ''trade'' THEN ''거래 상위노출 '' || p_duration_days || ''일'' ELSE ''프로모션 구매 ('' || trim(p_product_id) || '', '' || p_duration_days || ''일)'' END, 500)';
  v_name text;
BEGIN
  -- 1) 결제 함수
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'purchase_member_content_promotion';
  v_def := pg_get_functiondef(v_oid);
  IF position('거래 상위노출 '' || p_duration_days' IN v_def) = 0 THEN
    IF position(v_old IN v_def) = 0 THEN
      RAISE EXCEPTION 'purchase_member_content_promotion: 바꿀 문구를 찾지 못함';
    END IF;
    EXECUTE replace(v_def, v_old, v_new);
  END IF;

  -- 2) 거래 상위노출 심사·종료 함수 4개
  FOREACH v_name IN ARRAY ARRAY[
    'request_trade_promotion_review',
    'admin_trade_promotion_approve',
    'admin_trade_promotion_reject',
    'admin_trade_promotion_end'
  ] LOOP
    SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name;
    v_def := pg_get_functiondef(v_oid);
    IF position('거래 더 알리기' IN v_def) > 0 THEN
      EXECUTE replace(v_def, '거래 더 알리기', '거래 상위노출');
    END IF;
  END LOOP;
END;
$$;
