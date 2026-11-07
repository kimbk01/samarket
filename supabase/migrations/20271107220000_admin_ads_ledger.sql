-- 어드민 광고 원장 (설계 docs/audit/ads-admin-ssot-design-2026-11-07.md §1-1·§1-2·§1-3·§2·§5·§7 B① · AA-14 · Owner 「설계안대로 진행」 2026-11-07)
--
-- 새 함수 2개 (기존 admin_ads_workspace_rows / admin_ads_workspace_page 는 그대로 둔다 — 웹이 원장 함수로 옮긴 뒤 옛 함수는 쓰지 않음):
--   public.admin_ads_ledger_rows(p_popup_winner_ids, p_pending_asset, p_now, p_include_deleted)
--     · 광고 종류 13종(§1-2 표 14줄 중 「이벤트(콘텐츠)」는 광고가 아니라 넣지 않는다 — 설계 그대로) 한 곳 한 행
--       trade_promotion · community_promotion · feed_member · feed_admin · feed_event · event_hero ·
--       popup_admin · popup_owner · ptr · delivery_banner · delivery_sponsored · my_banner · intro
--     · 신청↔캠페인 한 행: 피드 회원 신청 = 신청 행 1개(연결 캠페인 상태·기간·성과를 씀, 캠페인 행은 뺀다) ·
--       사장님 팝업 = 캠페인 행 1개(연결 신청 결제를 씀, 신청 행은 뺀다)
--     · 위치 키(location_key · location_target · location_target_name) · 광고주(유형·id·이름) · 결제(통화·금액·상태·환급)
--     · 상태 하나: 기간이 지난 정지 → 종료(ended_reason = 'expired') (AA-14)
--     · 삭제 표시(deleted_at · R2 20271107210000 대) 기본 제외 · p_include_deleted = true 면 status_tab 'deleted'
--       (마이 배너는 삭제 = status 'hidden' — 설계 §3-2)
--     · 성과: 표 칸이 있는 종류(피드·마이 배너)는 여기서, 이벤트 표(팝업·PTR·배달)는 페이지 함수가 그 페이지 행만 센다
--   public.admin_ads_ledger_page(...) — admin_ads_workspace_page 와 같은 모드·탭·정렬·페이지 + 도메인(trade·community·delivery·platform·mypage)
--     · 종류(p_kind) · 위치(p_location = 'KEY' 또는 'KEY|대상') · 삭제 포함(p_include_deleted) · 광고주(p_advertiser) 거름 · 행에 원장 칸 · kind_counts · location_counts
--
-- 선행: R2 마이그레이션(202711072100xx) — 7개 표 deleted_at 칸.
-- 권한: service_role 만 (기존 workspace 함수와 같다).
--
-- 롤백 SQL:
--   DROP FUNCTION IF EXISTS public.admin_ads_ledger_page(text, text, text, uuid, uuid[], text, integer, integer, text, text, text, boolean, uuid);
--   DROP FUNCTION IF EXISTS public.admin_ads_ledger_rows(uuid[], text, timestamptz, boolean);

