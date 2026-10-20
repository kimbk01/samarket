-- R7 · 모임 신고 검색 (모임 이름 100건 · 신고자 닉네임 100명 후보 상한 제거)
-- 목적: /admin/philife/meeting-reports 검색이 모임 id 100건·신고자 id 100명을 먼저 모아 or(in(...)) 으로 거르던 경로를
--       DB 한 번의 필터·정렬·페이지·탭 건수로 바꾼다. (검색어가 없으면 loadAdminMeetingReports 의 기존 경로 그대로.)
-- 대상 화면: /admin/philife/meeting-reports
-- 탭 정의(상태 묶음)는 TS(`MEETING_REPORT_TAB_STATUSES`)가 p_tab_groups 로 넘긴다 — 정의 하나. 없는 탭 = 상태 필터 없음.
-- 검색: 모임 이름 ILIKE p_q_pattern OR 신고자 닉네임 ILIKE p_q_pattern (TS 가 만든 '%…%').
-- 반환: { total, tab_counts{<탭>: n, all: n}, ids } — 정렬: created_at DESC, id DESC (결정적).
-- 읽기 전용. 권한: service_role 만 EXECUTE.
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_meeting_reports_page(jsonb, text, text, timestamptz, timestamptz, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_meeting_reports_page(
  p_tab_groups jsonb,
  p_tab text,
  p_type text,
  p_from timestamptz,
  p_to timestamptz,
  p_q_pattern text,
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
    SELECT nullif(btrim(coalesce(p_type, '')), '') AS type,
           nullif(coalesce(p_q_pattern, ''), '') AS q,
           CASE
             WHEN p_tab IS NULL OR p_tab_groups IS NULL OR NOT (p_tab_groups ? p_tab) THEN NULL
             ELSE ARRAY(SELECT jsonb_array_elements_text(p_tab_groups -> p_tab))
           END AS tab_statuses,
           LEAST(100, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  base AS (
    SELECT r.id, r.status, r.created_at
      FROM public.meeting_reports r
     CROSS JOIN params pr
     WHERE (pr.type IS NULL OR r.target_type = pr.type)
       AND (p_from IS NULL OR r.created_at >= p_from)
       AND (p_to IS NULL OR r.created_at < p_to)
       AND (pr.q IS NULL
            OR r.meeting_id IN (SELECT m.id FROM public.meetings m WHERE m.title ILIKE pr.q)
            OR r.reporter_user_id IN (SELECT p.id FROM public.profiles p WHERE p.nickname ILIKE pr.q))
  ),
  filtered AS (
    SELECT b.* FROM base b
     CROSS JOIN params pr
     WHERE pr.tab_statuses IS NULL OR b.status = ANY (pr.tab_statuses)
  ),
  page AS (
    SELECT f.id, f.created_at FROM filtered f
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'tab_counts', (
      SELECT coalesce(jsonb_object_agg(g.key, (
               SELECT count(*) FROM base b WHERE b.status IN (SELECT jsonb_array_elements_text(g.value)))), '{}'::jsonb)
             || jsonb_build_object('all', (SELECT count(*) FROM base))
        FROM jsonb_each(coalesce(p_tab_groups, '{}'::jsonb)) g
    ),
    'ids', coalesce((SELECT jsonb_agg(p.id ORDER BY p.created_at DESC, p.id DESC) FROM page p), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_meeting_reports_page(jsonb, text, text, timestamptz, timestamptz, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_meeting_reports_page(jsonb, text, text, timestamptz, timestamptz, text, integer, integer) TO service_role;
