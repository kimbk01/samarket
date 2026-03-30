-- 필라이프 물리 rename 최종 SQL
-- 중요:
-- 1) maintenance window 에서 실행 권장
-- 2) 적용 전 백업/스테이징 검증 권장
-- 3) 기존 app 코드가 community_* 를 계속 써도, 하위 호환 view 로 최대한 유지

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) 기존 philife 호환 view 제거
--    - 20260329120000_philife_compat_layer.sql 에서 만든 view 와 이름 충돌 방지
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.philife_posts;
DROP VIEW IF EXISTS public.philife_comments;
DROP VIEW IF EXISTS public.philife_reports;
DROP VIEW IF EXISTS public.philife_sections;
DROP VIEW IF EXISTS public.philife_topics;

-- ---------------------------------------------------------------------------
-- 1) 물리 테이블 rename
--    - 이미 rename 된 환경에서는 건너뜀
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'community_sections'
      AND c.relkind IN ('r', 'p')
  ) AND to_regclass('public.philife_sections') IS NULL THEN
    EXECUTE 'ALTER TABLE public.community_sections RENAME TO philife_sections';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'community_topics'
      AND c.relkind IN ('r', 'p')
  ) AND to_regclass('public.philife_topics') IS NULL THEN
    EXECUTE 'ALTER TABLE public.community_topics RENAME TO philife_topics';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'community_posts'
      AND c.relkind IN ('r', 'p')
  ) AND to_regclass('public.philife_posts') IS NULL THEN
    EXECUTE 'ALTER TABLE public.community_posts RENAME TO philife_posts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'community_comments'
      AND c.relkind IN ('r', 'p')
  ) AND to_regclass('public.philife_comments') IS NULL THEN
    EXECUTE 'ALTER TABLE public.community_comments RENAME TO philife_comments';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'community_reports'
      AND c.relkind IN ('r', 'p')
  ) AND to_regclass('public.philife_reports') IS NULL THEN
    EXECUTE 'ALTER TABLE public.community_reports RENAME TO philife_reports';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'community_post_images'
      AND c.relkind IN ('r', 'p')
  ) AND to_regclass('public.philife_post_images') IS NULL THEN
    EXECUTE 'ALTER TABLE public.community_post_images RENAME TO philife_post_images';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'community_post_likes'
      AND c.relkind IN ('r', 'p')
  ) AND to_regclass('public.philife_post_likes') IS NULL THEN
    EXECUTE 'ALTER TABLE public.community_post_likes RENAME TO philife_post_likes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'community_comment_likes'
      AND c.relkind IN ('r', 'p')
  ) AND to_regclass('public.philife_comment_likes') IS NULL THEN
    EXECUTE 'ALTER TABLE public.community_comment_likes RENAME TO philife_comment_likes';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) 레거시 이름 하위 호환 view
--    - 단순 SELECT * view 이므로 기존 read / 대부분의 DML 호환 기대
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.philife_sections') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.community_sections AS SELECT * FROM public.philife_sections';
  END IF;

  IF to_regclass('public.philife_topics') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.community_topics AS SELECT * FROM public.philife_topics';
  END IF;

  IF to_regclass('public.philife_posts') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.community_posts AS SELECT * FROM public.philife_posts';
  END IF;

  IF to_regclass('public.philife_comments') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.community_comments AS SELECT * FROM public.philife_comments';
  END IF;

  IF to_regclass('public.philife_reports') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.community_reports AS SELECT * FROM public.philife_reports';
  END IF;

  IF to_regclass('public.philife_post_images') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.community_post_images AS SELECT * FROM public.philife_post_images';
  END IF;

  IF to_regclass('public.philife_post_likes') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.community_post_likes AS SELECT * FROM public.philife_post_likes';
  END IF;

  IF to_regclass('public.philife_comment_likes') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.community_comment_likes AS SELECT * FROM public.philife_comment_likes';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) 함수 호환 레이어
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_philife_post_view_count(post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE public.philife_posts
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = post_id
    AND COALESCE(status, 'active') = 'active'
    AND COALESCE(is_hidden, false) = false
    AND COALESCE(is_deleted, false) = false
  RETURNING view_count INTO new_count;

  IF new_count IS NULL THEN
    RETURN -1;
  END IF;
  RETURN new_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_community_post_view_count(post_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.increment_philife_post_view_count(post_id);
$$;

REVOKE ALL ON FUNCTION public.increment_philife_post_view_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_community_post_view_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_philife_post_view_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_community_post_view_count(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) rename 상태 확인용 view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.philife_physical_rename_status AS
SELECT *
FROM (
  VALUES
    ('philife_sections', to_regclass('public.philife_sections') IS NOT NULL, to_regclass('public.community_sections') IS NOT NULL),
    ('philife_topics', to_regclass('public.philife_topics') IS NOT NULL, to_regclass('public.community_topics') IS NOT NULL),
    ('philife_posts', to_regclass('public.philife_posts') IS NOT NULL, to_regclass('public.community_posts') IS NOT NULL),
    ('philife_comments', to_regclass('public.philife_comments') IS NOT NULL, to_regclass('public.community_comments') IS NOT NULL),
    ('philife_reports', to_regclass('public.philife_reports') IS NOT NULL, to_regclass('public.community_reports') IS NOT NULL),
    ('philife_post_images', to_regclass('public.philife_post_images') IS NOT NULL, to_regclass('public.community_post_images') IS NOT NULL),
    ('philife_post_likes', to_regclass('public.philife_post_likes') IS NOT NULL, to_regclass('public.community_post_likes') IS NOT NULL),
    ('philife_comment_likes', to_regclass('public.philife_comment_likes') IS NOT NULL, to_regclass('public.community_comment_likes') IS NOT NULL)
) AS t(object_name, philife_exists, community_alias_exists);

COMMIT;

-- 확인용
-- SELECT * FROM public.philife_physical_rename_status ORDER BY object_name;
-- SELECT * FROM public.community_posts LIMIT 1;
-- SELECT * FROM public.philife_posts LIMIT 1;
