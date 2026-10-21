-- 3단계 3-A LOC-005 (문서 G-2 §3-A, 2026-10-21) — 「배달 ON => 매장 좌표 있음」 불변식을 DB 에서도 방어
-- 근거(운영 ckdosyydvgzqwpbwuhon 읽기 전용 조회 2026-10-21 PHT):
--   * public.stores 에 해당 CHECK·트리거 없음. 트리거 4개(stores_ensure_sales_perm, stores_updated_at,
--     trg_stores_block_client_role_writes, trg_stores_first_listed_at) — 이 파일은 그 중 어느 것도 바꾸지 않는다.
--   * 운영 stores 17행 중 delivery_available=true AND (lat IS NULL OR lng IS NULL) = 9행 (D-5: 정리·수정하지 않음).
--   * 함수 stores_guard_delivery_requires_geo / 트리거 trg_stores_guard_delivery_requires_geo 운영에 없음 (신규, base md5 없음).
-- 설계: CHECK ... NOT VALID 는 쓰지 않는다 (PostgreSQL 은 NOT VALID 여도 기존 행 UPDATE 때 검사 -> 9곳 오너가 전화번호만
--   바꿔도 저장 실패). 대신 BEFORE INSERT OR UPDATE OF delivery_available, lat, lng 트리거:
--   NEW.delivery_available AND (NEW.lat IS NULL OR NEW.lng IS NULL) 이면서 (INSERT 이거나 delivery_available/lat/lng 중
--   하나가 실제로 바뀐 경우)만 예외. 무관 컬럼 UPDATE 와 같은 값 재전송은 통과(9행 포함).
--   예외 메시지 = 기존 API 오류 코드 'store_delivery_requires_canonical_geo' (오너·관리자 라우트가 같은 400 으로 매핑),
--   HINT = 'delivery_store_coords_required' (주문 라우트 코드와 같은 의미). service_role 쓰기도 같은 규칙.
-- 함수 본문 ASCII 전용. DROP 없음(IF NOT EXISTS 패턴). 데이터 변경 0.
-- 기대 md5(prosrc) stores_guard_delivery_requires_geo = 격리 DB run.sh 출력 참조 (보고서 기재).
-- 롤백: ALTER TABLE public.stores DISABLE TRIGGER trg_stores_guard_delivery_requires_geo;
--   (완전 제거가 필요하면 Owner 승인 후 수동으로 DROP TRIGGER trg_stores_guard_delivery_requires_geo ON public.stores;
--    DROP FUNCTION public.stores_guard_delivery_requires_geo();)

CREATE OR REPLACE FUNCTION public.stores_guard_delivery_requires_geo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.delivery_available IS TRUE AND (NEW.lat IS NULL OR NEW.lng IS NULL) THEN
    IF TG_OP = 'INSERT'
       OR NEW.delivery_available IS DISTINCT FROM OLD.delivery_available
       OR NEW.lat IS DISTINCT FROM OLD.lat
       OR NEW.lng IS DISTINCT FROM OLD.lng THEN
      RAISE EXCEPTION 'store_delivery_requires_canonical_geo'
        USING ERRCODE = 'P0001', HINT = 'delivery_store_coords_required';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.stores_guard_delivery_requires_geo() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.stores'::regclass
      AND tgname = 'trg_stores_guard_delivery_requires_geo'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_stores_guard_delivery_requires_geo
      BEFORE INSERT OR UPDATE OF delivery_available, lat, lng ON public.stores
      FOR EACH ROW EXECUTE FUNCTION public.stores_guard_delivery_requires_geo();
  END IF;
END $$;
