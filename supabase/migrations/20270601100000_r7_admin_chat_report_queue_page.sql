-- R7 — 채팅 신고 처리함 서버 페이지 (`/admin/chats/reported`).
--
-- 목적: 3원천(CM `community_messenger_reports` · 레거시 거래 `chat_reports` · 통합 `reports`
--       target_type chat_room|chat_message)을 DB 에서 한 번에 합쳐 정렬·페이지하고 정확한 total 을 돌려준다.
--       기존 로더의 닉네임 검색 후보 상한(`profiles … limit(50)` → in(...))을 없앤다 — 닉네임 조건은 EXISTS 조인.
-- 대상 화면: /admin/chats/reported (API GET /api/admin/chat/report-queue).
-- 상태 묶음(원시 상태값)은 TS 계약(`lib/admin/chat-admin/admin-chat-report-queue-model.ts`)이 원천별로 넘긴다 — 여기서 재정의하지 않는다.
-- 정렬: created_at (asc|desc) → key(`source:id`, COLLATE "C") — 결정적, 페이지 이동 시 누락·중복 없음.
-- 권한: SECURITY DEFINER · service_role 만 EXECUTE (앱 서버가 관리자 가드 통과 후 호출). 읽기 전용.
--
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_chat_report_queue_page(text[], jsonb, uuid, text, text, boolean, integer, integer);
--   DROP INDEX IF EXISTS public.idx_chat_reports_created_id;
--   DROP INDEX IF EXISTS public.idx_reports_chat_target_created;
--   DROP INDEX IF EXISTS public.community_messenger_reports_created_id_idx;

