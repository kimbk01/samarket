-- 필라이프 slug 전환 수동 스크립트
-- 전제:
-- 1) 20260329120000_philife_compat_layer.sql 이 이미 적용되어 있어야 함
-- 2) 앱 코드의 기본 섹션이 philife 로 전환된 뒤 실행 권장
-- 3) 이 스크립트는 물리 테이블 rename 을 하지 않음

BEGIN;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS section_id uuid;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS section_slug text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS topic_id uuid;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS topic_slug text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS category text;

DO $$
DECLARE
  dongnae_sec_id uuid;
  philife_sec_id uuid;
  fallback_sec_id uuid;
  fallback_sec_slug text;
  updated_posts integer := 0;
BEGIN
  SELECT id INTO dongnae_sec_id
  FROM public.community_sections
  WHERE slug = 'dongnae'
  LIMIT 1;

  SELECT id INTO philife_sec_id
  FROM public.community_sections
  WHERE slug = 'philife'
  LIMIT 1;

  IF philife_sec_id IS NULL THEN
    RAISE EXCEPTION 'community_sections.slug=philife 가 없습니다. 먼저 20260329120000_philife_compat_layer.sql 을 적용하세요.';
  END IF;

  fallback_sec_id := COALESCE(philife_sec_id, dongnae_sec_id);
  fallback_sec_slug := CASE
    WHEN philife_sec_id IS NOT NULL THEN 'philife'
    ELSE 'dongnae'
  END;

  -- 구 DB 호환: section_id / section_slug 기초값 보강
  UPDATE public.community_posts p
  SET
    section_id = COALESCE(
      p.section_id,
      (
        SELECT sec.id
        FROM public.community_sections sec
        WHERE sec.slug = p.section_slug
        LIMIT 1
      ),
      fallback_sec_id
    ),
    section_slug = COALESCE(
      p.section_slug,
      (
        SELECT sec.slug
        FROM public.community_sections sec
        WHERE sec.id = p.section_id
        LIMIT 1
      ),
      fallback_sec_slug
    ),
    topic_slug = COALESCE(
      p.topic_slug,
      (
        SELECT topi.slug
        FROM public.community_topics topi
        WHERE topi.id = p.topic_id
        LIMIT 1
      ),
      NULLIF(p.category, '')
    )
  WHERE p.section_id IS NULL
     OR p.section_slug IS NULL
     OR p.topic_slug IS NULL;

  -- topic_id 가 비어 있으면 현재 topic_slug 또는 category 기준으로 보강
  UPDATE public.community_posts p
  SET topic_id = COALESCE(
    p.topic_id,
    (
      SELECT pt.id
      FROM public.community_topics pt
      WHERE pt.section_id = COALESCE(p.section_id, fallback_sec_id)
        AND pt.slug = COALESCE(NULLIF(p.topic_slug, ''), NULLIF(p.category, ''))
      LIMIT 1
    )
  )
  WHERE p.topic_id IS NULL;

  -- philife 섹션에 주제가 없으면 dongnae 기준으로 한 번 더 보강
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

  -- 기존 dongnae 글을 philife 섹션으로 백필
  -- topic_slug 컬럼이 없는 DB 도 있으므로, 기존 topic_id -> community_topics.slug 를 통해
  -- philife 섹션의 동일 slug topic_id 로 치환
  UPDATE public.community_posts p
  SET
    section_id = philife_sec_id,
    section_slug = 'philife',
    topic_slug = COALESCE((
      SELECT pt.slug
      FROM public.community_topics old_t
      JOIN public.community_topics pt
        ON pt.section_id = philife_sec_id
       AND pt.slug = old_t.slug
      WHERE old_t.id = p.topic_id
      LIMIT 1
    ), p.topic_slug),
    topic_id = COALESCE((
      SELECT pt.id
      FROM public.community_topics old_t
      JOIN public.community_topics pt
        ON pt.section_id = philife_sec_id
       AND pt.slug = old_t.slug
      WHERE old_t.id = p.topic_id
      LIMIT 1
    ), p.topic_id)
  WHERE
    p.section_slug = 'dongnae'
    OR (dongnae_sec_id IS NOT NULL AND p.section_id = dongnae_sec_id);

  GET DIAGNOSTICS updated_posts = ROW_COUNT;
  RAISE NOTICE 'philife slug backfill: updated posts = %', updated_posts;
END $$;

COMMIT;

-- 확인용
-- SELECT section_slug, count(*) FROM public.community_posts GROUP BY 1 ORDER BY 1;
-- SELECT slug, name FROM public.community_sections WHERE slug IN ('dongnae', 'philife');
