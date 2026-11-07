-- D-17① (ads-reaudit3-defect-design-2026-11-07) — 통합 신고 큐에서 광고 신고(feed_ad)를 별도 종류로.
--
-- 결함: 운영 admin_reports_unified_page 의 ui_target_type CASE 에 feed_ad 가 없어 ELSE 'product' 로 묶인다
--       → 관리자가 광고 신고만 거를 수 없다. (reports.target_type 'feed_ad' 는 20271106100000 로 운영 허용됨 · 지금 0행)
-- 운영 현재 정의(pg_get_functiondef 2026-11-07)와 다른 점: CASE 에 `WHEN 'feed_ad' THEN 'feed_ad'` 한 줄 추가.
--   ui_target_id 는 기존 ELSE 분기(r.target_id = feed_ad_campaigns.id) 그대로. 그 밖은 같다. 권한도 같다(service_role 만).
-- 웹 담당: 필터 값 'feed_ad' · 제목·상세 링크(/admin/feed-ads/<id>)는 row.target_id 로 만든다.
--
-- 롤백 SQL: scratchpad/db3/orig-m1-05-admin-reports-unified-page.sql
--   (= 이 파일 본문에서 `WHEN 'feed_ad' THEN 'feed_ad'` 줄만 뺀 운영 원문으로 create or replace)

CREATE OR REPLACE FUNCTION public.admin_reports_unified_page(p_sources text[], p_status text, p_target_type text, p_reason text, p_target_q text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        WHEN 'feed_ad' THEN 'feed_ad'
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
$function$;

REVOKE ALL ON FUNCTION public.admin_reports_unified_page(text[], text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reports_unified_page(text[], text, text, text, text, integer, integer) TO service_role;
