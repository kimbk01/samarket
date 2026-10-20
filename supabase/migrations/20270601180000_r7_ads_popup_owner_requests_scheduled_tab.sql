-- R7 후속 (ads) — 팝업 오너 신청 목록 포함 + 예약(scheduled) 상태 탭 바로잡기.
--
-- 원인 1 (팝업 오너 신청 누락):
--   `platform_popup_owner_requests` 는 광고 작업(/admin/advertising …)·광고 이력(/admin/advertising/history) 목록에서
--   항상 빠져 있었다. R7 이전 TS 로더가 운영 스키마에 없는 열(`title`)을 조회해 매번 오류가 났고, 오류를
--   「표 없음」으로 삼켜 0건으로 그렸다. 20270601100200·100300 RPC 는 그 동작을 그대로 옮겨 이 원천을 넣지 않았다.
--   수정: 운영 실제 열(id, store_id, owner_user_id, request_status, payment_status, price_minor,
--   requested_start_at, requested_end_at, created_at)로 두 RPC 에 원천을 추가한다. 제목 열이 없으므로
--   이력 제목 = 신청 매장 이름(stores.store_name), 없으면 id 앞 8자.
--   운영 상태 = popupRequestOpsStatus (lib/admin/ads-control-plane/project-family-rows.ts) =
--   admin_ads_project_ops(request_status, requested_start_at, requested_end_at, exclusive) — TS 와 같은 정의.
-- 원인 2 (예약이 「노출 중」 탭으로 셈):
--   피드 신청·피드 캠페인·상위노출은 운영 상태를 계산한 뒤, 상태 탭을 상태 문구 조합(「예약 … 아직 노출 안 됨(예약)」)을
--   다시 읽어 정했고 문구의 「노출」 때문에 scheduled → live 가 됐다. SQL 도 그 결과를 'scheduled' THEN 'live' 로 복제했다.
--   수정: 상태 탭 = 계산된 운영 상태 그대로 (scheduled → 'scheduled'). TS 는 AdsActionItem.opsStatus 로 같은 규칙
--   (lib/admin/ads-exposure/shell-row.ts resolveShellStatusTab → opsToShellTab).
--
-- 대상 화면: /admin/advertising (+ /boosts /applications /operations /history 모드) · /admin/advertising/history ·
--            대시보드 광고 지표(같은 admin_ads_workspace_page 요약 개수 — 지표 6개 구성 유지).
-- 바꾸는 객체 (본문 전체 CREATE OR REPLACE · 시그니처 동일):
--   public.admin_ads_workspace_rows(uuid[], text, timestamptz)  — admin_ads_workspace_page 가 그대로 사용
--   public.admin_ads_history_page(text, text, text, jsonb, integer, integer)
-- 권한: SECURITY DEFINER · service_role 만 EXECUTE (기존과 같음). 읽기 전용.
-- 정렬: 기존과 같음 (workspace: at DESC → family_ord → item_id DESC · history: last_at DESC → row_id DESC).
--   팝업 오너 신청 family_ord = 6.
-- 인덱스: 추가 없음 (운영 13건 · store_id 범위 필터는 기존 FK 열).
--
-- 롤백: 20270601100300_r7_admin_ads_workspace_page.sql 의 「2. 광고 작업 행 집합」 절(admin_ads_workspace_rows
--   CREATE OR REPLACE + REVOKE/GRANT)과 20270601100200_r7_admin_ads_history_page.sql 의 admin_ads_history_page
--   CREATE OR REPLACE + REVOKE/GRANT 를 다시 실행한다 (DROP 하지 않는다 — admin_ads_workspace_page 가 의존).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 광고 작업 행 집합 (원천 합치기 + 상태 탭)
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
  -- ── 팝업 오너 신청 (platform_popup_owner_requests) — popupRequestOpsStatus (신청 기간 기준) ──
  popup_req AS (
    SELECT r.id, r.store_id, r.created_at,
           public.admin_ads_project_ops(r.request_status, r.requested_start_at, r.requested_end_at, false, n.t) AS ops
      FROM public.platform_popup_owner_requests r, now_ n
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
           CASE f.ops WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'scheduled' THEN 'scheduled'
                      WHEN 'live' THEN 'live' WHEN 'paused' THEN 'paused' WHEN 'rejected' THEN 'rejected'
                      ELSE 'ended' END,
           f.created_at, NULL::uuid, NULL::text
      FROM feed_req f
    UNION ALL
    SELECT 'feed_campaign', 3, c.id, 'feed_campaign:' || c.id::text, 'feed', 'feed_banner',
           NULL::text,
           CASE WHEN c.ops IN ('live', 'scheduled', 'paused') THEN 'execution' ELSE 'application' END,
           c.ops,
           CASE c.ops WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'scheduled' THEN 'scheduled'
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
           CASE o.ops WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'scheduled' THEN 'scheduled'
                      WHEN 'live' THEN 'live' WHEN 'paused' THEN 'paused' WHEN 'rejected' THEN 'rejected'
                      ELSE 'ended' END,
           o.created_at, NULL::uuid, NULL::text
      FROM promote o
    UNION ALL
    SELECT 'popup_request', 6, q.id, 'popup:' || q.id::text, 'popup', 'platform_popup',
           'owner', 'application',
           q.ops,
           CASE q.ops WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'scheduled' THEN 'scheduled'
                      WHEN 'live' THEN 'live' WHEN 'paused' THEN 'paused' WHEN 'rejected' THEN 'rejected'
                      ELSE 'ended' END,
           q.created_at, q.store_id, NULL::text
      FROM popup_req q
  )
  SELECT u.family, u.family_ord, u.source_id, u.item_id, u.domain, u.product, u.source_kind, u.entity,
         u.ops, u.status_tab, u.at, u.store_id, u.popup_surfaces
    FROM unioned u;
