-- R7 — 광고 작업 화면 서버 페이지 (`/admin/advertising` · boosts · applications · operations).
--
-- 목적: 광고 control plane 이 여러 출처(배달 매장 홍보·배너, 피드 배너 신청·캠페인, 플랫폼 팝업, 거래·커뮤니티
--       상위노출)를 메모리에서 원천별 120건씩 읽어 합치던 목록을 DB 에서 한 번에 합쳐 화면 모드·종류·상태 탭 필터 →
--       정렬 → 페이지 + 정확한 total 로 돌려준다. 요약 카드(=대시보드 광고 지표) 개수도 같은 행 집합에서 센다.
-- 대상 화면: /admin/advertising (+ /boosts /applications /operations) · 대시보드 광고 지표(같은 loadAdsControlPlane)
--            (API GET /api/admin/ads-control-plane?mode&status&family&limit&offset).
--
-- 규칙 원천 (TS 와 같은 정의 — 바꾸면 함께 바꾼다)
--   상태 문자열 → 운영 상태 = lib/admin/ads-exposure/ops-status.ts (mapRawToAdsOpsStatus · projectAdsOpsStatus)
--   원천별 운영 상태·행 id·entity·sourceKind = lib/admin/ads-control-plane/project-family-rows.ts
--   팝업 완성도·노출 표시 = lib/admin/ads-exposure/popup-completeness.ts · popup-runtime-display.ts
--     (실제 노출 1위 팝업 id 집합 = p_popup_winner_ids — TS `computePopupWinnerOccupancy` 결과를 그대로 받는다)
--   상태 탭 = lib/admin/ads-exposure/shell-row.ts (resolveShellStatusTab)
--     · 노출 표시값이 있는 원천(배달·팝업 캠페인)은 표시값 그대로.
--     · 그 외(피드 신청·피드 캠페인·상위노출)는 상태 문구 조합을 다시 읽는 기존 규칙과 같게
--       운영 상태 scheduled 도 "live" 탭이 된다 (「예약 … 아직 노출 안 됨(예약)」 문구에 「노출」 포함) — 기존 동작 유지.
--   화면 모드·종류 탭 = lib/admin/advertising-workspace/workspace-summary.ts (filterAdsWorkspaceRowsByMode) ·
--     shell-row.ts (filterShellRowsByProductFamily · isAdsApprovalQueueRow)
-- 기존 동작 유지: 팝업 오너 신청(`platform_popup_owner_requests`)은 기존 로더 조회 열(title)이 운영 스키마에 없어
--   항상 빠져 있었다 — 이 함수도 포함하지 않는다 (범위 밖 결함, 보고만).
-- 정렬: 행 시각(at) DESC → 원천 순서(배달·피드 신청·피드 캠페인·팝업·상위노출) → 행 id DESC (결정적).
-- 권한: 모두 service_role 만 EXECUTE (행 집합·페이지 함수는 SECURITY DEFINER). 읽기 전용.
-- 의존: public.admin_delivery_ad_campaign_index (20270601100100).
--
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_ads_workspace_page(text, text, text, uuid, uuid[], text, integer, integer);
--   DROP FUNCTION IF EXISTS public.admin_ads_workspace_rows(uuid[], text, timestamptz);
--   DROP FUNCTION IF EXISTS public.admin_ads_project_ops(text, timestamptz, timestamptz, boolean, timestamptz);
--   DROP FUNCTION IF EXISTS public.admin_ads_map_raw_ops(text);
--   DROP INDEX IF EXISTS public.feed_ad_requests_created_id_idx;
--   DROP INDEX IF EXISTS public.point_promotion_orders_domain_created_idx;

