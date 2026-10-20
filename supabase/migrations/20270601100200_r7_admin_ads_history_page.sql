-- R7 — 광고 이력 서버 페이지 (`/admin/advertising/history`).
--
-- 목적: 광고 이력 원천(거래·커뮤니티 상위노출 `point_promotion_orders` · 피드 배너 신청 `feed_ad_requests` ·
--       Admin 직접 피드 배너 `feed_ad_campaigns` · 배달 광고(매장 홍보·배너) · 팝업 `platform_popup_campaigns`)을
--       DB 에서 한 번에 합쳐 영역·상태·검색 필터 → 정렬 → 페이지 + 정확한 total 을 돌려준다.
--       기존 로더의 원천별 고정 상한(120건 · 배달 audit 800 · 노출 5000)과 메모리 합치기를 없앤다.
-- 대상 화면: /admin/advertising/history (API GET /api/admin/advertising/history?limit&offset).
--
-- 규칙 원천 (TS 와 같은 정의 — 바꾸면 함께 바꾼다)
--   행 id·제목·신청자·노출 위치·최종 상태·이력 요약·결제 상태·마지막 이벤트 시각
--     = lib/admin/ads-history/project-history-timeline.ts (project*HistoryRow)
--   상태 필터 정규식 = lib/admin/ads-history/load-ads-history-ledger.ts (filterAdsHistoryRows)
--   상품 표시 이름 = p_product_labels (TS `ADS_CANONICAL_PRODUCTS` 를 그대로 넘긴다 — 여기서 재정의하지 않는다)
-- 기존 동작 유지: 레거시 팝업 오너 신청(`platform_popup_owner_requests`)은 기존 로더 조회 열(title)이 운영 스키마에
--   없어 항상 빠져 있었다 — 이 함수도 포함하지 않는다 (범위 밖 결함, 보고만).
-- 정렬: 마지막 이벤트 시각 DESC (NULL 마지막) → 행 id DESC (COLLATE "C") — 결정적.
-- 권한: SECURITY DEFINER · service_role 만 EXECUTE. 읽기 전용.
-- 의존: public.admin_delivery_ad_campaign_index (20270601100100).
--
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_ads_history_page(text, text, text, jsonb, integer, integer);
--   DROP INDEX IF EXISTS public.delivery_ad_audit_logs_campaign_created_idx;

-- 배달 광고 audit 를 캠페인 id 로만 찾는다 (기존 인덱스는 product_kind 가 앞).
CREATE INDEX IF NOT EXISTS delivery_ad_audit_logs_campaign_created_idx
  ON public.delivery_ad_audit_logs (campaign_id, created_at);

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
