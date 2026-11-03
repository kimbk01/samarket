-- 재감사 E-15 (Owner 「Apply E-15」 2026-11-03) — 일시정지 주문 중복 결제 막기
-- 결함: 거래·커뮤니티 결제 함수의 「진행 중 주문」 찾기가 일시정지(paused) 주문에도 `end_at >= now()` 를 걸었다
--   (P-4·R2 때 작업자가 넣음). 일시정지 중에는 기간이 흐르지 않고 재개 때 `end_at += 멈춘 시간`
--   (운영 `admin_trade_promotion_resume`·`admin_promotion_resume`)이라, 원래 종료일을 넘긴 일시정지 주문이
--   검사에서 빠져 새 주문이 만들어지고, 재개하면 같은 글에 광고 중 주문이 2개가 됐다.
-- 수정: 일시정지 주문은 종료일과 관계없이 「진행 중」으로 본다 → already_active_promotion.
-- 방법: 운영 함수 정의를 읽어 그 조건 한 줄만 바꾼다. 바꿀 줄이 정확히 1번 없으면 오류로 멈춘다(이미 바뀐 정의면 건너뜀).
-- 되돌리기: docs/audit/promotion-paused-dup-backup-2026-11-03.sql (적용 직전 정의 원문).

CREATE OR REPLACE FUNCTION public._ads_e15_replace_once(p_name text, p_old text, p_new text, p_marker text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = p_name;
  v_def := pg_get_functiondef(v_oid);
  IF position(p_marker IN v_def) > 0 THEN
    RETURN; -- 이미 적용됨
  END IF;
  IF (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1) <> 1 THEN
    RAISE EXCEPTION '%: 바꿀 줄이 정확히 1번 있어야 함', p_name;
  END IF;
  EXECUTE replace(v_def, p_old, p_new);
END $$;

-- 거래
SELECT public._ads_e15_replace_once(
  'purchase_member_content_promotion',
  $old$     AND order_status IN ('active', 'paused')
     AND end_at >= now()
   ORDER BY end_at DESC$old$,
  $new$     AND order_status IN ('active', 'paused')
     AND (order_status = 'paused' OR end_at >= now()) -- E-15: 일시정지는 기간이 멈춰 있어 종료일과 관계없이 진행 중
   ORDER BY end_at DESC$new$,
  'E-15: 일시정지는 기간이 멈춰'
);

-- 커뮤니티
SELECT public._ads_e15_replace_once(
  'purchase_member_community_promotion',
  $old$     AND (order_status = 'pending_review' OR end_at >= now())
   ORDER BY end_at DESC NULLS LAST$old$,
  $new$     AND (order_status IN ('pending_review', 'paused') OR end_at >= now()) -- E-15: 일시정지는 기간이 멈춰 있어 종료일과 관계없이 진행 중
   ORDER BY end_at DESC NULLS LAST$new$,
  'E-15: 일시정지는 기간이 멈춰'
);

DROP FUNCTION public._ads_e15_replace_once(text, text, text, text);