CREATE INDEX IF NOT EXISTS feed_ad_requests_created_id_idx
  ON public.feed_ad_requests (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS point_promotion_orders_domain_created_idx
  ON public.point_promotion_orders (domain, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 상태 문자열 → 운영 상태 (mapRawToAdsOpsStatus)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_ads_map_raw_ops(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
-- plpgsql: 행마다 부르는 판정 함수 — sql 함수는 인라인되지 않아 호출당 약 1ms (257행 화면 0.4s) 였다.
DECLARE
  s text := lower(btrim(coalesce(p_raw, '')));
BEGIN
  RETURN CASE
    WHEN s = '' THEN 'ended'
    WHEN strpos(s, 'archiv') > 0 OR strpos(s, 'deleted') > 0 OR strpos(s, '삭제') > 0 THEN 'archived'
    WHEN strpos(s, 'draft') > 0 OR strpos(s, '임시') > 0 THEN 'draft'
    WHEN strpos(s, 'pending') > 0 OR strpos(s, 'review') > 0 OR strpos(s, 'submitted') > 0
      OR strpos(s, '대기') > 0 OR strpos(s, '검토') > 0 OR s = 'held' THEN 'pending'
    WHEN strpos(s, 'schedul') > 0 OR strpos(s, '예약') > 0 OR strpos(s, 'approved') > 0 THEN
      CASE WHEN strpos(s, 'active') > 0 OR strpos(s, '노출') > 0 THEN 'live' ELSE 'scheduled' END
    WHEN strpos(s, 'pause') > 0 OR strpos(s, '중지') > 0 OR strpos(s, 'hold') > 0 THEN 'paused'
    WHEN strpos(s, 'reject') > 0 OR strpos(s, '반려') > 0 OR strpos(s, '거절') > 0 THEN 'rejected'
    WHEN strpos(s, 'end') > 0 OR strpos(s, 'expir') > 0 OR strpos(s, 'cancel') > 0
      OR strpos(s, 'terminat') > 0 OR strpos(s, '종료') > 0 THEN 'ended'
    WHEN strpos(s, 'active') > 0 OR strpos(s, '노출') > 0 OR strpos(s, 'live') > 0 OR strpos(s, 'exposing') > 0 THEN 'live'
    ELSE 'ended'
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ads_project_ops(
  p_raw text,
  p_start timestamptz,
  p_end timestamptz,
  p_inclusive boolean,
  p_now timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  base text := public.admin_ads_map_raw_ops(p_raw);
BEGIN
  RETURN CASE
    WHEN base IN ('rejected', 'ended', 'archived', 'draft', 'paused', 'pending') THEN base
    WHEN p_end IS NOT NULL AND (CASE WHEN p_inclusive THEN p_end < p_now ELSE p_end <= p_now END) THEN 'ended'
    WHEN base IN ('live', 'scheduled') AND p_start IS NOT NULL AND p_start > p_now THEN 'scheduled'
    WHEN base = 'scheduled' THEN 'live'
    ELSE base
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ads_map_raw_ops(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ads_map_raw_ops(text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_ads_project_ops(text, timestamptz, timestamptz, boolean, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ads_project_ops(text, timestamptz, timestamptz, boolean, timestamptz)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 광고 작업 행 집합 (원천 합치기 + 상태 탭)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_ads_workspace_rows(
  p_popup_winner_ids uuid[],
  p_pending_asset text,
  p_now timestamptz
)
RETURNS TABLE (
  family text,
  family_ord integer,
  source_id uuid,
  item_id text,
  domain text,
  product text,
  source_kind text,
  entity text,
  ops text,
  status_tab text,
  at timestamptz,
  store_id uuid,
  popup_surfaces text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH now_ AS (SELECT coalesce(p_now, now()) AS t),
  -- ── 배달 (매장 홍보·배너) — deliveryCampaignOpsStatus ──
  delivery AS (
    SELECT x.id, x.product_kind, x.store_id, x.updated_at, x.campaign_source,
           CASE
             WHEN upper(x.lifecycle_status) = 'REJECTED' THEN 'rejected'
             WHEN upper(x.lifecycle_status) IN ('ENDED', 'TERMINATED', 'ARCHIVED', 'EXHAUSTED') THEN 'ended'
             WHEN upper(x.lifecycle_status) LIKE 'PAUSED%' THEN 'paused'
             WHEN upper(x.lifecycle_status) = 'ACTIVE'
               THEN public.admin_ads_project_ops('active', x.start_at, x.end_at, false, n.t)
             WHEN upper(x.lifecycle_status) IN ('SCHEDULED', 'APPROVED')
               THEN public.admin_ads_project_ops('scheduled', x.start_at, x.end_at, false, n.t)
             WHEN upper(x.lifecycle_status) IN ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED') THEN 'pending'
             WHEN upper(x.lifecycle_status) = 'DRAFT' THEN 'draft'
             ELSE public.admin_ads_map_raw_ops(upper(x.lifecycle_status))
           END AS ops
      FROM public.admin_delivery_ad_campaign_index(p_pending_asset) x, now_ n
  ),
  -- ── 피드 배너 신청 ──
  feed_req AS (
    SELECT r.id, r.created_at, lower(coalesce(r.domain, 'trade')) = 'community' AS community,
           public.admin_ads_project_ops(r.status, r.start_at, r.end_at, false, n.t) AS ops
      FROM public.feed_ad_requests r, now_ n
  ),
  -- ── 피드 배너 캠페인 (전체 출처) ──
  feed_camp AS (
    SELECT c.id, coalesce(c.start_at, c.end_at, n.t) AS at,
           public.admin_ads_project_ops(coalesce(c.status, 'draft'), c.start_at, c.end_at, false, n.t) AS ops
      FROM public.feed_ad_campaigns c, now_ n
  ),
  -- ── 플랫폼 팝업 캠페인 (당겨서 새로고침 띠 제외) ──
  popup_base AS (
    SELECT c.id, c.updated_at, c.owner_store_id, c.start_at, c.end_at, c.status AS raw_status,
           lower(coalesce(c.status, '')) AS st, lower(coalesce(c.approval_status, '')) AS ap,
           (c.owner_store_id IS NULL AND c.owner_request_id IS NULL) AS admin_direct,
           EXISTS (
             SELECT 1 FROM public.platform_popup_creatives cr
              WHERE cr.campaign_id = c.id AND cr.status = 'ready'
                AND lower(btrim(coalesce(cr.variant, ''))) NOT IN ('tablet', 'logo')
                AND (coalesce(btrim(cr.asset_url), '') ~* '^https://'
                     OR (ltrim(btrim(coalesce(cr.asset_path, '')), '/') <> ''
                         AND strpos(cr.asset_path, '..') = 0))
           ) AS has_creative,
           coalesce((SELECT string_agg(s.surface, ',' ORDER BY s.surface)
                       FROM public.platform_popup_campaign_surfaces s WHERE s.campaign_id = c.id), '') AS surfaces
      FROM public.platform_popup_campaigns c
     WHERE c.presentation_type IS NULL OR c.presentation_type <> 'ptr_reveal'
  ),
  popup_cls AS (
    SELECT p.*,
           -- classifyPopupCampaignCompleteness
           CASE
             WHEN NOT p.admin_direct AND (p.st = 'pending_review' OR p.ap = 'pending_review') THEN 'pending_review'
             WHEN p.st IN ('draft', 'not_submitted') OR p.ap = 'not_submitted'
                  OR (p.admin_direct AND (p.st = 'pending_review' OR p.ap = 'pending_review')) THEN
               CASE
                 WHEN p.admin_direct AND (p.st = 'pending_review' OR p.ap = 'pending_review') THEN 'incomplete'
                 WHEN (NOT p.has_creative)::int + (NOT (p.start_at IS NOT NULL AND p.end_at IS NOT NULL))::int >= 2
                   THEN 'orphan_partial'
                 WHEN (NOT p.has_creative) OR NOT (p.start_at IS NOT NULL AND p.end_at IS NOT NULL) THEN 'incomplete'
                 ELSE 'draft_ready'
               END
             ELSE 'operating'
           END AS completeness,
           -- popupCampaignOpsStatus
           CASE
             WHEN p.ap = 'rejected' OR p.st = 'rejected' THEN 'rejected'
             WHEN NOT p.admin_direct AND (p.ap = 'pending_review' OR p.st = 'pending_review') THEN 'pending'
             WHEN p.admin_direct AND (p.ap = 'pending_review' OR p.st = 'pending_review') THEN 'draft'
             ELSE public.admin_ads_project_ops(p.raw_status, p.start_at, p.end_at, false, n.t)
           END AS ops
      FROM popup_base p, now_ n
  ),
  popup AS (
    SELECT pc.*,
           -- projectPopupRuntimeDisplay → resolveShellStatusTab
           CASE
             WHEN pc.completeness IN ('orphan_partial', 'incomplete') THEN 'incomplete'
             WHEN pc.ops = 'live' THEN
               CASE WHEN pc.id = ANY (coalesce(p_popup_winner_ids, '{}'::uuid[])) THEN 'live' ELSE 'waiting' END
             WHEN pc.ops = 'scheduled' THEN 'scheduled'
             WHEN pc.ops = 'paused' THEN 'paused'
             WHEN pc.ops = 'rejected' THEN 'rejected'
             WHEN pc.ops = 'draft' THEN 'incomplete'
             WHEN pc.ops = 'pending' THEN 'pending'
             ELSE 'ended'
           END AS tab
      FROM popup_cls pc
  ),
  -- ── 거래·커뮤니티 상위노출 — promoteOrderOpsStatus (기간 복구 · 종료 경계 포함) ──
  promote_b AS (
    SELECT o.id, o.created_at, o.domain, o.product_id, o.order_status,
           CASE WHEN o.start_at >= timestamptz '2000-01-01' THEN o.start_at END AS s,
           CASE WHEN o.end_at >= timestamptz '2000-01-01' THEN o.end_at END AS e,
           o.duration_days
      FROM public.point_promotion_orders o
     WHERE o.domain IN ('trade', 'community')
  ),
  promote AS (
    SELECT b.id, b.created_at, b.domain, b.product_id,
           public.admin_ads_project_ops(
             b.order_status,
             b.s,
             CASE WHEN b.s IS NOT NULL AND b.e IS NULL AND b.duration_days >= 1
                  THEN b.s + make_interval(days => b.duration_days) ELSE b.e END,
             true, n.t) AS ops
      FROM promote_b b, now_ n
  ),
  unioned AS (
    SELECT 'delivery'::text AS family, 1 AS family_ord, d.id AS source_id, 'delivery:' || d.id::text AS item_id,
           'delivery'::text AS domain, d.product_kind AS product,
           CASE WHEN d.campaign_source = 'DIBAY_FIRST_PARTY' THEN 'admin_direct' ELSE 'owner' END AS source_kind,
           CASE WHEN d.ops IN ('live', 'scheduled', 'paused') THEN 'execution' ELSE 'application' END AS entity,
           d.ops,
           CASE d.ops WHEN 'live' THEN 'live' WHEN 'scheduled' THEN 'scheduled' WHEN 'paused' THEN 'paused'
                      WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'rejected' THEN 'rejected'
                      ELSE 'ended' END AS status_tab,
           d.updated_at AS at, d.store_id, NULL::text AS popup_surfaces
      FROM delivery d
    UNION ALL
    SELECT 'feed_request', 2, f.id, 'feed:' || f.id::text, 'feed',
           CASE WHEN f.community THEN 'feed_banner_community' ELSE 'feed_banner_trade' END,
           'member',
           CASE WHEN f.ops IN ('live', 'scheduled', 'paused') THEN 'execution' ELSE 'application' END,
           f.ops,
           CASE f.ops WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'scheduled' THEN 'live'
                      WHEN 'live' THEN 'live' WHEN 'paused' THEN 'paused' WHEN 'rejected' THEN 'rejected'
                      ELSE 'ended' END,
           f.created_at, NULL::uuid, NULL::text
      FROM feed_req f
    UNION ALL
    SELECT 'feed_campaign', 3, c.id, 'feed_campaign:' || c.id::text, 'feed', 'feed_banner',
           NULL::text,
           CASE WHEN c.ops IN ('live', 'scheduled', 'paused') THEN 'execution' ELSE 'application' END,
           c.ops,
           CASE c.ops WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'scheduled' THEN 'live'
                      WHEN 'live' THEN 'live' WHEN 'paused' THEN 'paused' WHEN 'rejected' THEN 'rejected'
                      ELSE 'ended' END,
           c.at, NULL::uuid, NULL::text
      FROM feed_camp c
    UNION ALL
    SELECT 'popup_campaign', 4, p.id, 'popup_campaign:' || p.id::text, 'popup', 'platform_popup',
           CASE WHEN p.admin_direct THEN 'admin_direct' ELSE 'owner' END,
           CASE WHEN p.admin_direct OR p.ops IN ('live', 'scheduled', 'paused') THEN 'execution' ELSE 'application' END,
           p.ops, p.tab, p.updated_at, p.owner_store_id,
           coalesce(nullif(p.surfaces, ''), 'GLOBAL')
      FROM popup p
    UNION ALL
    SELECT 'promote', 5, o.id,
           CASE WHEN lower(o.domain) = 'community' THEN 'community_promo:' ELSE 'trade_promo:' END || o.id::text,
           CASE WHEN lower(o.domain) = 'community' THEN 'community_promote' ELSE 'trade_promote' END,
           coalesce(o.product_id, CASE WHEN lower(o.domain) = 'community' THEN 'community_promote' ELSE 'trade_promote' END),
           'member',
           CASE WHEN o.ops IN ('live', 'scheduled', 'paused') THEN 'execution' ELSE 'application' END,
           o.ops,
           CASE o.ops WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'scheduled' THEN 'live'
                      WHEN 'live' THEN 'live' WHEN 'paused' THEN 'paused' WHEN 'rejected' THEN 'rejected'
                      ELSE 'ended' END,
           o.created_at, NULL::uuid, NULL::text
      FROM promote o
  )
  SELECT u.family, u.family_ord, u.source_id, u.item_id, u.domain, u.product, u.source_kind, u.entity,
         u.ops, u.status_tab, u.at, u.store_id, u.popup_surfaces
    FROM unioned u;
$$;

REVOKE ALL ON FUNCTION public.admin_ads_workspace_rows(uuid[], text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ads_workspace_rows(uuid[], text, timestamptz) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 광고 작업 화면 페이지 + 요약 개수
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_ads_workspace_page(
  p_mode text,
  p_status text,
  p_family text,
  p_store_id uuid,
  p_popup_winner_ids uuid[],
  p_pending_asset text,
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
    SELECT CASE WHEN p_mode IN ('all', 'applications', 'operations', 'history', 'boosts') THEN p_mode ELSE 'all' END AS mode,
           CASE WHEN p_status IN ('pending', 'scheduled', 'live', 'waiting', 'incomplete', 'paused', 'ended', 'rejected')
                THEN p_status END AS tab,
           CASE WHEN p_family IN ('promote', 'banner', 'popup', 'sponsored') THEN p_family END AS fam,
           LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
           LEAST(100000, GREATEST(0, coalesce(p_offset, 0))) AS off
  ),
  -- 매장 범위: 배달·팝업 캠페인은 store_id 일치, 매장 연결 없는 원천(피드·상위노출)은 제외
  scoped AS (
    SELECT r.*, lower(r.domain) AS d, lower(coalesce(r.product, '')) AS p,
           r.domain IN ('trade_promote', 'community_promote') AS is_boost
      FROM public.admin_ads_workspace_rows(p_popup_winner_ids, p_pending_asset, now()) r
     WHERE p_store_id IS NULL OR r.store_id = p_store_id
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
$$;

REVOKE ALL ON FUNCTION public.admin_ads_workspace_page(text, text, text, uuid, uuid[], text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ads_workspace_page(text, text, text, uuid, uuid[], text, integer, integer)
  TO service_role;
