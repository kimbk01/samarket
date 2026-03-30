-- 레거시 DB: community_posts / community_comments 에 is_hidden 이 없으면
-- 인덱스·트리거·RLS·조회수 RPC 가 실패합니다. 이 파일을 다른 커뮤니티 마이그레이션보다 먼저 적용하세요.

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