$$;

REVOKE ALL ON FUNCTION public.admin_ads_workspace_rows(uuid[], text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ads_workspace_rows(uuid[], text, timestamptz) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 광고 이력 페이지
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_ads_history_page(
  p_domain text,
  p_status text,
  p_q text,
  p_product_labels jsonb,
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
    SELECT CASE WHEN p_domain IN ('community', 'trade', 'delivery', 'popup') THEN p_domain END AS domain,
           CASE WHEN p_status IN ('approved', 'rejected', 'ended', 'refunded', 'paused') THEN p_status END AS status,
           nullif(lower(btrim(coalesce(p_q, ''))), '') AS q,
           coalesce(p_product_labels, '{}'::jsonb) AS labels,
           LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
           LEAST(100000, GREATEST(0, coalesce(p_offset, 0))) AS off
  ),
  -- ── 상위노출 (point_promotion_orders) ───────────────────────────────
  boost AS (
    SELECT 'boost'::text AS family, o.id AS source_id,
           CASE WHEN o.domain = 'community' THEN 'community' ELSE 'trade' END AS domain,
           CASE WHEN o.domain = 'community' THEN 'community_boost' ELSE 'trade_boost' END AS product_key,
           lower(o.order_status) AS st,
           (o.point_cost IS NOT NULL AND o.point_cost >= 0) AS proven,
           coalesce(nullif(btrim(o.target_title), ''), left(o.id::text, 8)) AS title,
           left(o.user_id::text, 8) AS applicant,
           coalesce(o.end_at, o.created_at) AS last_at
      FROM public.point_promotion_orders o
     WHERE o.domain IN ('trade', 'community')
  ),
  boost_rows AS (
    SELECT b.family, b.source_id, b.domain, b.product_key,
           'boost:' || b.product_key || ':' || b.source_id::text AS row_id,
           b.title, b.applicant, b.last_at,
           CASE b.st WHEN 'ended' THEN '종료' WHEN 'paused' THEN '제재 중' WHEN 'active' THEN '활성'
                     ELSE coalesce(nullif(b.st, ''), '미확인') END AS final_ko,
           CASE b.st WHEN 'ended' THEN 'Ended' WHEN 'paused' THEN 'Sanctioned' WHEN 'active' THEN 'Active'
                     ELSE coalesce(nullif(b.st, ''), 'Unknown') END AS final_en,
           '신청 → 결제'
             || CASE WHEN b.st = 'paused' THEN ' → 제재' ELSE '' END
             || CASE WHEN b.st = 'ended' THEN ' → 종료' WHEN b.st = 'active' THEN ' → 노출' ELSE '' END AS life_ko,
           CASE WHEN b.proven THEN 'paid' ELSE 'not_proven' END AS pay_state,
           NULL::text AS placement_override
      FROM boost b
  ),
  -- ── 피드 배너 신청 (feed_ad_requests) ──────────────────────────────
  feed_req AS (
    SELECT 'feed_request'::text AS family, r.id AS source_id,
           CASE WHEN lower(r.domain) = 'community' THEN 'community' ELSE 'trade' END AS domain,
           CASE WHEN lower(r.domain) = 'community' THEN 'community_banner' ELSE 'trade_banner' END AS product_key,
           lower(r.status) AS st,
           (r.point_cost IS NOT NULL AND r.point_cost >= 0) AS proven,
           r.reviewed_at,
           coalesce(nullif(btrim(r.destination_id), ''), left(r.id::text, 8)) AS title,
           left(r.user_id::text, 8) AS applicant,
           coalesce(r.reviewed_at, r.end_at, r.created_at) AS last_at,
           nullif(btrim(coalesce(r.placement, '')), '') AS placement
      FROM public.feed_ad_requests r
  ),
  feed_req_rows AS (
    SELECT f.family, f.source_id, f.domain, f.product_key,
           'feed_banner:' || f.product_key || ':request:' || f.source_id::text AS row_id,
           f.title, f.applicant, f.last_at,
           coalesce(nullif(f.st, ''), '미확인') AS final_ko,
           coalesce(nullif(f.st, ''), 'unknown') AS final_en,
           '신청 → ' || CASE WHEN f.proven THEN 'Point' ELSE '결제미확인' END
             || CASE WHEN f.reviewed_at IS NOT NULL OR f.st IN ('rejected', 'active')
                     THEN CASE WHEN f.st = 'rejected' THEN ' → 반려' ELSE ' → 승인' END ELSE '' END
             || CASE WHEN f.st = 'ended' THEN ' → 종료' ELSE '' END
             || CASE WHEN f.st = 'paused' THEN ' → 일시중지' ELSE '' END AS life_ko,
           CASE WHEN f.proven THEN CASE WHEN f.st = 'pending_review' THEN 'hold' ELSE 'paid' END
                ELSE 'not_proven' END AS pay_state,
           f.placement AS placement_override
      FROM feed_req f
  ),
  -- ── Admin 직접 피드 배너 (feed_ad_campaigns source = ADMIN_DIRECT) ─────
  feed_camp_rows AS (
    SELECT 'feed_campaign'::text AS family, c.id AS source_id,
           CASE WHEN c.domain = 'community' THEN 'community' ELSE 'trade' END AS domain,
           CASE WHEN c.domain = 'community' THEN 'community_banner' ELSE 'trade_banner' END AS product_key,
           'feed_banner:' || CASE WHEN c.domain = 'community' THEN 'community_banner' ELSE 'trade_banner' END
             || ':campaign:' || c.id::text AS row_id,
           coalesce(nullif(btrim(c.name), ''), left(c.id::text, 8)) AS title,
           'Admin'::text AS applicant,
           coalesce(c.end_at, c.start_at) AS last_at,
           coalesce(nullif(lower(c.status), ''), '미확인') AS final_ko,
           coalesce(nullif(lower(c.status), ''), 'unknown') AS final_en,
           'Admin 등록'
             || CASE WHEN lower(c.status) = 'ended' THEN ' → 종료' ELSE '' END
             || CASE WHEN lower(c.status) = 'paused' THEN ' → 일시중지' ELSE '' END AS life_ko,
           'none'::text AS pay_state,
           nullif(btrim(coalesce(c.placement, '')), '') AS placement_override
      FROM public.feed_ad_campaigns c
     WHERE coalesce(c.source, 'ADMIN_DIRECT') <> 'MEMBER_REQUESTED'
  ),
  -- ── 배달 광고 (매장 홍보·배너) ─────────────────────────────────────
  delivery AS (
    SELECT x.*,
           (x.campaign_source = 'DIBAY_FIRST_PARTY') AS admin_direct,
           CASE WHEN x.product_kind = 'banner' THEN 'delivery_home_banner' ELSE 'delivery_store_sponsored' END AS product_key,
           (SELECT s.final_payable_minor FROM public.delivery_ad_campaign_commercial_snapshots s
             WHERE s.campaign_id = x.id ORDER BY s.created_at DESC, s.id DESC LIMIT 1) AS final_payable_minor,
           EXISTS (SELECT 1 FROM public.delivery_ad_canonical_bc_fundings f
                    WHERE f.application_id = x.id AND f.refund_ledger_id IS NOT NULL) AS refund_proven,
           EXISTS (SELECT 1 FROM public.delivery_ad_audit_logs a
                    WHERE a.campaign_id = x.id AND a.action ~* 'approv') AS has_approve,
           EXISTS (SELECT 1 FROM public.delivery_ad_audit_logs a
                    WHERE a.campaign_id = x.id AND a.action ~* 'reject') AS has_reject,
           (SELECT min(a.created_at) FROM public.delivery_ad_audit_logs a WHERE a.campaign_id = x.id) AS first_audit_at
      FROM public.admin_delivery_ad_campaign_index(NULL) x
  ),
  delivery_rows AS (
    SELECT 'delivery'::text AS family, d.id AS source_id, 'delivery'::text AS domain, d.product_key,
           'delivery:' || d.product_key || ':' || d.id::text AS row_id,
           coalesce(nullif(btrim(CASE WHEN coalesce(d.title, '') <> '' THEN d.title ELSE d.headline END), ''),
                    left(d.id::text, 8)) AS title,
           CASE WHEN d.admin_direct THEN 'Admin' ELSE left(d.owner_user_id::text, 8) END AS applicant,
           coalesce(d.first_audit_at, d.end_at, d.created_at) AS last_at,
           d.lifecycle_status AS final_ko,
           d.lifecycle_status AS final_en,
           CASE WHEN d.admin_direct THEN 'Admin 등록'
                ELSE '오너 신청 → ' || CASE WHEN d.final_payable_minor IS NOT NULL AND d.final_payable_minor >= 0
                                            THEN 'Business Cash' ELSE '결제미확인' END END
             || CASE WHEN d.has_approve THEN ' → 승인' ELSE '' END
             || CASE WHEN d.has_reject THEN ' → 반려' ELSE '' END
             || CASE WHEN d.lifecycle_status ~* '(END|TERMINAT|ARCHIV)' THEN ' → 종료' ELSE '' END AS life_ko,
           CASE WHEN d.admin_direct THEN 'none'
                WHEN d.refund_proven THEN 'refunded'
                WHEN d.final_payable_minor IS NOT NULL AND d.final_payable_minor >= 0 THEN 'paid'
                ELSE 'not_proven' END AS pay_state,
           nullif(concat_ws(' · ',
                    nullif(array_to_string(d.inventory_keys, ' · '), ''),
                    CASE WHEN d.sort_order IS NOT NULL THEN 'Slide ' || (d.sort_order + 1)::text END), '') AS placement_override
      FROM delivery d
  ),
  -- ── 팝업 (platform_popup_campaigns, 당겨서 새로고침 띠 제외) ─────────────
  popup_rows AS (
    SELECT 'popup_campaign'::text AS family, c.id AS source_id, 'popup'::text AS domain, 'popup'::text AS product_key,
           'popup:campaign:' || c.id::text AS row_id,
           coalesce(nullif(btrim(c.name), ''), left(c.id::text, 8)) AS title,
           coalesce(left(c.created_by::text, 8), 'Admin') AS applicant,
           coalesce(c.end_at, c.approved_at, c.created_at) AS last_at,
           c.status AS final_ko,
           c.status AS final_en,
           CASE WHEN c.owner_request_id IS NOT NULL THEN '레거시' ELSE 'Admin 등록' END
             || ' → 결제 없음 → ' || c.status AS life_ko,
           'none'::text AS pay_state,
           'Popup surface'::text AS placement_override,
           (c.owner_request_id IS NOT NULL) AS legacy
      FROM public.platform_popup_campaigns c
     WHERE c.presentation_type IS NULL OR c.presentation_type <> 'ptr_reveal'
  ),
  -- ── 팝업 오너 신청 (platform_popup_owner_requests · 레거시) — projectPopupOwnerLegacyHistoryRow ──
  --    제목 = 신청 매장 이름(stores.store_name) — 신청 표에 제목 열이 없다.
  popup_req AS (
    SELECT r.id, r.owner_user_id, r.request_status, r.created_at, s.store_name,
           CASE WHEN lower(coalesce(r.payment_status, '')) = 'refunded' THEN 'refunded'
                WHEN lower(coalesce(r.payment_status, '')) = 'funded' THEN 'paid'
                WHEN r.price_minor IS NOT NULL AND r.price_minor >= 0 THEN 'unknown'
                ELSE 'not_proven' END AS pay
      FROM public.platform_popup_owner_requests r
      LEFT JOIN public.stores s ON s.id = r.store_id
  ),
  popup_req_rows AS (
    SELECT 'popup_request'::text AS family, q.id AS source_id, 'popup'::text AS domain, 'popup'::text AS product_key,
           'popup:owner_request:' || q.id::text AS row_id,
           coalesce(nullif(btrim(q.store_name), ''), left(q.id::text, 8)) AS title,
           left(q.owner_user_id::text, 8) AS applicant,
           q.created_at AS last_at,
           q.request_status AS final_ko,
           q.request_status AS final_en,
           '레거시 오너 신청 → '
             || CASE q.pay WHEN 'paid' THEN '결제 완료' WHEN 'refunded' THEN '환불'
                           WHEN 'not_proven' THEN '결제 증거 없음' ELSE '결제 상태 미확인' END
             || ' → ' || q.request_status AS life_ko,
           q.pay AS pay_state,
           'Popup (legacy owner)'::text AS placement_override
      FROM popup_req q
  ),
  unioned AS (
    SELECT family, source_id, domain, product_key, row_id, title, applicant, last_at,
           final_ko, final_en, life_ko, pay_state, placement_override, false AS legacy FROM boost_rows
    UNION ALL
    SELECT family, source_id, domain, product_key, row_id, title, applicant, last_at,
           final_ko, final_en, life_ko, pay_state, placement_override, false FROM feed_req_rows
    UNION ALL
    SELECT family, source_id, domain, product_key, row_id, title, applicant, last_at,
           final_ko, final_en, life_ko, pay_state, placement_override, false FROM feed_camp_rows
    UNION ALL
    SELECT family, source_id, domain, product_key, row_id, title, applicant, last_at,
           final_ko, final_en, life_ko, pay_state, placement_override, false FROM delivery_rows
    UNION ALL
    SELECT family, source_id, domain, product_key, row_id, title, applicant, last_at,
           final_ko, final_en, life_ko, pay_state, placement_override, legacy FROM popup_rows
    UNION ALL
    SELECT family, source_id, domain, product_key, row_id, title, applicant, last_at,
           final_ko, final_en, life_ko, pay_state, placement_override, true FROM popup_req_rows
  ),
  labeled AS (
    SELECT u.*,
           (pr.labels -> u.product_key ->> 'ko') || CASE WHEN u.legacy THEN ' (레거시)' ELSE '' END AS product_ko,
           (pr.labels -> u.product_key ->> 'en') || CASE WHEN u.legacy THEN ' (legacy)' ELSE '' END AS product_en,
           -- 상위노출 노출 위치 = 상품 이름 (project*HistoryRow 와 같음)
           CASE WHEN u.family = 'boost' THEN pr.labels -> u.product_key ->> 'ko' ELSE u.placement_override END AS placement_ko,
           CASE WHEN u.family = 'boost' THEN pr.labels -> u.product_key ->> 'en' ELSE u.placement_override END AS placement_en
      FROM unioned u, params pr
  ),
  filtered AS (
    SELECT l.*
      FROM labeled l, params pr
     WHERE (pr.domain IS NULL OR l.domain = pr.domain)
       AND (pr.status IS NULL
            OR (pr.status = 'refunded' AND l.pay_state = 'refunded')
            OR (pr.status <> 'refunded' AND
                lower(concat_ws(' ', l.final_ko, l.final_en, l.life_ko, l.pay_state)) ~
                  CASE pr.status
                    WHEN 'ended' THEN 'ended|종료|archiv|terminat|cancelled|취소'
                    WHEN 'rejected' THEN 'reject|반려|denied'
                    WHEN 'approved' THEN 'approv|승인|active|live|노출'
                    WHEN 'paused' THEN 'pause|제재|일시중지|sanction'
                  END))
       AND (pr.q IS NULL OR strpos(lower(concat_ws(' ',
              nullif(l.title, ''), nullif(l.product_ko, ''), nullif(l.product_en, ''), nullif(l.applicant, ''),
              l.row_id, nullif(l.placement_ko, ''), nullif(l.placement_en, ''))), pr.q) > 0)
  ),
  paged AS (
    SELECT f.family, f.source_id, f.row_id, f.last_at
      FROM filtered f
     ORDER BY f.last_at DESC NULLS LAST, f.row_id COLLATE "C" DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'family', pg.family, 'source_id', pg.source_id, 'row_id', pg.row_id,
               -- 배달 광고 실제 노출 건수 (페이지 행만 · 상한 없는 count)
               'impression_count', CASE WHEN pg.family = 'delivery' THEN (
                 SELECT count(*) FROM public.delivery_ad_impression_events e WHERE e.campaign_id = pg.source_id) END)
                       ORDER BY pg.last_at DESC NULLS LAST, pg.row_id COLLATE "C" DESC)
        FROM paged pg
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_ads_history_page(text, text, text, jsonb, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ads_history_page(text, text, text, jsonb, integer, integer)
  TO service_role;
