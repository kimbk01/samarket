-- 3-B OPS-01 — 운영에 public.store_notices 테이블이 없다 (schema_migrations 에 20260507141000 기록, to_regclass NULL).
-- 원 정의(20260507141000_store_notices.sql)를 그대로 재사용해 새 버전으로 생성 + RLS·권한(D-0) + updated_at 트리거.
--
-- 권한 계약 (D-0 — 클라이언트 직접 쓰기 차단):
--   * 쓰기(INSERT/UPDATE/DELETE): service_role 만 — 오너 API `app/api/me/stores/[storeId]/notices*` (1-B 운영 게이트).
--   * anon/authenticated: 쓰기 권한 REVOKE + block_client_role_direct_writes 트리거(이중 차단, 42501).
--   * 공개 SELECT(authenticated): 게시 상태(is_active + 게시 기간 안) 이면서 승인·노출 매장의 공지만 (RLS 정책).
--     anon 은 운영에서 public.stores SELECT 권한이 없으므로(하드닝 유지) store_notices 도 권한을 주지 않는다 —
--     비로그인 공개 조회는 공개 API(`/api/stores/[slug]/notices`, service_role + isScheduleRowActive)만.
-- 함수 정의 변경 없음 (기존 set_updated_at / block_client_role_direct_writes 재사용, md5 불변).
-- DROP 문 없음 — 모든 문장은 IF NOT EXISTS / 존재 확인 DO 블록으로 재실행 안전.
-- 운영 데이터: 신규 빈 테이블 — 기존 데이터 변경 없음.
-- Rollback: (테이블이 비어 있을 때만) 운영자가 수동으로 DROP TABLE public.store_notices — 이 마이그레이션은 DROP 을 포함하지 않는다.
-- Isolated test: supabase/tests/isolated/stage3-3b/run.sh

CREATE TABLE IF NOT EXISTS public.store_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  images_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  placement text NOT NULL CHECK (placement IN ('store_top', 'menu_top', 'review_top', 'info_tab')),
  is_active boolean NOT NULL DEFAULT true,
  start_at timestamptz,
  end_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_notices_store_placement_sort_idx
  ON public.store_notices (store_id, placement, sort_order, id);

COMMENT ON TABLE public.store_notices IS
  'Dibay store notices by placement - writes via service_role owner API only (D-0); public read = active window of approved visible stores';

ALTER TABLE public.store_notices ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.store_notices FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.store_notices FROM anon;
GRANT SELECT ON public.store_notices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_notices TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_notices' AND policyname = 'store_notices_public_select_active'
  ) THEN
    CREATE POLICY store_notices_public_select_active ON public.store_notices
      FOR SELECT TO authenticated
      USING (
        is_active
        AND (start_at IS NULL OR start_at <= now())
        AND (end_at IS NULL OR end_at > now())
        AND EXISTS (
          SELECT 1 FROM public.stores s
          WHERE s.id = store_notices.store_id
            AND s.approval_status = 'approved'
            AND s.is_visible IS TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.store_notices'::regclass AND tgname = 'store_notices_updated_at' AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER store_notices_updated_at
      BEFORE UPDATE ON public.store_notices
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.store_notices'::regclass AND tgname = 'trg_store_notices_block_client_role_writes' AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_store_notices_block_client_role_writes
      BEFORE INSERT OR DELETE OR UPDATE ON public.store_notices
      FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();
  END IF;
END $$;
