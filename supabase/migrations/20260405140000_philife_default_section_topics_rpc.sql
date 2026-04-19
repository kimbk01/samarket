-- 필라이프 기본 섹션 주제: admin_settings + community_sections + community_topics 를
-- 애플리케이션 왕복 1회(.rpc)로 처리하기 위한 SQL 함수.
-- TS `loadPhilifeDefaultSectionTopics` / `getPhilifeNeighborhoodSectionResolvedServer` 와 동일한
-- slug 후보·dongnae 폴백·토픽 필터(is_active, is_visible, sort_order) 를 유지한다.

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
            t.feed_list_skin
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

REVOKE ALL ON FUNCTION public.philife_list_default_section_topics_for_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.philife_list_default_section_topics_for_feed() TO service_role;
GRANT EXECUTE ON FUNCTION public.philife_list_default_section_topics_for_feed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.philife_list_default_section_topics_for_feed() TO anon;

COMMENT ON FUNCTION public.philife_list_default_section_topics_for_feed() IS
  'Philife neighborhood default section topics — admin_settings + sections + topics in one DB round-trip for API cold path.';
