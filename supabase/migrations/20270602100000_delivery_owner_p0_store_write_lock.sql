-- 배달 오너 감사 P0-1 · P0-2 (Owner 승인 D-0, 2026-10-20) — docs/audit/delivery-owner-2026-10-20/D-defects-register.md
-- 목적: 오너가 브라우저 세션(anon key + 본인 JWT)으로 PostgREST 를 직접 호출해
--       stores(승인·정지·노출·추천·평점·좌표·소유자)·store_products(관리자 검수·차단·판매 상태)를
--       서버 API 검증 없이 바꾸던 경로를 막는다.
-- 근거(운영 조회): stores_update_owner_or_admin(WITH CHECK 없음)·stores_insert_owner·store_products_owner_all(FOR ALL)
--       + anon/authenticated 에 INSERT·UPDATE·DELETE·TRUNCATE GRANT. 앱 코드는 두 테이블 쓰기를 전부
--       service_role 서버 API(`tryGetSupabaseForStores`)로 수행하고, 브라우저·쿠키 세션 클라이언트의 쓰기는 0건.
-- 유지: SELECT 권한·RLS SELECT 정책(공개 목록·오너 미공개 상품 조회·Realtime)은 그대로.
--       SECURITY DEFINER 함수(주문 RPC 재고 차감·복원, 평점 집계, 인기 투영 등)는 소유자 권한으로 계속 동작.
-- 이중화: 이후 마이그레이션이 GRANT ALL 로 권한을 되돌려도 anon/authenticated 세션의 직접 쓰기는 트리거가 거부.
-- 롤백:
--   DROP TRIGGER IF EXISTS trg_stores_block_client_role_writes ON public.stores;
--   DROP TRIGGER IF EXISTS trg_store_products_block_client_role_writes ON public.store_products;
--   DROP FUNCTION IF EXISTS public.block_client_role_direct_writes();
--   GRANT INSERT, UPDATE, DELETE ON public.stores, public.store_products TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.stores FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.store_products FROM anon, authenticated;

-- current_user 는 SECURITY DEFINER 함수 안에서는 함수 소유자(postgres)라 서버 RPC 는 통과한다.
-- (함수 본문에는 비 ASCII 주석을 넣지 않는다 — 운영 적용 도구가 본문 내 한국어 주석에서 멈춤)
CREATE OR REPLACE FUNCTION public.block_client_role_direct_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'client_role_direct_write_forbidden:%', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.block_client_role_direct_writes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stores_block_client_role_writes ON public.stores;
CREATE TRIGGER trg_stores_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

DROP TRIGGER IF EXISTS trg_store_products_block_client_role_writes ON public.store_products;
CREATE TRIGGER trg_store_products_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();
