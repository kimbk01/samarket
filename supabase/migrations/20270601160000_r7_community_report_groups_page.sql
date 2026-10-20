-- R7 · 커뮤니티 신고 처리함 — 신고 대상 묶음 페이지 (조회 상한 5,000건 제거)
-- 목적: `listCommunityReportGroupsForAdmin` 이 최근 5,000건만 메모리에서 묶던 경로를 DB 한 번의 묶음·정렬·페이지로 바꾼다.
--       같은 대상(target_type + target_id) = 1 묶음. 묶음 수 total · 탭별 묶음 수 tab_counts 가 전체 기준으로 정확하다.
-- 대상 화면: /admin/community/reports · 대시보드 지표 community.report_targets_pending · 처리 대기 「커뮤니티 신고」
--            (모두 lib/community-feed/admin-community-reports.ts `listCommunityReportGroupsForAdmin` 경유)
-- 탭 정의(상태 묶음)는 TS(`TAB_STATUSES`)가 p_tab_groups 로 넘긴다 — 정의 하나.
-- 검색(p_q_pattern, 이미 ILIKE 패턴 '%…%'): 신고자 닉네임 · 회원 신고 대상 닉네임 · 글 제목 · 댓글 내용 ·
--   닉네임 일치 회원이 쓴 글/댓글 — 후보 상한 없음.
-- 정렬: 묶음의 최근 신고 시각 DESC, target_type, target_id (결정적). 묶음 안 대표 신고 = 처리 대기(open·reviewing) 중
--   가장 최근(created_at DESC, id DESC), 없으면 가장 최근 신고.
-- 읽기 전용. 권한: service_role 만 EXECUTE (앱 서버가 requireCommunityAdmin 통과 후 호출).
-- 롤백: DROP FUNCTION IF EXISTS public.admin_community_report_groups_page(jsonb, text, text, text, text, text, uuid, uuid, timestamptz, timestamptz, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_community_report_groups_page(
  p_tab_groups jsonb,
  p_tab text,
  p_target_type text,
  p_q_pattern text,
  p_target_id text,
  p_topic_slug text,
  p_reporter_id uuid,
  p_author_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT nullif(btrim(coalesce(p_target_type, '')), '') AS target_type,
           nullif(coalesce(p_q_pattern, ''), '') AS q,
           nullif(btrim(coalesce(p_target_id, '')), '') AS target_id,
           nullif(lower(btrim(coalesce(p_topic_slug, ''))), '') AS topic,
           CASE
             WHEN p_tab IS NULL OR p_tab_groups IS NULL OR NOT (p_tab_groups ? p_tab) THEN NULL
             ELSE ARRAY(SELECT jsonb_array_elements_text(p_tab_groups -> p_tab))
           END AS tab_statuses,
           LEAST(100, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  matched_users AS (
    SELECT p.id
      FROM public.profiles p
     CROSS JOIN params pr
     WHERE pr.q IS NOT NULL AND p.nickname ILIKE pr.q
  ),
  base AS (
    SELECT r.id, r.target_type, coalesce(r.target_id, '') AS target_key, r.user_id, r.reason, r.status, r.created_at
      FROM public.community_reports r
     CROSS JOIN params pr
     WHERE (CASE WHEN pr.target_type IS NULL THEN r.target_type IN ('post', 'comment', 'user')
                 ELSE r.target_type = pr.target_type END)
       AND (pr.target_id IS NULL OR r.target_id = pr.target_id)
       AND (p_reporter_id IS NULL OR r.user_id = p_reporter_id)
       AND (p_from IS NULL OR r.created_at >= p_from)
       AND (p_to IS NULL OR r.created_at < p_to)
       -- 카테고리: 그 카테고리 글이 대상인 신고
       AND (pr.topic IS NULL
            OR r.target_id IN (SELECT cp.id::text FROM public.community_posts cp WHERE cp.topic_slug = pr.topic))
       -- 대상 작성자: 글 작성자 · 댓글 작성자 · 회원 신고 대상 본인
       AND (p_author_id IS NULL
            OR r.target_id = p_author_id::text
            OR r.target_id IN (SELECT cp.id::text FROM public.community_posts cp WHERE cp.user_id = p_author_id)
            OR r.target_id IN (SELECT cc.id::text FROM public.community_comments cc WHERE cc.user_id = p_author_id))
       AND (pr.q IS NULL
            OR r.user_id IN (SELECT mu.id FROM matched_users mu)
            OR r.target_id IN (SELECT mu.id::text FROM matched_users mu)
            OR r.target_id IN (
                 SELECT cp.id::text FROM public.community_posts cp
                  WHERE cp.title ILIKE pr.q OR cp.user_id IN (SELECT mu.id FROM matched_users mu))
            OR r.target_id IN (
                 SELECT cc.id::text FROM public.community_comments cc
                  WHERE cc.content ILIKE pr.q OR cc.user_id IN (SELECT mu.id FROM matched_users mu)))
  ),
  tabbed AS (
    SELECT b.* FROM base b
     CROSS JOIN params pr
     WHERE pr.tab_statuses IS NULL OR b.status = ANY (pr.tab_statuses)
  ),
  grouped AS (
    SELECT t.target_type,
           t.target_key,
           count(*) AS report_count,
           count(DISTINCT t.user_id) AS reporter_count,
           count(*) FILTER (WHERE t.status IN ('open', 'reviewing')) AS open_count,
           max(t.created_at) AS latest_at,
           min(t.created_at) AS first_at,
           (array_agg(t.id ORDER BY t.created_at DESC NULLS LAST, t.id DESC))[1] AS latest_id,
           (array_agg(t.reason ORDER BY t.created_at DESC NULLS LAST, t.id DESC))[1] AS latest_reason,
           (array_agg(t.status ORDER BY t.created_at DESC NULLS LAST, t.id DESC))[1] AS latest_status,
           (array_agg(t.id ORDER BY t.created_at DESC NULLS LAST, t.id DESC)
              FILTER (WHERE t.status IN ('open', 'reviewing')))[1] AS pending_id,
           bool_or(t.status = 'reviewing') AS has_reviewing,
           bool_or(t.status = 'open') AS has_open
      FROM tabbed t
     GROUP BY t.target_type, t.target_key
  ),
  page AS (
    SELECT g.*
      FROM grouped g
     ORDER BY g.latest_at DESC NULLS LAST, g.target_type, g.target_key
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM grouped),
    'tab_counts', (
      SELECT coalesce(jsonb_object_agg(g.key, (
               SELECT count(DISTINCT b.target_type || ':' || b.target_key) FROM base b
                WHERE b.status IN (SELECT jsonb_array_elements_text(g.value)))), '{}'::jsonb)
             || jsonb_build_object('all', (SELECT count(DISTINCT b.target_type || ':' || b.target_key) FROM base b))
        FROM jsonb_each(coalesce(p_tab_groups, '{}'::jsonb)) g
    ),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'target_type', p.target_type,
               'target_id', p.target_key,
               'primary_report_id', coalesce(p.pending_id, p.latest_id),
               'group_status', CASE WHEN p.has_reviewing THEN 'reviewing' WHEN p.has_open THEN 'open' ELSE p.latest_status END,
               'report_count', p.report_count,
               'reporter_count', p.reporter_count,
               'open_count', p.open_count,
               'latest_reason', p.latest_reason,
               'latest_at', p.latest_at,
               'first_at', p.first_at
             ) ORDER BY p.latest_at DESC NULLS LAST, p.target_type, p.target_key)
        FROM page p
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_community_report_groups_page(jsonb, text, text, text, text, text, uuid, uuid, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_community_report_groups_page(jsonb, text, text, text, text, text, uuid, uuid, timestamptz, timestamptz, integer, integer) TO service_role;
