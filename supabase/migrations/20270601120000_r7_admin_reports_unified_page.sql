-- R7 잔여 — 통합 신고 목록 서버 페이지 (고정 조회 상한 제거).
--
-- 목적: `/admin/reports` 가 거래 신고(reports: 처리 대기 2000건 + 처리 완료 300건)와
--       커뮤니티 신고(community_reports: 최신 300건)를 각각 고정 상한으로 읽어 브라우저에서 합치던 경로를
--       DB 한 번(UNION ALL → 필터 → 결정적 정렬 → limit/offset + 정확한 total)으로 바꾼다.
-- 대상 화면: /admin/reports (GET /api/admin/reports?limit=&offset=… — 권한 키 `reports`).
-- 화면 값 규칙(TS 와 같음):
--   거래   상태 = 알려진 값 그대로, 그 외 'pending' (admin-reports-read.server.ts toReportStatus)
--          대상 유형 = user → user · chat_room/chat_message → chat · 그 외 product (toTargetType)
--          대상 id   = product/post/comment → coalesce(product_id, target_id), 그 외 target_id
--   커뮤니티 상태 = open → pending · dismissed → rejected · reviewing/resolved 그대로 · 그 외 pending
--          (map-community-reports.ts), 대상 유형 = community, 사유 = reason 의 ':' 앞 (없으면 'etc'),
--          대상 글/댓글(post·comment)만 (listCommunityReportsForAdmin 과 같음).
--   `?target=` = 대상 id 부분 일치(대소문자 무시, 와일드카드 아님).
-- 정렬: created_at DESC NULLS LAST, id DESC, source — 페이지 이동 시 누락·중복 없음.
-- 읽기 전용 (쓰기 없음).
-- 권한: SECURITY DEFINER · search_path=public · PUBLIC/anon/authenticated EXECUTE 회수 · service_role 만 실행
--       (앱 서버가 requireAdminPermission("reports") 통과 후 service role 로 호출).
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_reports_unified_page(text[], text, text, text, text, integer, integer);
--   DROP INDEX IF EXISTS public.idx_reports_created_id;
--   DROP INDEX IF EXISTS public.idx_community_reports_created_id;

CREATE INDEX IF NOT EXISTS idx_reports_created_id
  ON public.reports (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_community_reports_created_id
  ON public.community_reports (created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.admin_reports_unified_page(
  p_sources text[],
  p_status text,
  p_target_type text,
  p_reason text,
  p_target_q text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    SELECT
      'reports'::text AS source,
      r.id,
      r.created_at,
      CASE
        WHEN r.status IN ('pending', 'reviewing', 'resolved', 'rejected', 'sanctioned', 'reviewed') THEN r.status
        ELSE 'pending'
      END AS ui_status,
      CASE lower(coalesce(r.target_type, ''))
        WHEN 'user' THEN 'user'
        WHEN 'chat_room' THEN 'chat'
        WHEN 'chat_message' THEN 'chat'
        ELSE 'product'
      END AS ui_target_type,
      r.reason_code AS ui_reason,
      CASE
        WHEN lower(coalesce(r.target_type, '')) IN ('product', 'post', 'comment')
          THEN coalesce(r.product_id, r.target_id)::text
        ELSE r.target_id::text
      END AS ui_target_id,
      jsonb_build_object(
        'id', r.id,
        'reporter_id', r.reporter_id,
        'target_type', r.target_type,
        'target_id', r.target_id,
        'room_id', r.room_id,
        'product_id', r.product_id,
        'reason_code', r.reason_code,
        'reason_text', r.reason_text,
        'status', r.status,
        'admin_note', r.admin_note,
        'created_at', r.created_at,
        'resolved_at', r.resolved_at,
        'resolved_by', r.resolved_by
      ) AS row
    FROM public.reports r
    WHERE 'reports' = ANY (coalesce(p_sources, ARRAY[]::text[]))
    UNION ALL
    SELECT
      'community_feed'::text,
      c.id,
      c.created_at,
      CASE lower(coalesce(c.status, ''))
        WHEN 'open' THEN 'pending'
        WHEN 'reviewing' THEN 'reviewing'
        WHEN 'resolved' THEN 'resolved'
        WHEN 'dismissed' THEN 'rejected'
        ELSE 'pending'
      END,
      'community'::text,
      coalesce(nullif(btrim(split_part(coalesce(c.reason, ''), ':', 1)), ''), 'etc'),
      coalesce(c.target_id, ''),
      jsonb_build_object(
        'id', c.id,
        'target_type', c.target_type,
        'target_id', c.target_id,
        'user_id', c.user_id,
        'reason', c.reason,
        'status', c.status,
        'admin_memo', c.admin_memo,
        'processed_at', c.processed_at,
        'created_at', c.created_at
      )
    FROM public.community_reports c
    WHERE 'community_feed' = ANY (coalesce(p_sources, ARRAY[]::text[]))
      AND c.target_type IN ('post', 'comment')
  ),
  f AS (
    SELECT *
      FROM u
     WHERE (coalesce(p_status, '') = '' OR u.ui_status = p_status)
       AND (coalesce(p_target_type, '') = '' OR u.ui_target_type = p_target_type)
       AND (coalesce(p_reason, '') = '' OR u.ui_reason = p_reason)
       AND (
         coalesce(btrim(p_target_q), '') = ''
         OR strpos(lower(btrim(u.ui_target_id)), lower(btrim(p_target_q))) > 0
       )
  ),
  pg AS (
    SELECT *
      FROM f
     ORDER BY f.created_at DESC NULLS LAST, f.id DESC, f.source
     LIMIT greatest(least(coalesce(p_limit, 20), 100), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'rows', coalesce(
      (SELECT jsonb_agg(
                jsonb_build_object('source', pg.source, 'id', pg.id, 'created_at', pg.created_at, 'row', pg.row)
                ORDER BY pg.created_at DESC NULLS LAST, pg.id DESC, pg.source)
         FROM pg),
      '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_reports_unified_page(text[], text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reports_unified_page(text[], text, text, text, text, integer, integer) TO service_role;