CREATE OR REPLACE FUNCTION public.admin_ads_ledger_rows(
  p_popup_winner_ids uuid[],
  p_pending_asset text,
  p_now timestamptz,
  p_include_deleted boolean DEFAULT false
)
RETURNS TABLE(
  family text, family_ord integer, source_id uuid, item_id text, domain text, product text, source_kind text,
  entity text, ops text, status_tab text, at timestamptz, store_id uuid, popup_surfaces text,
  kind text, ledger_domain text, location_key text, location_target text, location_target_name text,
  advertiser_type text, advertiser_id uuid, advertiser_name text,
  pay_currency text, pay_amount bigint, pay_status text, refund_amount bigint,
  impressions bigint, clicks bigint, start_at timestamptz, end_at timestamptz, paused_by text,
  title text, image_url text, destination text, priority integer,
  delete_kind text, deleted boolean, linked_request_id uuid, linked_campaign_id uuid, ended_reason text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH now_ AS (SELECT coalesce(p_now, now()) AS t),
  -- 이벤트가 배포한 팝업·피드 배너 (channel_ref) → 광고주 「이벤트: 제목」
  event_refs AS (
    SELECT d.channel_ref_type, d.channel_ref_id, max(e.title) AS event_title, (array_agg(e.id ORDER BY e.updated_at DESC))[1] AS event_id
      FROM public.platform_promotion_distributions d
      JOIN public.platform_events e ON e.id = d.content_id AND d.content_type = 'platform_event'
     WHERE d.channel_ref_id IS NOT NULL
     GROUP BY d.channel_ref_type, d.channel_ref_id
  ),
  -- ── 배달 (배너·매장 홍보) ──
  delivery AS (
    SELECT x.id, x.product_kind, x.store_id, x.owner_user_id, x.updated_at, x.campaign_source, x.store_name,
           x.start_at, x.end_at, x.image_url, x.sort_order,
           coalesce(nullif(btrim(x.title), ''), nullif(btrim(x.headline), '')) AS ttl,
           coalesce(x.inventory_keys[1],
                    CASE WHEN x.product_kind <> 'banner' THEN
                      CASE WHEN lower(coalesce(p.placement, '')) = 'stores_browse' THEN 'STORES_CATEGORY_FEED' ELSE 'STORES_HOME_FEED' END
                    END) AS inv_key,
           nullif(lower(btrim(coalesce(b.browse_primary_slug, p.browse_primary_slug, ''))), '') AS browse_slug,
           b.cta_href,
           (coalesce(b.deleted_at, p.deleted_at) IS NOT NULL) AS is_deleted,
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
           END AS ops,
           CASE WHEN upper(x.lifecycle_status) LIKE 'PAUSED%' THEN lower(x.lifecycle_status) END AS paused_kind
      FROM public.admin_delivery_ad_campaign_index(p_pending_asset) x
      LEFT JOIN public.store_banner_ad_campaigns b ON x.product_kind = 'banner' AND b.id = x.id
      LEFT JOIN public.store_paid_ad_campaigns p ON x.product_kind <> 'banner' AND p.id = x.id
      CROSS JOIN now_ n
  ),
  -- 배달 결제 (비즈니스 캐시 · minor) — 확보·환급
  dpay AS (
    SELECT z.cid, sum(z.amt)::bigint AS amt, sum(z.refunded)::bigint AS refunded, bool_or(z.secured) AS secured
      FROM (
        SELECT f.application_id AS cid, f.amount_minor AS amt,
               CASE WHEN upper(f.status) = 'REFUNDED' THEN f.amount_minor ELSE 0 END AS refunded,
               upper(f.status) = 'SECURED' AS secured
          FROM public.delivery_ad_canonical_bc_fundings f WHERE f.application_id IS NOT NULL
        UNION ALL
        SELECT s.campaign_id, s.amount_minor,
               CASE WHEN upper(s.status) = 'REFUNDED' THEN s.amount_minor ELSE 0 END,
               upper(s.status) = 'SECURED'
          FROM public.delivery_ad_store_cash_spends s WHERE s.campaign_id IS NOT NULL
      ) z
     GROUP BY z.cid
  ),
  -- ── 피드 배너 회원 신청 (연결 캠페인이 있으면 캠페인 상태·기간·성과) ──
  feed_req AS (
    SELECT r.id, r.user_id, r.created_at, lower(coalesce(r.domain, 'trade')) = 'community' AS community,
           r.point_cost, c.id AS camp_id,
           coalesce(c.placement, r.placement) AS plc,
           coalesce(c.target_category_id, r.target_category_id) AS cat_id,
           coalesce(c.target_topic_slug, r.target_topic_slug) AS topic,
           CASE WHEN c.id IS NOT NULL THEN c.start_at ELSE r.start_at END AS s,
           CASE WHEN c.id IS NOT NULL THEN c.end_at ELSE r.end_at END AS e,
           CASE WHEN c.id IS NOT NULL
                THEN public.admin_ads_project_ops(coalesce(c.status, 'draft'), c.start_at, c.end_at, false, n.t)
                ELSE public.admin_ads_project_ops(r.status, r.start_at, r.end_at, false, n.t) END AS ops,
           c.impression_count, c.click_count, c.priority, c.paused_by, c.name,
           (r.deleted_at IS NOT NULL OR c.deleted_at IS NOT NULL) AS is_deleted,
           lower(coalesce(h.status, '')) AS hold_status,
           coalesce(nullif(btrim(c.destination_url), ''), nullif(btrim(r.destination_url), ''),
                    nullif(btrim(coalesce(r.destination_type, '') || ':' || coalesce(r.destination_id, '')), ':')) AS dest
      FROM public.feed_ad_requests r
      LEFT JOIN public.feed_ad_campaigns c ON c.id = r.campaign_id
      LEFT JOIN public.feed_ad_point_holds h ON h.id = r.hold_id
      CROSS JOIN now_ n
  ),
  feed_refund AS (
    SELECT substr(l.related_id, length('feed-ad-end-refund:') + 1) AS cid, sum(l.amount)::bigint AS amt
      FROM public.point_ledger l
     WHERE l.entry_type = 'ad_refund' AND l.related_id LIKE 'feed-ad-end-refund:%'
     GROUP BY 1
  ),
  -- ── 피드 배너 캠페인 (회원 신청에 연결된 캠페인은 신청 행으로 합쳐 뺀다) ──
  feed_camp AS (
    SELECT c.id, coalesce(c.start_at, c.end_at, n.t) AS at, c.name, c.domain AS c_domain, c.placement,
           c.target_category_id, c.target_topic_slug, c.start_at, c.end_at, c.priority, c.paused_by,
           c.impression_count, c.click_count, c.source, c.created_by,
           (c.deleted_at IS NOT NULL) AS is_deleted,
           coalesce(nullif(btrim(c.destination_url), ''),
                    nullif(btrim(coalesce(c.destination_type, '') || ':' || coalesce(c.destination_id, '')), ':')) AS dest,
           er.event_id, er.event_title,
           public.admin_ads_project_ops(coalesce(c.status, 'draft'), c.start_at, c.end_at, false, n.t) AS ops
      FROM public.feed_ad_campaigns c
      LEFT JOIN event_refs er ON er.channel_ref_type = 'feed_ad_campaign' AND er.channel_ref_id = c.id
      CROSS JOIN now_ n
     WHERE NOT (c.request_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.feed_ad_requests r WHERE r.id = c.request_id))
  ),
  -- ── 플랫폼 팝업 캠페인 + PTR 띠 (같은 표) ──
  popup_base AS (
    SELECT c.id, c.updated_at, c.owner_store_id, c.owner_request_id, c.start_at, c.end_at, c.status AS raw_status,
           c.name, c.priority, coalesce(nullif(btrim(c.external_url), ''), nullif(btrim(c.cta_target), '')) AS dest,
           (coalesce(c.presentation_type, '') = 'ptr_reveal') AS is_ptr,
           lower(coalesce(c.status, '')) AS st, lower(coalesce(c.approval_status, '')) AS ap,
           (c.owner_store_id IS NULL AND c.owner_request_id IS NULL) AS admin_direct,
           (c.deleted_at IS NOT NULL) AS is_deleted,
           EXISTS (
             SELECT 1 FROM public.platform_popup_creatives cr
              WHERE cr.campaign_id = c.id AND cr.status = 'ready'
                AND lower(btrim(coalesce(cr.variant, ''))) NOT IN ('tablet', 'logo')
                AND (coalesce(btrim(cr.asset_url), '') ~* '^https://'
                     OR (ltrim(btrim(coalesce(cr.asset_path, '')), '/') <> ''
                         AND strpos(cr.asset_path, '..') = 0))
           ) AS has_creative,
           (SELECT cr.asset_url FROM public.platform_popup_creatives cr
             WHERE cr.campaign_id = c.id AND cr.status = 'ready'
               AND lower(btrim(coalesce(cr.variant, ''))) NOT IN ('tablet', 'logo')
               AND coalesce(btrim(cr.asset_url), '') ~* '^https://'
             ORDER BY cr.created_at DESC LIMIT 1) AS img,
           coalesce((SELECT string_agg(s.surface, ',' ORDER BY s.surface)
                       FROM public.platform_popup_campaign_surfaces s WHERE s.campaign_id = c.id), '') AS surfaces
      FROM public.platform_popup_campaigns c
  ),
  popup_cls AS (
    SELECT p.*,
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
           CASE
             WHEN p.ap = 'rejected' OR p.st = 'rejected' THEN 'rejected'
             WHEN NOT p.admin_direct AND (p.ap = 'pending_review' OR p.st = 'pending_review') THEN 'pending'
             WHEN p.admin_direct AND (p.ap = 'pending_review' OR p.st = 'pending_review') THEN 'draft'
             ELSE public.admin_ads_project_ops(p.raw_status, p.start_at, p.end_at, false, n.t)
           END AS ops
      FROM popup_base p CROSS JOIN now_ n
  ),
  popup AS (
    SELECT pc.*,
           CASE
             WHEN pc.completeness IN ('orphan_partial', 'incomplete') THEN 'incomplete'
             WHEN pc.ops = 'live' THEN
               CASE WHEN pc.is_ptr OR pc.id = ANY (coalesce(p_popup_winner_ids, '{}'::uuid[])) THEN 'live' ELSE 'waiting' END
             WHEN pc.ops = 'scheduled' THEN 'scheduled'
             WHEN pc.ops = 'paused' THEN 'paused'
             WHEN pc.ops = 'rejected' THEN 'rejected'
             WHEN pc.ops = 'draft' THEN 'incomplete'
             WHEN pc.ops = 'pending' THEN 'pending'
             ELSE 'ended'
           END AS tab,
           rq.id AS req_id, rq.price_minor, lower(coalesce(rq.payment_status, '')) AS req_pay, rq.owner_user_id AS req_owner,
           er.event_id, er.event_title, sto.store_name
      FROM popup_cls pc
      LEFT JOIN public.platform_popup_owner_requests rq ON rq.id = pc.owner_request_id
      LEFT JOIN event_refs er ON er.channel_ref_type = 'platform_popup_campaign' AND er.channel_ref_id = pc.id
      LEFT JOIN public.stores sto ON sto.id = pc.owner_store_id
  ),
  -- ── 팝업 오너 신청 (캠페인이 만들어진 신청은 캠페인 행으로 합쳐 뺀다) ──
  popup_req AS (
    SELECT r.id, r.store_id, r.owner_user_id, r.created_at, r.price_minor, lower(coalesce(r.payment_status, '')) AS pay,
           r.requested_start_at, r.requested_end_at, coalesce(nullif(btrim(r.external_url), ''), nullif(btrim(r.cta_target), '')) AS dest,
           r.creative_asset_url, array_to_string(r.requested_surfaces, ',') AS surfaces, sto.store_name,
           public.admin_ads_project_ops(r.request_status, r.requested_start_at, r.requested_end_at, false, n.t) AS ops
      FROM public.platform_popup_owner_requests r
      LEFT JOIN public.stores sto ON sto.id = r.store_id
      CROSS JOIN now_ n
     WHERE NOT (r.admin_campaign_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.platform_popup_campaigns c WHERE c.id = r.admin_campaign_id))
  ),
  -- ── 거래·커뮤니티 상위노출 ──
  promote_b AS (
    SELECT o.id, o.created_at, o.domain, o.product_id, o.order_status, o.user_id, o.user_nickname, o.target_title,
           o.target_id, o.point_cost, o.refund_points, o.paused_by,
           (o.deleted_at IS NOT NULL) AS is_deleted,
           CASE WHEN o.start_at >= timestamptz '2000-01-01' THEN o.start_at END AS s,
           CASE WHEN o.end_at >= timestamptz '2000-01-01' THEN o.end_at END AS e0,
           o.duration_days
      FROM public.point_promotion_orders o
     WHERE o.domain IN ('trade', 'community')
  ),
  promote AS (
    SELECT b.*,
           CASE WHEN b.s IS NOT NULL AND b.e0 IS NULL AND b.duration_days >= 1
                THEN b.s + make_interval(days => b.duration_days) ELSE b.e0 END AS e,
           (SELECT lower(h.status) FROM public.promotion_point_holds h
             WHERE h.promotion_order_id = b.id ORDER BY h.created_at DESC LIMIT 1) AS hold_status
      FROM promote_b b
  ),
  promote_o AS (
    SELECT p.*, public.admin_ads_project_ops(p.order_status, p.s, p.e, true, n.t) AS ops
      FROM promote p CROSS JOIN now_ n
  ),
  -- ── 이벤트 히어로 배너 (배포 channel=banner · presentation=HERO_BANNER) ──
  event_hero AS (
    SELECT d.id, d.updated_at, d.enabled, lower(coalesce(d.status, '')) AS dst, d.config, e.id AS event_id, e.title AS event_title,
           CASE WHEN coalesce(d.config->>'startAt', '') ~ '^\d{4}-\d{2}-\d{2}' THEN (d.config->>'startAt')::timestamptz END AS s,
           CASE WHEN coalesce(d.config->>'endAt', '') ~ '^\d{4}-\d{2}-\d{2}' THEN (d.config->>'endAt')::timestamptz END AS e,
           (d.deleted_at IS NOT NULL) AS is_deleted
      FROM public.platform_promotion_distributions d
      LEFT JOIN public.platform_events e ON e.id = d.content_id AND d.content_type = 'platform_event'
     WHERE d.channel = 'banner' AND upper(coalesce(d.config->>'presentation', '')) = 'HERO_BANNER'
  ),
  event_hero_o AS (
    SELECT h.*,
           CASE WHEN NOT coalesce(h.enabled, false) OR h.dst = 'disabled' THEN 'paused'
                ELSE public.admin_ads_project_ops('active', h.s, h.e, false, n.t) END AS ops
      FROM event_hero h CROSS JOIN now_ n
  ),
  -- ── 마이 배너 (삭제 = hidden) ──
  my_banner AS (
    SELECT m.id, m.title, m.image_url, m.link_url, m.priority, m.start_at, m.end_at, m.updated_at,
           m.impression_count, m.click_count, lower(coalesce(m.status, '')) AS mst,
           (lower(coalesce(m.status, '')) = 'hidden') AS is_deleted,
           CASE
             WHEN lower(coalesce(m.status, '')) = 'draft' THEN 'draft'
             WHEN lower(coalesce(m.status, '')) = 'paused' OR (lower(coalesce(m.status, '')) = 'active' AND NOT coalesce(m.is_active, false)) THEN 'paused'
             WHEN lower(coalesce(m.status, '')) IN ('expired', 'hidden') THEN 'ended'
             ELSE public.admin_ads_project_ops('active', m.start_at, m.end_at, false, n.t)
           END AS ops
      FROM public.my_page_banners m CROSS JOIN now_ n
  ),
  -- ── 인트로 (게시본 1개 = 1행 · 지금 게시 중인 것만 노출 중) ──
  intro AS (
    SELECT p.id, p.created_at, p.created_by,
           CASE WHEN l.publication_id = p.id AND lower(coalesce(l.state, '')) = 'published' THEN 'live' ELSE 'ended' END AS ops
      FROM public.launch_intro_publications p
      LEFT JOIN public.launch_intro_live l ON l.publication_id = p.id
  ),
  unioned AS (
    -- 배달
    SELECT 'delivery'::text AS family, 1 AS family_ord, d.id AS source_id, 'delivery:' || d.id::text AS item_id,
           'delivery'::text AS domain, d.product_kind AS product,
           CASE WHEN d.campaign_source = 'DIBAY_FIRST_PARTY' THEN 'admin_direct' ELSE 'owner' END AS source_kind,
           CASE WHEN d.ops IN ('live', 'scheduled', 'paused') THEN 'execution' ELSE 'application' END AS entity,
           d.ops,
           CASE d.ops WHEN 'live' THEN 'live' WHEN 'scheduled' THEN 'scheduled' WHEN 'paused' THEN 'paused'
                      WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'rejected' THEN 'rejected'
                      ELSE 'ended' END AS status_tab,
           d.updated_at AS at, d.store_id, NULL::text AS popup_surfaces,
           CASE WHEN d.product_kind = 'banner' THEN 'delivery_banner' ELSE 'delivery_sponsored' END AS kind,
           'delivery'::text AS ledger_domain,
           d.inv_key AS location_key, d.browse_slug AS location_target,
           coalesce((SELECT sc.name FROM public.store_categories sc WHERE sc.slug = d.browse_slug LIMIT 1),
                    (SELECT tp.name FROM public.store_topics tp WHERE tp.slug = d.browse_slug LIMIT 1)) AS location_target_name,
           CASE WHEN d.campaign_source = 'DIBAY_FIRST_PARTY' THEN 'operator' ELSE 'store' END AS advertiser_type,
           CASE WHEN d.campaign_source = 'DIBAY_FIRST_PARTY' THEN NULL ELSE d.store_id END AS advertiser_id,
           CASE WHEN d.campaign_source = 'DIBAY_FIRST_PARTY' THEN NULL ELSE d.store_name END AS advertiser_name,
           CASE WHEN d.campaign_source = 'DIBAY_FIRST_PARTY' THEN 'NONE' ELSE 'BUSINESS_CASH' END AS pay_currency,
           dp.amt AS pay_amount,
           CASE WHEN d.campaign_source = 'DIBAY_FIRST_PARTY' THEN 'none'
                WHEN dp.cid IS NULL THEN 'unpaid'
                WHEN coalesce(dp.refunded, 0) > 0 AND coalesce(dp.refunded, 0) >= coalesce(dp.amt, 0) THEN 'refunded'
                WHEN coalesce(dp.refunded, 0) > 0 THEN 'partial_refund'
                ELSE 'paid' END AS pay_status,
           nullif(coalesce(dp.refunded, 0), 0) AS refund_amount,
           NULL::bigint AS impressions, NULL::bigint AS clicks,
           d.start_at, d.end_at,
           CASE WHEN d.paused_kind IS NULL THEN NULL WHEN strpos(d.paused_kind, 'system') > 0 OR strpos(d.paused_kind, 'budget') > 0 THEN 'system' ELSE 'admin' END AS paused_by,
           d.ttl AS title, d.image_url, d.cta_href AS destination, d.sort_order AS priority,
           CASE WHEN d.product_kind = 'banner' THEN 'delivery_banner' ELSE 'delivery_sponsored' END AS delete_kind,
           d.is_deleted AS deleted, NULL::uuid AS linked_request_id, NULL::uuid AS linked_campaign_id
      FROM delivery d
      LEFT JOIN dpay dp ON dp.cid = d.id
    UNION ALL
    -- 피드 회원 신청 (캠페인 합침)
    SELECT 'feed_request', 2, f.id, 'feed:' || f.id::text, 'feed',
           CASE WHEN f.community THEN 'feed_banner_community' ELSE 'feed_banner_trade' END,
           'member',
           CASE WHEN f.ops IN ('live', 'scheduled', 'paused') THEN 'execution' ELSE 'application' END,
           f.ops,
           CASE f.ops WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'scheduled' THEN 'scheduled'
                      WHEN 'live' THEN 'live' WHEN 'paused' THEN 'paused' WHEN 'rejected' THEN 'rejected'
                      ELSE 'ended' END,
           f.created_at, NULL::uuid, NULL::text,
           'feed_member',
           CASE WHEN f.community THEN 'community' ELSE 'trade' END,
           coalesce(upper(nullif(btrim(f.plc), '')), CASE WHEN f.community THEN 'COMMUNITY_HOME' ELSE 'TRADE_HOME' END),
           coalesce(nullif(btrim(f.topic), ''), nullif(btrim(f.cat_id), '')),
           coalesce((SELECT ct.name FROM public.community_topics ct WHERE ct.slug = nullif(btrim(f.topic), '') LIMIT 1),
                    (SELECT cg.name FROM public.categories cg WHERE cg.id::text = nullif(btrim(f.cat_id), '') LIMIT 1)),
           'member', f.user_id, (SELECT coalesce(nullif(btrim(pr.nickname), ''), nullif(btrim(pr.display_name), ''), nullif(btrim(pr.username), '')) FROM public.profiles pr WHERE pr.id = f.user_id),
           'POINT', f.point_cost::bigint,
           CASE WHEN f.hold_status = 'held' THEN 'held'
                WHEN f.hold_status = 'released' THEN 'refunded'
                WHEN coalesce(fr.amt, 0) > 0 THEN 'partial_refund'
                WHEN f.hold_status = 'captured' THEN 'paid'
                WHEN coalesce(f.point_cost, 0) > 0 THEN 'paid'
                ELSE 'none' END,
           CASE WHEN f.hold_status = 'released' THEN f.point_cost::bigint ELSE fr.amt END,
           f.impression_count::bigint, f.click_count::bigint,
           f.s, f.e, f.paused_by,
           coalesce(nullif(btrim(f.name), ''), nullif(btrim(f.topic), '')), NULL::text, f.dest, f.priority,
           'feed_request', f.is_deleted, f.id, f.camp_id
      FROM feed_req f
      LEFT JOIN feed_refund fr ON fr.cid = f.camp_id::text
    UNION ALL
    -- 피드 운영자 직접 · 이벤트 인라인
    SELECT 'feed_campaign', 3, c.id, 'feed_campaign:' || c.id::text, 'feed',
           CASE WHEN lower(coalesce(c.c_domain, '')) = 'community' THEN 'feed_banner_community' ELSE 'feed_banner' END,
           CASE WHEN upper(coalesce(c.source, '')) = 'MEMBER_REQUESTED' THEN 'member' ELSE 'admin_direct' END,
           CASE WHEN c.ops IN ('live', 'scheduled', 'paused') THEN 'execution' ELSE 'application' END,
           c.ops,
           CASE c.ops WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'scheduled' THEN 'scheduled'
                      WHEN 'live' THEN 'live' WHEN 'paused' THEN 'paused' WHEN 'rejected' THEN 'rejected'
                      ELSE 'ended' END,
           c.at, NULL::uuid, NULL::text,
           CASE WHEN c.event_id IS NOT NULL THEN 'feed_event'
                WHEN upper(coalesce(c.source, '')) = 'MEMBER_REQUESTED' THEN 'feed_member' ELSE 'feed_admin' END,
           CASE WHEN lower(coalesce(c.c_domain, '')) = 'community' THEN 'community' ELSE 'trade' END,
           coalesce(upper(nullif(btrim(c.placement), '')),
                    CASE WHEN lower(coalesce(c.c_domain, '')) = 'community' THEN 'COMMUNITY_HOME' ELSE 'TRADE_HOME' END),
           coalesce(nullif(btrim(c.target_topic_slug), ''), nullif(btrim(c.target_category_id), '')),
           coalesce((SELECT ct.name FROM public.community_topics ct WHERE ct.slug = nullif(btrim(c.target_topic_slug), '') LIMIT 1),
                    (SELECT cg.name FROM public.categories cg WHERE cg.id::text = nullif(btrim(c.target_category_id), '') LIMIT 1)),
           -- 신청 기록 없는 회원 신청 캠페인(MEMBER_REQUESTED · 신청 행 없음)은 광고주·결제를 알 수 없다 → unknown
           CASE WHEN c.event_id IS NOT NULL THEN 'event'
                WHEN upper(coalesce(c.source, '')) = 'MEMBER_REQUESTED' THEN 'unknown' ELSE 'operator' END,
           c.event_id,
           c.event_title,
           CASE WHEN upper(coalesce(c.source, '')) = 'MEMBER_REQUESTED' AND c.event_id IS NULL THEN 'POINT' ELSE 'NONE' END,
           NULL::bigint,
           CASE WHEN upper(coalesce(c.source, '')) = 'MEMBER_REQUESTED' AND c.event_id IS NULL THEN 'unknown' ELSE 'none' END,
           NULL::bigint,
           c.impression_count::bigint, c.click_count::bigint,
           c.start_at, c.end_at, c.paused_by,
           c.name, NULL::text, c.dest, c.priority,
           'feed_campaign', c.is_deleted, NULL::uuid, c.id
      FROM feed_camp c
    UNION ALL
    -- 팝업 캠페인 · PTR
    SELECT CASE WHEN p.is_ptr THEN 'ptr' ELSE 'popup_campaign' END,
           CASE WHEN p.is_ptr THEN 7 ELSE 4 END,
           p.id, CASE WHEN p.is_ptr THEN 'ptr:' ELSE 'popup_campaign:' END || p.id::text, 'popup',
           CASE WHEN p.is_ptr THEN 'ptr_reveal' ELSE 'platform_popup' END,
           CASE WHEN p.admin_direct THEN 'admin_direct' ELSE 'owner' END,
           CASE WHEN p.admin_direct OR p.ops IN ('live', 'scheduled', 'paused') THEN 'execution' ELSE 'application' END,
           p.ops, p.tab, p.updated_at, p.owner_store_id,
           coalesce(nullif(p.surfaces, ''), 'GLOBAL'),
           CASE WHEN p.is_ptr THEN 'ptr' WHEN p.admin_direct THEN 'popup_admin' ELSE 'popup_owner' END,
           CASE WHEN NOT p.admin_direct THEN 'delivery' ELSE 'platform' END,
           CASE WHEN p.is_ptr THEN 'PTR' ELSE 'POPUP' END,
           coalesce(nullif(p.surfaces, ''), 'GLOBAL'),
           NULL::text,
           CASE WHEN NOT p.admin_direct THEN 'store' WHEN p.event_id IS NOT NULL THEN 'event' ELSE 'operator' END,
           CASE WHEN NOT p.admin_direct THEN p.owner_store_id WHEN p.event_id IS NOT NULL THEN p.event_id END,
           CASE WHEN NOT p.admin_direct THEN p.store_name WHEN p.event_id IS NOT NULL THEN p.event_title END,
           CASE WHEN p.admin_direct THEN 'NONE' ELSE 'BUSINESS_CASH' END,
           CASE WHEN p.admin_direct THEN NULL ELSE p.price_minor::bigint END,
           CASE WHEN p.admin_direct THEN 'none'
                WHEN p.req_pay = 'refunded' THEN 'refunded'
                WHEN p.req_pay IN ('funded', 'paid', 'captured', 'secured') THEN 'paid'
                WHEN p.req_pay IN ('held', 'pending', 'reserved') THEN 'held'
                ELSE 'unpaid' END,
           CASE WHEN p.req_pay = 'refunded' THEN p.price_minor::bigint END,
           NULL::bigint, NULL::bigint,
           p.start_at, p.end_at,
           CASE WHEN p.ops = 'paused' THEN 'admin' END,
           p.name, p.img, p.dest, p.priority,
           CASE WHEN p.is_ptr THEN 'ptr' ELSE 'popup_campaign' END,
           p.is_deleted, p.req_id, p.id
      FROM popup p
    UNION ALL
    -- 상위노출
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
           o.created_at, NULL::uuid, NULL::text,
           CASE WHEN lower(o.domain) = 'community' THEN 'community_promotion' ELSE 'trade_promotion' END,
           CASE WHEN lower(o.domain) = 'community' THEN 'community' ELSE 'trade' END,
           CASE WHEN lower(o.domain) = 'community' THEN 'COMMUNITY_BOOST_TOP' ELSE 'TRADE_BOOST_TOP' END,
           o.target_id, o.target_title,
           'member', o.user_id,
           coalesce(nullif(btrim(o.user_nickname), ''), (SELECT coalesce(nullif(btrim(pr.nickname), ''), nullif(btrim(pr.display_name), ''), nullif(btrim(pr.username), '')) FROM public.profiles pr WHERE pr.id = o.user_id)),
           'POINT', o.point_cost::bigint,
           CASE WHEN o.hold_status = 'held' THEN 'held'
                WHEN o.hold_status = 'released' THEN 'refunded'
                WHEN coalesce(o.refund_points, 0) > 0 AND coalesce(o.refund_points, 0) >= coalesce(o.point_cost, 0) THEN 'refunded'
                WHEN coalesce(o.refund_points, 0) > 0 THEN 'partial_refund'
                WHEN coalesce(o.point_cost, 0) > 0 THEN 'paid'
                ELSE 'none' END,
           CASE WHEN o.hold_status = 'released' THEN o.point_cost::bigint ELSE nullif(coalesce(o.refund_points, 0), 0)::bigint END,
           NULL::bigint, NULL::bigint,
           o.s, o.e, o.paused_by,
           o.target_title, NULL::text, o.target_id, NULL::integer,
           CASE WHEN lower(o.domain) = 'community' THEN 'community_promotion' ELSE 'trade_promotion' END,
           o.is_deleted, NULL::uuid, NULL::uuid
      FROM promote_o o
    UNION ALL
    -- 사장님 팝업 신청 (캠페인 없음)
    SELECT 'popup_request', 6, q.id, 'popup:' || q.id::text, 'popup', 'platform_popup',
           'owner', 'application',
           q.ops,
           CASE q.ops WHEN 'pending' THEN 'pending' WHEN 'draft' THEN 'incomplete' WHEN 'scheduled' THEN 'scheduled'
                      WHEN 'live' THEN 'live' WHEN 'paused' THEN 'paused' WHEN 'rejected' THEN 'rejected'
                      ELSE 'ended' END,
           q.created_at, q.store_id, NULL::text,
           'popup_owner', 'delivery', 'POPUP', coalesce(nullif(q.surfaces, ''), 'GLOBAL'), NULL::text,
           'store', q.store_id, q.store_name,
           'BUSINESS_CASH', q.price_minor::bigint,
           CASE WHEN q.pay = 'refunded' THEN 'refunded'
                WHEN q.pay IN ('funded', 'paid', 'captured', 'secured') THEN 'paid'
                WHEN q.pay IN ('held', 'pending', 'reserved') THEN 'held'
                ELSE 'unpaid' END,
           CASE WHEN q.pay = 'refunded' THEN q.price_minor::bigint END,
           NULL::bigint, NULL::bigint,
           q.requested_start_at, q.requested_end_at, NULL::text,
           q.store_name, q.creative_asset_url, q.dest, NULL::integer,
           NULL::text, false, q.id, NULL::uuid
      FROM popup_req q
    UNION ALL
    -- 이벤트 히어로 배너
    SELECT 'event_hero', 8, h.id, 'event_hero:' || h.id::text, 'event_banner', 'event_hero_banner',
           'admin_direct',
           'execution',
           h.ops,
           CASE h.ops WHEN 'scheduled' THEN 'scheduled' WHEN 'live' THEN 'live' WHEN 'paused' THEN 'paused' ELSE 'ended' END,
           h.updated_at, NULL::uuid, NULL::text,
           'event_hero', 'platform', 'EVENT_HERO', upper(nullif(btrim(h.config->>'placement'), '')), NULL::text,
           'event', h.event_id, h.event_title,
           'NONE', NULL::bigint, 'none', NULL::bigint,
           NULL::bigint, NULL::bigint,
           h.s, h.e, CASE WHEN h.ops = 'paused' THEN 'admin' END,
           coalesce(nullif(btrim(h.config->>'headline'), ''), h.event_title), nullif(btrim(h.config->>'imageUrl'), ''),
           CASE WHEN h.event_id IS NOT NULL THEN '/events/' || h.event_id::text END, NULL::integer,
           'event_distribution', h.is_deleted, NULL::uuid, NULL::uuid
      FROM event_hero_o h
    UNION ALL
    -- 마이 배너
    SELECT 'my_banner', 9, m.id, 'my_banner:' || m.id::text, 'my_banner', 'my_banner',
           'admin_direct', 'execution',
           m.ops,
           CASE m.ops WHEN 'draft' THEN 'incomplete' WHEN 'scheduled' THEN 'scheduled' WHEN 'live' THEN 'live'
                      WHEN 'paused' THEN 'paused' ELSE 'ended' END,
           m.updated_at, NULL::uuid, NULL::text,
           'my_banner', 'mypage', 'MYPAGE_TOP', NULL::text, NULL::text,
           'operator', NULL::uuid, NULL::text,
           'NONE', NULL::bigint, 'none', NULL::bigint,
           m.impression_count::bigint, m.click_count::bigint,
           m.start_at, m.end_at, CASE WHEN m.ops = 'paused' THEN 'admin' END,
           m.title, m.image_url, m.link_url, m.priority,
           'my_banner', m.is_deleted, NULL::uuid, NULL::uuid
      FROM my_banner m
    UNION ALL
    -- 인트로
    SELECT 'intro', 10, i.id, 'intro:' || i.id::text, 'intro', 'launch_intro',
           'admin_direct', 'execution',
           i.ops, i.ops,
           i.created_at, NULL::uuid, NULL::text,
           'intro', 'platform', 'APP_INTRO', NULL::text, NULL::text,
           'operator', NULL::uuid, NULL::text,
           'NONE', NULL::bigint, 'none', NULL::bigint,
           NULL::bigint, NULL::bigint,
           NULL::timestamptz, NULL::timestamptz, NULL::text,
           NULL::text, NULL::text, NULL::text, NULL::integer,
           'intro', false, NULL::uuid, NULL::uuid
      FROM intro i
  )
  SELECT u.family, u.family_ord, u.source_id, u.item_id, u.domain, u.product, u.source_kind, u.entity,
         -- AA-14: 기간이 지난 정지 → 종료(기간 만료)
         CASE WHEN u.ops = 'paused' AND u.end_at IS NOT NULL AND u.end_at <= (SELECT t FROM now_) THEN 'ended' ELSE u.ops END AS ops,
         CASE WHEN u.deleted THEN 'deleted'
              WHEN u.ops = 'paused' AND u.end_at IS NOT NULL AND u.end_at <= (SELECT t FROM now_) THEN 'ended'
              ELSE u.status_tab END AS status_tab,
         u.at, u.store_id, u.popup_surfaces,
         u.kind, u.ledger_domain, u.location_key, u.location_target, u.location_target_name,
         u.advertiser_type, u.advertiser_id, u.advertiser_name,
         u.pay_currency, u.pay_amount, u.pay_status, u.refund_amount,
         u.impressions, u.clicks, u.start_at, u.end_at, u.paused_by,
         u.title, u.image_url, u.destination, u.priority,
         u.delete_kind, u.deleted, u.linked_request_id, u.linked_campaign_id,
         CASE WHEN u.ops = 'paused' AND u.end_at IS NOT NULL AND u.end_at <= (SELECT t FROM now_) THEN 'expired' END AS ended_reason
    FROM unioned u
   WHERE coalesce(p_include_deleted, false) OR NOT u.deleted;
