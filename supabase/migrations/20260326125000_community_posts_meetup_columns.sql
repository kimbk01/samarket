-- community_posts: 질문·모임 메타 (필라이프 글쓰기·피드·시드가 사용)
-- PostgREST schema cache 오류 방지: is_meetup / is_question / meetup_* 가 없으면 INSERT·SELECT 실패

ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_question boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_meetup boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS meetup_date timestamptz;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS meetup_place text;
