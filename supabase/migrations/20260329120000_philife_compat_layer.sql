-- 필라이프 호환 계층
-- 목적:
-- 1) 기존 community_* / dongnae 운영 코드를 깨지 않음
-- 2) DB 에 philife 별칭 레이어를 추가해 점진 전환 준비
-- 3) 지금은 물리 rename / section_slug 백필을 하지 않음

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) 조회용 별칭 view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.philife_posts AS
SELECT * FROM public.community_posts;

CREATE OR REPLACE VIEW public.philife_comments AS
SELECT * FROM public.community_comments;

CREATE OR REPLACE VIEW public.philife_reports AS
SELECT * FROM public.community_reports;

CREATE OR REPLACE VIEW public.philife_sections AS
SELECT * FROM public.community_sections;

CREATE OR REPLACE VIEW public.philife_topics AS
SELECT * FROM public.community_topics;

-- ---------------------------------------------------------------------------
-- 2) 필라이프용 wrapper 함수
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_philife_post_view_count(post_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.increment_community_post_view_count(post_id);
$$;

REVOKE ALL ON FUNCTION public.increment_philife_post_view_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_philife_post_view_count(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) 기존 dongnae 섹션의 표시 이름을 필라이프로 맞춤
--    - slug 는 아직 그대로 유지해야 현재 앱/샘플이 깨지지 않음
-- ---------------------------------------------------------------------------
UPDATE public.community_sections
SET name = '필라이프'
WHERE slug = 'dongnae'
  AND COALESCE(name, '') <> '필라이프';

-- ---------------------------------------------------------------------------
-- 4) philife slug 별칭 섹션 추가
--    - 현재 코드는 dongnae 를 계속 사용하므로 새 slug 는 병행 운영용
-- ---------------------------------------------------------------------------
INSERT INTO public.community_sections (
  id,
  name,
  slug,
  sort_order,
  is_active
)
SELECT
  gen_random_uuid(),
  '필라이프',
  'philife',
  COALESCE(src.sort_order, 0),
  COALESCE(src.is_active, true)
FROM public.community_sections src
WHERE src.slug = 'dongnae'
  AND NOT EXISTS (
    SELECT 1
    FROM public.community_sections dst
    WHERE dst.slug = 'philife'
  )
LIMIT 1;

-- dongnae 가 없고 philife 도 없으면 최소 행 생성
INSERT INTO public.community_sections (
  id,
  name,
  slug,
  sort_order,
  is_active
)
SELECT
  gen_random_uuid(),
  '필라이프',
  'philife',
  0,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.community_sections WHERE slug IN ('dongnae', 'philife')
);

-- ---------------------------------------------------------------------------
-- 5) philife 섹션에 주제 mirror 생성
--    - 기존 dongnae topics 를 복제하되, 이미 있으면 건너뜀
-- ---------------------------------------------------------------------------
INSERT INTO public.community_topics (
  section_id,
  name,
  slug,
  icon,
  color,
  sort_order,
  is_active,
  is_visible,
  is_feed_sort,
  allow_question,
  allow_meetup,
  feed_list_skin
)
SELECT
  philife_sec.id,
  src.name,
  src.slug,
  src.icon,
  src.color,
  COALESCE(src.sort_order, 0),
  COALESCE(src.is_active, true),
  COALESCE(src.is_visible, true),
  COALESCE(src.is_feed_sort, false),
  COALESCE(src.allow_question, false),
  COALESCE(src.allow_meetup, false),
  src.feed_list_skin
FROM public.community_topics src
JOIN public.community_sections dongnae_sec
  ON dongnae_sec.id = src.section_id
 AND dongnae_sec.slug = 'dongnae'
JOIN public.community_sections philife_sec
  ON philife_sec.slug = 'philife'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.community_topics dup
  WHERE dup.section_id = philife_sec.id
    AND dup.slug = src.slug
);

-- ---------------------------------------------------------------------------
-- 6) 현재 상태 확인용 view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.philife_section_alias_status AS
SELECT
  s.id,
  s.name,
  s.slug,
  s.sort_order,
  s.is_active,
  (
    SELECT count(*)::int
    FROM public.community_topics t
    WHERE t.section_id = s.id
  ) AS topic_count
FROM public.community_sections s
WHERE s.slug IN ('dongnae', 'philife');

COMMIT;

-- ---------------------------------------------------------------------------
-- 참고:
-- - 아직 community_posts.section_slug = 'dongnae' -> 'philife' 백필을 하지 않습니다.
-- - 그 작업은 앱 코드의 DEFAULT_COMMUNITY_SECTION 전환 후 별도 migration 으로 진행하세요.
-- ---------------------------------------------------------------------------