$function$;

REVOKE ALL ON FUNCTION public.admin_ads_ledger_rows(uuid[], text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ads_ledger_rows(uuid[], text, timestamptz, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_ads_ledger_page(
  p_mode text, p_status text, p_family text, p_store_id uuid, p_popup_winner_ids uuid[], p_pending_asset text,
  p_limit integer, p_offset integer,
  p_domain text DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_include_deleted boolean DEFAULT false,
  p_advertiser uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT CASE WHEN p_mode IN ('all', 'applications', 'operations', 'history', 'boosts') THEN p_mode ELSE 'all' END AS mode,
           CASE WHEN p_status IN ('pending', 'scheduled', 'live', 'waiting', 'incomplete', 'paused', 'ended', 'rejected', 'deleted')
                THEN p_status END AS tab,
           CASE WHEN p_family IN ('promote', 'banner', 'popup', 'sponsored') THEN p_family END AS fam,
           CASE WHEN p_domain IN ('trade', 'community', 'delivery', 'platform', 'mypage') THEN p_domain END AS dom,
           nullif(btrim(coalesce(p_kind, '')), '') AS knd,
           nullif(split_part(btrim(coalesce(p_location, '')), '|', 1), '') AS loc_key,
           nullif(split_part(btrim(coalesce(p_location, '')), '|', 2), '') AS loc_target,
           LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
           LEAST(100000, GREATEST(0, coalesce(p_offset, 0))) AS off
  ),
  base AS (
    SELECT r.*, lower(r.domain) AS d, lower(coalesce(r.product, '')) AS p,
           r.domain IN ('trade_promote', 'community_promote') AS is_boost
      FROM public.admin_ads_ledger_rows(p_popup_winner_ids, p_pending_asset, now(), coalesce(p_include_deleted, false)) r
     WHERE (p_store_id IS NULL OR r.store_id = p_store_id)
       -- 문의·충전 상세 → 「이 광고주의 광고」 (회원 id · 매장 id · 이벤트 id)
       AND (p_advertiser IS NULL OR r.advertiser_id = p_advertiser)
  ),
  -- 도메인·종류·위치 거름 (위치 지도 칸 → 원장)
  scoped AS (
    SELECT b.* FROM base b, params pr
     WHERE (pr.dom IS NULL OR b.ledger_domain = pr.dom)
       AND (pr.knd IS NULL OR b.kind = pr.knd)
       AND (pr.loc_key IS NULL OR upper(coalesce(b.location_key, '')) = upper(pr.loc_key))
       AND (pr.loc_target IS NULL
            OR lower(coalesce(b.location_target, '')) = lower(pr.loc_target)
            OR (b.location_key IN ('POPUP', 'PTR') AND (',' || upper(coalesce(b.location_target, '')) || ',') LIKE ('%,' || upper(pr.loc_target) || ',%')))
  ),
  moded AS (
    SELECT s.*, m.mode
      FROM scoped s
     CROSS JOIN (VALUES ('all'), ('applications'), ('operations'), ('history'), ('boosts')) AS m(mode)
     WHERE CASE m.mode
             WHEN 'all' THEN s.status_tab <> 'deleted'
             WHEN 'boosts' THEN s.is_boost AND s.status_tab <> 'deleted'
             WHEN 'history' THEN s.status_tab IN ('ended', 'rejected', 'paused', 'deleted')
             WHEN 'operations' THEN NOT s.is_boost
               AND (s.source_kind = 'admin_direct' OR s.entity = 'execution' OR s.family IN ('popup_campaign', 'ptr'))
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
    SELECT f.*
      FROM filtered f
     ORDER BY f.at DESC NULLS LAST, f.family_ord, f.item_id COLLATE "C" DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  ),
  -- 성과 (이벤트 표 · 이 페이지 행만)
  popup_perf AS (
    SELECT e.campaign_id, count(*) FILTER (WHERE e.event_type = 'impression') AS imp,
           count(*) FILTER (WHERE e.event_type = 'click') AS clk
      FROM public.platform_popup_campaign_events e
     WHERE e.campaign_id IN (SELECT pg.source_id FROM paged pg WHERE pg.family IN ('popup_campaign', 'ptr'))
     GROUP BY e.campaign_id
  ),
  delivery_perf AS (
    SELECT pg.source_id,
           (SELECT count(*) FROM public.delivery_ad_impression_events i WHERE i.campaign_id = pg.source_id) AS imp,
           (SELECT count(*) FROM public.delivery_ad_click_events c WHERE c.campaign_id = pg.source_id) AS clk
      FROM paged pg WHERE pg.family = 'delivery'
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
     WHERE s.family = 'popup_campaign' AND s.status_tab <> 'deleted'
     GROUP BY s.popup_surfaces
  )
  SELECT jsonb_build_object(
    'ledger', true,
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'family', pg.family, 'source_id', pg.source_id, 'item_id', pg.item_id,
               'kind', pg.kind, 'ledger_domain', pg.ledger_domain, 'domain', pg.domain, 'product', pg.product,
               'source_kind', pg.source_kind, 'ops', pg.ops, 'status_tab', pg.status_tab, 'at', pg.at,
               'store_id', pg.store_id,
               'location_key', pg.location_key, 'location_target', pg.location_target,
               'location_target_name', pg.location_target_name,
               'advertiser_type', pg.advertiser_type, 'advertiser_id', pg.advertiser_id, 'advertiser_name', pg.advertiser_name,
               'pay_currency', pg.pay_currency, 'pay_amount', pg.pay_amount, 'pay_status', pg.pay_status,
               'refund_amount', pg.refund_amount,
               'impressions', coalesce(pg.impressions, pp.imp, dp.imp),
               'clicks', coalesce(pg.clicks, pp.clk, dp.clk),
               'start_at', pg.start_at, 'end_at', pg.end_at, 'paused_by', pg.paused_by,
               'title', pg.title, 'image_url', pg.image_url, 'destination', pg.destination, 'priority', pg.priority,
               'delete_kind', pg.delete_kind, 'deleted', pg.deleted,
               'linked_request_id', pg.linked_request_id, 'linked_campaign_id', pg.linked_campaign_id,
               'ended_reason', pg.ended_reason)
             ORDER BY pg.at DESC NULLS LAST, pg.family_ord, pg.item_id COLLATE "C" DESC)
        FROM paged pg
        LEFT JOIN popup_perf pp ON pg.family IN ('popup_campaign', 'ptr') AND pp.campaign_id = pg.source_id
        LEFT JOIN delivery_perf dp ON pg.family = 'delivery' AND dp.source_id = pg.source_id
    ), '[]'::jsonb),
    'summary_counts', (
      SELECT jsonb_object_agg(m.mode, coalesce((
               SELECT jsonb_object_agg(c.status_tab, c.n) FROM counts c WHERE c.mode = m.mode), '{}'::jsonb))
        FROM (VALUES ('all'), ('applications'), ('operations'), ('history'), ('boosts')) AS m(mode)
    ),
    -- 종류별 행 수 (삭제 제외 · 도메인·종류·위치 거름 반영)
    'kind_counts', coalesce((
      SELECT jsonb_object_agg(k.kind, k.n) FROM (
        SELECT s.kind, count(*) AS n FROM scoped s WHERE s.status_tab <> 'deleted' GROUP BY s.kind) k
    ), '{}'::jsonb),
    -- 위치 지도: 위치(키·대상)별 상태 수 (도메인·매장 거름만 반영 · 종류·위치 거름 무시)
    'location_counts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('location_key', l.location_key, 'location_target', l.location_target,
                                          'location_target_name', l.location_target_name, 'status_tab', l.status_tab, 'n', l.n))
        FROM (
          SELECT b.location_key, b.location_target, max(b.location_target_name) AS location_target_name, b.status_tab, count(*) AS n
            FROM base b, params pr
           WHERE (pr.dom IS NULL OR b.ledger_domain = pr.dom) AND b.status_tab <> 'deleted'
           GROUP BY b.location_key, b.location_target, b.status_tab
        ) l
    ), '[]'::jsonb),
    'queue_counts', jsonb_build_object(
      'feed_pending', CASE WHEN p_store_id IS NOT NULL THEN 0 ELSE (
        SELECT count(*) FROM base b WHERE b.family = 'feed_request' AND b.status_tab = 'pending') END,
      'trade_pending', CASE WHEN p_store_id IS NOT NULL THEN 0 ELSE (
        SELECT count(*) FROM base b WHERE b.kind = 'trade_promotion' AND b.status_tab = 'pending') END,
      'community_pending', CASE WHEN p_store_id IS NOT NULL THEN 0 ELSE (
        SELECT count(*) FROM base b WHERE b.kind = 'community_promotion' AND b.status_tab = 'pending') END
    ),
    'popup_surfaces', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'surfaces', g.surfaces, 'live_ids', g.live_ids, 'waiting_ids', g.waiting_ids,
               'incomplete', g.incomplete_n, 'scheduled', g.scheduled_n) ORDER BY g.surfaces)
        FROM popup_groups g
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.admin_ads_ledger_page(text, text, text, uuid, uuid[], text, integer, integer, text, text, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ads_ledger_page(text, text, text, uuid, uuid[], text, integer, integer, text, text, text, boolean, uuid) TO service_role;
