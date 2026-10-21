-- 3-B OPS-07 — first_listed_at (최초 노출일) 은 승인 매장이 노출될 때만 기록한다.
-- 원인: stores_protect_first_listed_at 가 approval_status 와 무관하게 is_visible false→true 전환에서 스탬프 →
--       미승인 매장 노출 토글이 「신규 매장」 정렬용 최초 노출일을 조기 기록.
-- 수정: 스탬프 조건에 NEW.approval_status = 'approved' 추가 (최소 diff). 그 외 동작(기존 값 보존) 불변.
-- 트리거 정의(BEFORE UPDATE OF is_visible, first_listed_at)는 그대로 — 함수 본문만 교체.
--
-- prod base md5(prosrc) stores_protect_first_listed_at = 11677f396ce2e2225a9e8656b1a2a954 (read-only, 2026-10-21)
-- expected new md5(prosrc)                            = 99f2af32233503dba639038b2264d967 (isolated PG16 측정값)
-- 운영 데이터: 비승인 + first_listed_at 0건 (2026-10-21 읽기 전용) — 기존 행 변경 없음 (D-5).
-- Rollback: 아래 본문에서 `AND NEW.approval_status = 'approved'` 한 줄을 뺀 CREATE OR REPLACE 재실행 (= prod base).
-- Isolated test: supabase/tests/isolated/stage3-3b/run.sh

CREATE OR REPLACE FUNCTION public.stores_protect_first_listed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.first_listed_at IS NOT NULL THEN
    NEW.first_listed_at := OLD.first_listed_at;
    RETURN NEW;
  END IF;

  IF NEW.is_visible IS TRUE
     AND COALESCE(OLD.is_visible, false) IS DISTINCT FROM TRUE
     AND NEW.approval_status = 'approved'
     AND NEW.first_listed_at IS NULL THEN
    NEW.first_listed_at := now();
  END IF;

  RETURN NEW;
END;
$function$;
