-- community_topics: 필라이프 정렬 탭(인기=조회순, 추천=랭킹+하위정렬)을 slug 추측이 아니라 운영자가 고르게 함.
-- is_feed_sort = true 이면 feed_sort_mode IN ('popular','recommended') (앱이 레거시 null이면 slug로 추론).

ALTER TABLE public.community_topics
  ADD COLUMN IF NOT EXISTS feed_sort_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_topics_feed_sort_mode_check'
  ) THEN
    ALTER TABLE public.community_topics
      ADD CONSTRAINT community_topics_feed_sort_mode_check
      CHECK (feed_sort_mode IS NULL OR feed_sort_mode IN ('popular', 'recommended'));
  END IF;
END $$;

UPDATE public.community_topics t
SET feed_sort_mode = CASE
  WHEN t.is_feed_sort IS NOT TRUE THEN NULL
  WHEN lower(trim(t.slug)) = 'popular' THEN 'popular'
  WHEN lower(trim(t.slug)) IN ('recommend', 'recommended') THEN 'recommended'
  WHEN t.is_feed_sort IS TRUE THEN 'popular'
  ELSE NULL
END
WHERE t.feed_sort_mode IS NULL;

COMMENT ON COLUMN public.community_topics.feed_sort_mode IS
  'is_feed_sort 시: popular=조회수 정렬, recommended=추천 랭킹(+최신/추천 하위). 일반 주제는 NULL.';

-- RPC: row_to_json에 feed_sort_mode 포함(함수 본문만 교체)
CREATE OR REPLACE FUNCTION public.philife_list_default_section_topics_for_feed()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH raw_slug AS (
    SELECT value_json ->> 'section_slug' AS s
    FROM public.admin_settings
    WHERE key = 'philife_neighborhood_section'
    LIMIT 1
  ),
  slug_try AS (
    SELECT COALESCE(
      NULLIF(lower(trim(coalesce((SELECT s FROM raw_slug), ''))), ''),
      'dongnae'
    )::text AS v
  ),
  picked_section AS (
    SELECT COALESCE(
      (
        SELECT cs.id
        FROM public.community_sections cs,
          slug_try st
        WHERE cs.slug = st.v
          AND cs.is_active = true
        LIMIT 1
      ),
      (
        SELECT cs2.id
        FROM public.community_sections cs2
        WHERE cs2.slug = 'dongnae'
          AND cs2.is_active = true
        LIMIT 1
      )
    ) AS section_id
  ),
  topic_json AS (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(row_to_json(q)::jsonb ORDER BY q.sort_order ASC, q.id ASC)
        FROM (
          SELECT
            t.id,
            t.section_id,
            t.name,
            t.slug,
            t.color,
            t.icon,
            t.sort_order,
            t.is_visible,
            t.is_feed_sort,
            t.allow_question,
            t.allow_meetup,
            t.feed_list_skin,
            t.feed_sort_mode
          FROM public.community_topics t
          WHERE t.section_id = (SELECT section_id FROM picked_section)
            AND t.is_active = true
            AND t.is_visible = true
        ) q
      ),
      '[]'::jsonb
    ) AS topics
  )
  SELECT jsonb_build_object(
    'resolved_slug',
    COALESCE(
      (
        SELECT lower(trim(cs.slug))
        FROM public.community_sections cs
        WHERE cs.id = (SELECT section_id FROM picked_section)
        LIMIT 1
      ),
      'dongnae'
    ),
    'section_slug_candidate',
    (SELECT v FROM slug_try),
    'topics',
    (SELECT topics FROM topic_json)
  );
$$;
