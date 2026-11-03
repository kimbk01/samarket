-- 재감사 R1 E-10 (Owner 「권장안으로 R1 진행」 2026-11-03): 커뮤니티 상위노출 중복 결제 — 일시정지(paused) 주문이 있는 글에도
-- 새 주문이 들어가던 것(거래는 P-4 로 이미 막음). 중복 확인에 paused 추가(기간 안일 때).
-- 방법: 운영 함수 정의를 그대로 읽어 그 조건 두 줄만 바꿔 다시 만든다(인자·권한·나머지 로직 불변). 바꿀 줄이 없으면 오류로 멈춘다.
-- 되돌리기: 아래 v_new → v_old 로 같은 DO 블록 역방향 실행. 적용 시점 커뮤니티 paused 주문 0건.
DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_old text := '       AND order_status IN (''pending_review'', ''active'')
       AND (order_status <> ''active'' OR end_at >= now())';
  v_new text := '       AND order_status IN (''pending_review'', ''active'', ''paused'')
       AND (order_status = ''pending_review'' OR end_at >= now())';
BEGIN
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'purchase_member_community_promotion';
  v_def := pg_get_functiondef(v_oid);
  IF position('order_status IN (''pending_review'', ''active'', ''paused'')' IN v_def) = 0 THEN
    IF position(v_old IN v_def) = 0 THEN
      RAISE EXCEPTION 'purchase_member_community_promotion: 바꿀 중복 확인 조건을 찾지 못함';
    END IF;
    EXECUTE replace(v_def, v_old, v_new);
  END IF;
END $$;
