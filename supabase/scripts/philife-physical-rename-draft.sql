-- 필라이프 물리 rename 초안
-- 중요:
-- 1) 이 스크립트는 "최종 단계" 초안입니다.
-- 2) 앱/SQL/함수/RLS/관리자 쿼리가 philife_* 기준으로 충분히 전환된 뒤 사용하세요.
-- 3) 즉시 적용 권장 아님. 사전 백업 후 스테이징에서 먼저 검증하세요.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) 물리 테이블 rename
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.community_sections RENAME TO philife_sections;
ALTER TABLE IF EXISTS public.community_topics RENAME TO philife_topics;
ALTER TABLE IF EXISTS public.community_posts RENAME TO philife_posts;
ALTER TABLE IF EXISTS public.community_comments RENAME TO philife_comments;
ALTER TABLE IF EXISTS public.community_reports RENAME TO philife_reports;
ALTER TABLE IF EXISTS public.community_post_images RENAME TO philife_post_images;
ALTER TABLE IF EXISTS public.community_post_likes RENAME TO philife_post_likes;
ALTER TABLE IF EXISTS public.community_comment_likes RENAME TO philife_comment_likes;

-- ---------------------------------------------------------------------------
-- 2) 구 이름 호환 view
--    - 레거시 쿼리 fallback 용
--    - 실제 쓰기 경로/RLS 는 충분한 검증이 필요합니다.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.community_sections AS
SELECT * FROM public.philife_sections;

CREATE OR REPLACE VIEW public.community_topics AS
SELECT * FROM public.philife_topics;

CREATE OR REPLACE VIEW public.community_posts AS
SELECT * FROM public.philife_posts;

CREATE OR REPLACE VIEW public.community_comments AS
SELECT * FROM public.philife_comments;

CREATE OR REPLACE VIEW public.community_reports AS
SELECT * FROM public.philife_reports;

CREATE OR REPLACE VIEW public.community_post_images AS
SELECT * FROM public.philife_post_images;

CREATE OR REPLACE VIEW public.community_post_likes AS
SELECT * FROM public.philife_post_likes;

CREATE OR REPLACE VIEW public.community_comment_likes AS
SELECT * FROM public.philife_comment_likes;

-- ---------------------------------------------------------------------------
-- 3) 신규 함수명 추가
--    - 기존 함수는 레거시 호환용으로 남겨도 됩니다.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_philife_post_view_count(post_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.increment_community_post_view_count(post_id);
$$;

-- ---------------------------------------------------------------------------
-- 4) 참고
-- ---------------------------------------------------------------------------
-- 이 초안만으로 끝나지 않습니다. 아래를 별도 점검해야 합니다.
-- - RLS 정책 이름 / 적용 대상 테이블
-- - trigger/function 본문 내부의 community_* 직접 참조
-- - 관리자 API / 서비스 롤 쿼리
-- - sample SQL / seed / 문서
-- - Supabase 타입 생성 결과

COMMIT;