CREATE INDEX IF NOT EXISTS community_messenger_reports_created_id_idx
  ON public.community_messenger_reports (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_chat_reports_created_id
  ON public.chat_reports (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_reports_chat_target_created
  ON public.reports (created_at DESC, id DESC)
  WHERE target_type IN ('chat_room', 'chat_message');

CREATE OR REPLACE FUNCTION public.admin_chat_report_queue_page(
  p_sources text[],
  p_statuses jsonb,
  p_target uuid,
  p_q text,
  p_domain text,
  p_asc boolean,
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
    SELECT coalesce(p_sources, ARRAY['messenger', 'trade_chat', 'trade_report']::text[]) AS sources,
           -- 원천별 원시 상태 목록. 키가 없거나 null 이면 상태 조건 없음.
           CASE WHEN p_statuses IS NULL OR jsonb_typeof(p_statuses -> 'messenger') <> 'array' THEN NULL
                ELSE ARRAY(SELECT jsonb_array_elements_text(p_statuses -> 'messenger')) END AS st_messenger,
           CASE WHEN p_statuses IS NULL OR jsonb_typeof(p_statuses -> 'trade_chat') <> 'array' THEN NULL
                ELSE ARRAY(SELECT jsonb_array_elements_text(p_statuses -> 'trade_chat')) END AS st_trade_chat,
           CASE WHEN p_statuses IS NULL OR jsonb_typeof(p_statuses -> 'trade_report') <> 'array' THEN NULL
                ELSE ARRAY(SELECT jsonb_array_elements_text(p_statuses -> 'trade_report')) END AS st_trade_report,
           nullif(btrim(coalesce(p_q, '')), '') AS q,
           nullif(btrim(coalesce(p_domain, '')), '') AS domain,
           coalesce(p_asc, false) AS asc_order,
           LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
           LEAST(100000, GREATEST(0, coalesce(p_offset, 0))) AS off
  ),
  -- 닉네임·아이디 검색 대상 회원 (후보 상한 없음 — 아래 EXISTS 로만 쓴다).
  q_users AS (
    SELECT p.id
      FROM public.profiles p, params pr
     WHERE pr.q IS NOT NULL
       AND (p.nickname ILIKE '%' || pr.q || '%' OR p.username ILIKE '%' || pr.q || '%')
  ),
  messenger AS (
    SELECT 'messenger'::text AS source, r.id, r.created_at, r.status AS raw_status,
           r.report_type AS target_type, r.reason_type AS reason_code, r.reason_detail,
           r.room_id, r.message_id, r.reporter_user_id AS reporter_id, r.reported_user_id,
           r.admin_note, r.handled_at, NULL::timestamptz AS updated_at, NULL::uuid AS target_id
      FROM public.community_messenger_reports r, params pr
     WHERE 'messenger' = ANY (pr.sources)
       AND (pr.st_messenger IS NULL OR r.status = ANY (pr.st_messenger))
       AND (pr.domain IS NULL OR EXISTS (
             SELECT 1 FROM public.community_messenger_rooms rm
              WHERE rm.id = r.room_id AND rm.chat_domain = pr.domain))
       AND (p_target IS NULL OR r.room_id = p_target OR r.reported_user_id = p_target OR r.reporter_user_id = p_target)
       AND (pr.q IS NULL OR EXISTS (
             SELECT 1 FROM q_users u WHERE u.id = r.reported_user_id OR u.id = r.reporter_user_id))
  ),
  trade_chat AS (
    SELECT 'trade_chat'::text, r.id, r.created_at, r.status,
           r.report_type, r.reason_type, r.reason_detail,
           r.room_id, r.message_id, r.reporter_user_id, r.reported_user_id,
           NULL::text, NULL::timestamptz, r.updated_at, NULL::uuid
      FROM public.chat_reports r, params pr
     WHERE 'trade_chat' = ANY (pr.sources)
       -- 레거시 거래 채팅 신고는 거래 방에만 있다 (방 유형 필터가 거래가 아니면 제외).
       AND (pr.domain IS NULL OR pr.domain = 'trade')
       AND (pr.st_trade_chat IS NULL OR r.status = ANY (pr.st_trade_chat))
       AND (p_target IS NULL OR r.room_id = p_target OR r.reported_user_id = p_target OR r.reporter_user_id = p_target)
       AND (pr.q IS NULL OR EXISTS (
             SELECT 1 FROM q_users u WHERE u.id = r.reported_user_id OR u.id = r.reporter_user_id))
  ),
  trade_report AS (
    SELECT 'trade_report'::text, r.id, r.created_at, r.status,
           r.target_type, r.reason_code, r.reason_text,
           r.room_id, NULL::uuid, r.reporter_id, NULL::uuid,
           r.admin_note, r.resolved_at, NULL::timestamptz, r.target_id
      FROM public.reports r, params pr
     WHERE 'trade_report' = ANY (pr.sources)
       AND r.target_type IN ('chat_room', 'chat_message')
       AND (pr.domain IS NULL OR pr.domain = 'trade')
       AND (pr.st_trade_report IS NULL OR r.status = ANY (pr.st_trade_report))
       AND (p_target IS NULL OR r.room_id = p_target OR r.target_id = p_target OR r.reporter_id = p_target)
       AND (pr.q IS NULL OR EXISTS (SELECT 1 FROM q_users u WHERE u.id = r.reporter_id))
  ),
  unioned AS (
    SELECT u.*, (u.source || ':' || u.id::text) COLLATE "C" AS key
      FROM (SELECT * FROM messenger UNION ALL SELECT * FROM trade_chat UNION ALL SELECT * FROM trade_report) u
  ),
  paged AS (
    SELECT un.*
      FROM unioned un, params pr
     ORDER BY CASE WHEN pr.asc_order THEN un.created_at END ASC,
              CASE WHEN pr.asc_order THEN un.key END ASC,
              CASE WHEN NOT pr.asc_order THEN un.created_at END DESC,
              CASE WHEN NOT pr.asc_order THEN un.key END DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM unioned),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'source', pg.source,
               'id', pg.id,
               'created_at', pg.created_at,
               'raw_status', pg.raw_status,
               'target_type', pg.target_type,
               'target_id', pg.target_id,
               'reason_code', pg.reason_code,
               'reason_detail', pg.reason_detail,
               'room_id', pg.room_id,
               'message_id', pg.message_id,
               'reporter_id', pg.reporter_id,
               'reported_user_id', pg.reported_user_id,
               'admin_note', pg.admin_note,
               'handled_at', pg.handled_at,
               'updated_at', pg.updated_at)
             ORDER BY CASE WHEN pr.asc_order THEN pg.created_at END ASC,
                      CASE WHEN pr.asc_order THEN pg.key END ASC,
                      CASE WHEN NOT pr.asc_order THEN pg.created_at END DESC,
                      CASE WHEN NOT pr.asc_order THEN pg.key END DESC)
        FROM paged pg, params pr
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_chat_report_queue_page(text[], jsonb, uuid, text, text, boolean, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_chat_report_queue_page(text[], jsonb, uuid, text, text, boolean, integer, integer)
  TO service_role;
