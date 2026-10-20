-- DIBAY 내정보 v2.1 PR-2c · M3 — 최근 본 상품 실제 기록 (Owner 결정 #8)
--
-- 기존 「최근 본 상품」 화면은 메모리 목업 데이터를 보여 줬다. 회원별 실제 조회 기록을 저장한다.
-- - 테이블: 회원·게시글당 1행(PK), 다시 보면 viewed_at 만 갱신
-- - RLS: 본인 행 조회·삭제만. 기록(upsert)과 정리는 서버(service_role)만 —
--   lib/mypage/trade-recent-views.server.ts 가 기록 직후 회원별 100개 초과·90일 지난 행을 지운다
--   (운영 DB 에 pg_cron 이 없어 예약 정리 대신 기록 시 정리)
-- 운영 적용: 2026-10-20 (Owner 승인 M3)
-- 롤백: DROP TABLE public.trade_post_recent_views;

BEGIN;

CREATE TABLE IF NOT EXISTS public.trade_post_recent_views (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS trade_post_recent_views_user_viewed_idx
  ON public.trade_post_recent_views (user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS trade_post_recent_views_post_idx
  ON public.trade_post_recent_views (post_id);

ALTER TABLE public.trade_post_recent_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trade_post_recent_views FROM anon, authenticated;

DROP POLICY IF EXISTS trade_post_recent_views_select_own ON public.trade_post_recent_views;
CREATE POLICY trade_post_recent_views_select_own ON public.trade_post_recent_views
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS trade_post_recent_views_delete_own ON public.trade_post_recent_views;
CREATE POLICY trade_post_recent_views_delete_own ON public.trade_post_recent_views
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, DELETE ON public.trade_post_recent_views TO authenticated;
GRANT ALL ON public.trade_post_recent_views TO service_role;

COMMIT;
