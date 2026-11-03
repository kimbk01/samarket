-- F2 거래 글 「이 글 숨기기」 서버 저장 (Owner 2026-11-03 「계획된 부분 정확히 구현」 · 설계 trade-list-residual-risk-final-design-2026-11-03.md §4)
-- 회원별·글별 숨김 1행. 목록 응답에서 빼지 않고(공용 캐시·페이지 계약 불변) 카드만 가린다.
-- 커뮤니티 `community_post_hides` 와 같은 모양 · RLS 본인 행만.

CREATE TABLE IF NOT EXISTS public.trade_post_user_hides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trade_post_user_hides_post_user_key UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_post_user_hides_user_created
  ON public.trade_post_user_hides (user_id, created_at DESC);

ALTER TABLE public.trade_post_user_hides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trade_post_user_hides_select_own ON public.trade_post_user_hides;
DROP POLICY IF EXISTS trade_post_user_hides_insert_own ON public.trade_post_user_hides;
DROP POLICY IF EXISTS trade_post_user_hides_delete_own ON public.trade_post_user_hides;
CREATE POLICY trade_post_user_hides_select_own ON public.trade_post_user_hides
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY trade_post_user_hides_insert_own ON public.trade_post_user_hides
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY trade_post_user_hides_delete_own ON public.trade_post_user_hides
  FOR DELETE TO authenticated USING (user_id = auth.uid());
