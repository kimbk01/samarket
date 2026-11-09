-- 배달 오픈 4단계 (Owner 승인 설계 2026-11-10): 매장 사장님 전용 운영 공지.
-- app_notices 에 「보는 사람(audience)」·「고정(is_pinned)」 열을 더한다.
--   all                   = 전체 회원 (기존 고객센터 공지 — 기존 행 전부)
--   store_owners          = 매장 사장님 전체 (신청·심사·보완·승인·정지 — stores 행만 있으면)
--   store_owners_approved = 승인 매장 보유 사장님만
-- 회원 고객센터 조회 경로는 audience = 'all' 만 읽는다(앱 코드). 사장님 화면은 /api/me/stores/announcements.
-- is_pinned 는 사장님 운영 공지 목록 「고정 먼저」 정렬에만 쓴다.
-- 운영 적용은 Owner 승인 후 (파일만 커밋). 앱 코드 배포 전에 먼저 적용해야 한다(열이 없으면 조회 실패).
BEGIN;

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_notices_audience_check'
      AND conrelid = 'public.app_notices'::regclass
  ) THEN
    ALTER TABLE public.app_notices
      ADD CONSTRAINT app_notices_audience_check
      CHECK (audience IN ('all', 'store_owners', 'store_owners_approved'));
  END IF;
END $$;

-- 사장님 운영 공지 목록 (audience <> 'all' 행만 · 고정 먼저 · 게시일 최신순)
CREATE INDEX IF NOT EXISTS idx_app_notices_owner_audience_list
  ON public.app_notices (audience, is_pinned DESC, published_at DESC)
  WHERE deleted_at IS NULL AND archived_at IS NULL AND audience <> 'all';

COMMENT ON COLUMN public.app_notices.audience IS
  '보는 사람: all(전체 회원·고객센터) | store_owners(매장 사장님 전체) | store_owners_approved(승인 매장 사장님만). 회원 조회는 all 만.';

COMMENT ON COLUMN public.app_notices.is_pinned IS
  '사장님 운영 공지 목록 상단 고정 (고정 먼저 · 게시일 최신순).';

COMMIT;
