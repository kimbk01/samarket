-- 필라이프·동네 글쓰기 API가 INSERT 시 title/content 를 사용함.
-- 일부 레거시 DB에는 community_posts 기본 스키마에 title 이 없어 PostgREST 가
-- "Could not find the 'title' column of 'community_posts' in the schema cache" 를 냄.

ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS content text;

-- 레거시 이름만 있는 경우(있다면) 한 번에 맞춤
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'community_posts'
      AND column_name = 'headline'
  ) THEN
    EXECUTE $q$
      UPDATE public.community_posts p
      SET title = COALESCE(NULLIF(trim(COALESCE(p.title, '')), ''), p.headline)
      WHERE COALESCE(trim(COALESCE(p.title, '')), '') = ''
        AND COALESCE(trim(COALESCE(p.headline, '')), '') <> ''
    $q$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'community_posts'
      AND column_name = 'body'
  ) THEN
    EXECUTE $q$
      UPDATE public.community_posts p
      SET content = COALESCE(NULLIF(trim(COALESCE(p.content, '')), ''), p.body)
      WHERE COALESCE(trim(COALESCE(p.content, '')), '') = ''
        AND COALESCE(trim(COALESCE(p.body, '')), '') <> ''
    $q$;
  END IF;
END $$;

COMMENT ON COLUMN public.community_posts.title IS '필라이프·커뮤니티 글 제목 (앱 필수)';
COMMENT ON COLUMN public.community_posts.content IS '필라이프·커뮤니티 글 본문 (앱 필수)';
