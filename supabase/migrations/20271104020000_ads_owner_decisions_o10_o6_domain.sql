-- Owner 결정 DB 3건 중 O-10·O-6② (Owner 「DB 3건 진행」 2026-11-03) — docs/audit/ads-owner-decisions-db-design-2026-11-03.md
-- 백업: docs/audit/owner-decisions-db3-backup-2026-11-03.sql (적용 직전 정의 원문)

-- O-10: 커뮤니티 운영 종료 환급 원장 문구 (새 환급부터 · 지난 행은 기록이라 그대로)
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.admin_promotion_end'::regproc);
  v_old text := '''홍보 종료 환급 (운영 사유)''';
  v_new text := '''커뮤니티 상위노출 종료 환급 (운영 사유)''';
BEGIN
  IF position(v_new IN v_def) > 0 THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'admin_promotion_end: 바꿀 문구가 정확히 1번 있어야 함';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;

-- O-6②: 공통 광고 목록 도메인 거름 (인자 추가 = 기존 8인자 함수를 지우고 9인자로 · 새 인자 기본값 null 이라 기존 호출 그대로)
DROP FUNCTION IF EXISTS public.admin_ads_workspace_page(text, text, text, uuid, uuid[], text, integer, integer);
CREATE OR REPLACE FUNCTION public.admin_ads_workspace_page(p_mode text, p_status text, p_family text, p_store_id uuid, p_popup_winner_ids uuid[], p_pending_asset text, p_limit integer, p_offset integer, p_domain text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT CASE WHEN p_mode IN ('all', 'applications', 'operations', 'history', 'boosts') THEN p_mode ELSE 'all' END AS mode,
           CASE WHEN p_status IN ('pending', 'scheduled', 'live', 'waiting', 'incomplete', 'paused', 'ended', 'rejected')
                THEN p_status END AS tab,
           CASE WHEN p_family IN ('promote', 'banner', 'popup', 'sponsored') THEN p_family END AS fam,
           LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
           LEAST(100000, GREATEST(0, coalesce(p_offset, 0))) AS off
  ),
  -- 매장 범위: 배달·팝업 캠페인은 store_id 일치, 매장 연결 없는 원천(피드·상위노출)은 제외
  -- Owner 결정 O-6② (2026-11-03): 도메인 거름 — 거래·커뮤니티·배달 메뉴에서 그 도메인 행만 연다 (null = 전체, 기존 호출 그대로)
  --   거래/커뮤니티 = 상위노출 + 피드 배너(신청은 상품 이름, 캠페인은 feed_ad_campaigns.domain) · 배달 = 배달 광고 + 매장 연결 팝업(사장님 팝업)
  --   매장 연결이 없는 플랫폼 팝업은 도메인이 없어 「전체」에서만 보인다
  scoped AS (
    SELECT r.*, lower(r.domain) AS d, lower(coalesce(r.product, '')) AS p,
           r.domain IN ('trade_promote', 'community_promote') AS is_boost
      FROM public.admin_ads_workspace_rows(p_popup_winner_ids, p_pending_asset, now()) r
      LEFT JOIN public.feed_ad_campaigns fc ON r.family = 'feed_campaign' AND fc.id = r.source_id
     WHERE (p_store_id IS NULL OR r.store_id = p_store_id)
       AND (
         p_domain IS NULL
         OR p_domain = CASE
              WHEN r.domain = 'trade_promote' THEN 'trade'
              WHEN r.domain = 'community_promote' THEN 'community'
              WHEN r.family = 'feed_request' THEN CASE WHEN strpos(lower(coalesce(r.product, '')), 'community') > 0 THEN 'community' ELSE 'trade' END
              WHEN r.family = 'feed_campaign' THEN lower(coalesce(fc.domain, ''))
              WHEN r.domain = 'delivery' THEN 'delivery'
              WHEN r.domain = 'popup' AND r.store_id IS NOT NULL THEN 'delivery'
              ELSE NULL
            END
       )
  ),
  moded AS (
    SELECT s.*, m.mode
      FROM scoped s
     CROSS JOIN (VALUES ('all'), ('applications'), ('operations'), ('history'), ('boosts')) AS m(mode)
     WHERE CASE m.mode
             WHEN 'all' THEN true
             WHEN 'boosts' THEN s.is_boost
             WHEN 'history' THEN s.status_tab IN ('ended', 'rejected', 'paused')
             WHEN 'operations' THEN NOT s.is_boost
               AND (s.source_kind = 'admin_direct' OR s.entity = 'execution' OR s.family = 'popup_campaign')
               AND s.status_tab IN ('scheduled', 'live', 'waiting', 'paused', 'incomplete', 'ended')
             WHEN 'applications' THEN NOT s.is_boost
               AND s.source_kind IS DISTINCT FROM 'admin_direct'
               AND s.d <> 'popup'
               AND s.family <> 'feed_campaign'
               AND (s.family = 'feed_request'
                    OR (s.d = 'delivery' AND (strpos(s.p, 'sponsored') > 0 OR strpos(s.p, 'store_promote') > 0
                                              OR strpos(s.p, 'banner') > 0)))
               AND s.status_tab IN ('pending', 'incomplete', 'rejected')
           END
  ),
  filtered AS (
    SELECT m.*
      FROM moded m, params pr
     WHERE m.mode = pr.mode
       AND (pr.tab IS NULL OR m.status_tab = pr.tab)
       AND (pr.fam IS NULL OR CASE pr.fam
             WHEN 'promote' THEN m.d IN ('trade_promote', 'community_promote')
               OR strpos(m.p, 'promote') > 0 OR strpos(m.p, 'boost') > 0
             WHEN 'popup' THEN m.d = 'popup' OR strpos(m.p, 'popup') > 0
             WHEN 'sponsored' THEN strpos(m.p, 'sponsored') > 0 OR strpos(m.p, 'store_promote') > 0
             ELSE (m.d = 'delivery' AND strpos(m.p, 'sponsored') = 0) OR m.d = 'feed'
               OR (strpos(m.p, 'banner') > 0 AND strpos(m.p, 'sponsored') = 0)
           END)
  ),
  paged AS (
    SELECT f.family, f.family_ord, f.source_id, f.item_id, f.at
      FROM filtered f
     ORDER BY f.at DESC NULLS LAST, f.family_ord, f.item_id COLLATE "C" DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  ),
  counts AS (
    SELECT mode, status_tab, count(*) AS n FROM moded GROUP BY mode, status_tab
  ),
  popup_groups AS (
    SELECT s.popup_surfaces AS surfaces,
           coalesce(jsonb_agg(s.source_id ORDER BY s.at DESC, s.item_id COLLATE "C" DESC)
                      FILTER (WHERE s.status_tab = 'live'), '[]'::jsonb) AS live_ids,
           coalesce(jsonb_agg(s.source_id ORDER BY s.at DESC, s.item_id COLLATE "C" DESC)
                      FILTER (WHERE s.status_tab = 'waiting'), '[]'::jsonb) AS waiting_ids,
           count(*) FILTER (WHERE s.status_tab = 'incomplete') AS incomplete_n,
           count(*) FILTER (WHERE s.status_tab = 'scheduled') AS scheduled_n
      FROM scoped s
     WHERE s.family = 'popup_campaign'
     GROUP BY s.popup_surfaces
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('family', pg.family, 'source_id', pg.source_id, 'item_id', pg.item_id)
                       ORDER BY pg.at DESC NULLS LAST, pg.family_ord, pg.item_id COLLATE "C" DESC)
        FROM paged pg
    ), '[]'::jsonb),
    -- 화면 모드별 상태 탭 개수 (요약 카드 = 대시보드 광고 지표)
    'summary_counts', (
      SELECT jsonb_object_agg(m.mode, coalesce((
               SELECT jsonb_object_agg(c.status_tab, c.n) FROM counts c WHERE c.mode = m.mode), '{}'::jsonb))
        FROM (VALUES ('all'), ('applications'), ('operations'), ('history'), ('boosts')) AS m(mode)
    ),
    -- 원천별 처리 대기 (control plane queues) — 매장 범위에서는 매장 연결 없는 원천이므로 0
    'queue_counts', jsonb_build_object(
      'feed_pending', CASE WHEN p_store_id IS NOT NULL THEN 0 ELSE (
        SELECT count(*) FROM public.feed_ad_requests r
         WHERE lower(btrim(coalesce(r.status, ''))) IN ('pending_review', 'pending', 'held')) END,
      'trade_pending', CASE WHEN p_store_id IS NOT NULL THEN 0 ELSE (
        SELECT count(*) FROM public.point_promotion_orders o
         WHERE o.domain = 'trade' AND lower(o.order_status) = 'pending_review') END,
      'community_pending', CASE WHEN p_store_id IS NOT NULL THEN 0 ELSE (
        SELECT count(*) FROM public.point_promotion_orders o
         WHERE o.domain = 'community' AND lower(o.order_status) = 'pending_review') END
    ),
    'popup_surfaces', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'surfaces', g.surfaces, 'live_ids', g.live_ids, 'waiting_ids', g.waiting_ids,
               'incomplete', g.incomplete_n, 'scheduled', g.scheduled_n) ORDER BY g.surfaces)
        FROM popup_groups g
    ), '[]'::jsonb)
  );
$function$
;
REVOKE ALL ON FUNCTION public.admin_ads_workspace_page(text, text, text, uuid, uuid[], text, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ads_workspace_page(text, text, text, uuid, uuid[], text, integer, integer, text) TO service_role;
