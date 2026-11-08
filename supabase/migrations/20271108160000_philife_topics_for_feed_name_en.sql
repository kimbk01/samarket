-- 언어 SSOT S7-DB (2026-11-08): 커뮤니티 피드 주제 목록 RPC 가 name_en 을 고르지 않아
-- 영어 화면 주제 탭에 영어 이름이 전달되지 않던 결함 — t.name_en 한 열만 추가. 다른 동작 변경 없음.
-- 운영 적용: Owner 승인 후.
CREATE OR REPLACE FUNCTION public.philife_list_default_section_topics_for_feed()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            t.name_en,
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
$function$;
