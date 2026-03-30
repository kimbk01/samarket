-- 게시글 찜 — POST/GET /api/favorites/* (`favorites` 테이블)
-- Supabase SQL Editor에서 데이터 확인 예:
--   select f.user_id, f.post_id, f.created_at, p.title
--   from public.favorites f
--   left join public.posts p on p.id = f.post_id
--   order by f.created_at desc
--   limit 30;

CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_post_id ON public.favorites (post_id);
