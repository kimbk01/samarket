-- R7 — 배달 광고 관리 서버 페이지 (`/admin/delivery-ads/manage`).
--
-- 목적: 매장 홍보(`store_paid_ad_campaigns`)·배달 배너(`store_banner_ad_campaigns`) 두 출처를 DB 에서 합쳐
--       보기(view)·상품·매장·노출 위치 필터를 적용하고 정렬·페이지·정확한 total 을 한 번에 돌려준다.
--       기존 경로의 고정 상한(목록 limit 200·요약 limit 500·처리 Case limit 100 후 결제 필터)을 없앤다.
-- 대상 화면: /admin/delivery-ads/manage (API GET /api/admin/delivery-ads?view=…&limit&offset ·
--            GET /api/admin/delivery-ads/action-queue?limit&offset).
--
-- 생성 객체
--   1. admin_delivery_ad_campaign_index(p_pending_asset) — 두 출처 합친 읽기 전용 행 집합 (목록 버킷 포함).
--      목록 버킷 규칙 = `lifecycleToAdminListBucket` + 배너 제작 필요(`isAdminBannerNeedsCreativeProduction`).
--      R7 광고 이력·광고 작업 화면 RPC 도 이 함수를 재사용한다.
--   2. admin_delivery_ad_action_queue_rows(p_pending_asset) — WAITING_ADMIN 운영 Case 중 결제 확인(FUNDED·디바이 직접)
--      행 + 표시 묶음(`mapAdminDeliveryAdActionQueuePresentation` 과 같은 규칙).
--      admin_delivery_ad_action_queue_page(...) — 위 행의 정렬·페이지 + 정확한 total
--      (`deliveryAdAdminQueueFundingAllowsIntake` 와 같은 규칙 — 페이지를 자른 뒤 결제 필터하지 않는다).
--   3. admin_delivery_ad_campaigns_page(...) — 목록 페이지 + total + summary + policy_counts + today_counts
--      (today_counts = `aggregateAdminHubTodayCounts` 와 같은 규칙, 전체 기준).
-- 정렬: 목록 updated_at DESC → 상품(store_sponsored 먼저) → id DESC · 처리 Case updated_at DESC → id DESC (결정적).
-- 권한: 모두 SECURITY DEFINER · service_role 만 EXECUTE. 읽기 전용 (금액·상태 변경 없음).
--
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_delivery_ad_action_queue_page(text, text, integer, integer);
--   DROP FUNCTION IF EXISTS public.admin_delivery_ad_action_queue_rows(text);
--   DROP FUNCTION IF EXISTS public.admin_delivery_ad_campaigns_page(text, text, uuid, uuid, text, text, text, text, integer, integer);
--   DROP FUNCTION IF EXISTS public.admin_delivery_ad_campaign_index(text);
--   DROP INDEX IF EXISTS public.store_paid_ad_campaigns_updated_id_idx;
--   DROP INDEX IF EXISTS public.store_banner_ad_campaigns_updated_id_idx;

CREATE INDEX IF NOT EXISTS store_paid_ad_campaigns_updated_id_idx
  ON public.store_paid_ad_campaigns (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS store_banner_ad_campaigns_updated_id_idx
  ON public.store_banner_ad_campaigns (updated_at DESC, id DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 두 출처 합친 행 집합
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_delivery_ad_campaign_index(p_pending_asset text)
RETURNS TABLE (
  product_kind text,
  id uuid,
  store_id uuid,
  owner_user_id uuid,
  lifecycle_status text,
  review_status text,
  review_notes text,
  title text,
  headline text,
  image_url text,
  campaign_source text,
  start_at timestamptz,
  end_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  inventory_keys text[],
  store_name text,
  store_primary_slug text,
  store_sub_slug text,
  list_bucket text,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH camp AS (
    SELECT 'store_sponsored'::text AS product_kind, c.id, c.store_id, c.owner_user_id,
           coalesce(c.lifecycle_status, 'DRAFT') AS lifecycle_status, c.review_status, c.review_notes,
           c.title, c.headline, c.image_url, coalesce(c.campaign_source, 'OWNER_PAID') AS campaign_source,
           c.start_at, c.end_at, c.submitted_at, c.created_at, c.updated_at,
           ARRAY(SELECT i.key FROM public.delivery_store_sponsored_campaign_inventories ci
                   JOIN public.delivery_ad_inventories i ON i.id = ci.inventory_id
                  WHERE ci.campaign_id = c.id ORDER BY ci.priority, ci.created_at, i.key) AS inventory_keys,
           NULL::integer AS sort_order
      FROM public.store_paid_ad_campaigns c
    UNION ALL
    SELECT 'banner'::text, c.id, c.store_id, c.owner_user_id,
           coalesce(c.lifecycle_status, 'DRAFT'), c.review_status, c.review_notes,
           c.title, c.subtitle, c.image_url, coalesce(c.campaign_source, 'OWNER_PAID'),
           c.start_at, c.end_at, c.submitted_at, c.created_at, c.updated_at,
           ARRAY(SELECT i.key FROM public.delivery_banner_campaign_inventories ci
                   JOIN public.delivery_ad_inventories i ON i.id = ci.inventory_id
                  WHERE ci.campaign_id = c.id ORDER BY ci.priority, ci.created_at, i.key),
           c.sort_order
      FROM public.store_banner_ad_campaigns c
  )
  SELECT camp.product_kind, camp.id, camp.store_id, camp.owner_user_id, camp.lifecycle_status,
         camp.review_status, camp.review_notes, camp.title, camp.headline, camp.image_url,
         camp.campaign_source, camp.start_at, camp.end_at, camp.submitted_at, camp.created_at,
         camp.updated_at, camp.inventory_keys, s.store_name,
         nullif(lower(btrim(sc.slug)), '') AS store_primary_slug,
         nullif(lower(btrim(st.slug)), '') AS store_sub_slug,
         CASE
           -- 배너 소재 제작 필요 (비어 있음·제작 대기 placeholder)
           WHEN camp.product_kind = 'banner'
                AND (nullif(btrim(coalesce(camp.image_url, '')), '') IS NULL
                     OR btrim(camp.image_url) = p_pending_asset) THEN 'needs_creative'
           WHEN camp.lifecycle_status IN ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED') THEN 'review'
           WHEN camp.lifecycle_status IN ('APPROVED', 'SCHEDULED') THEN 'scheduled'
           WHEN camp.lifecycle_status = 'ACTIVE' THEN 'active'
           WHEN camp.lifecycle_status IN ('PAUSED_ADMIN', 'PAUSED_OWNER') THEN 'held'
           WHEN camp.lifecycle_status IN ('ENDED', 'TERMINATED', 'ARCHIVED', 'EXHAUSTED') THEN 'ended'
           WHEN camp.lifecycle_status = 'REJECTED' THEN 'rejected'
           ELSE NULL
         END AS list_bucket,
         camp.sort_order
    FROM camp
    LEFT JOIN public.stores s ON s.id = camp.store_id
    LEFT JOIN public.store_categories sc ON sc.id = s.store_category_id
    LEFT JOIN public.store_topics st ON st.id = s.store_topic_id;
$$;

REVOKE ALL ON FUNCTION public.admin_delivery_ad_campaign_index(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivery_ad_campaign_index(text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 처리 Case (WAITING_ADMIN) — 결제 확인 행 + 표시 묶음
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_delivery_ad_action_queue_rows(p_pending_asset text)
RETURNS TABLE (
  case_id uuid,
  product_kind text,
  campaign_id uuid,
  owner_user_id uuid,
  updated_at timestamptz,
  funding_status text,
  bucket text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cases AS (
    SELECT oc.id AS case_id, oc.product_kind,
           CASE WHEN oc.product_kind = 'store_sponsored' THEN oc.store_sponsored_campaign_id
                ELSE oc.banner_campaign_id END AS campaign_id,
           oc.owner_user_id, oc.updated_at
      FROM public.delivery_ad_operations_cases oc
     WHERE oc.status = 'WAITING_ADMIN'
       AND oc.product_kind IN ('store_sponsored', 'banner')
  ),
  joined AS (
    SELECT c.*,
           coalesce(sp.lifecycle_status, bn.lifecycle_status) AS lifecycle_status,
           coalesce(sp.review_notes, bn.review_notes) AS review_notes,
           coalesce(sp.campaign_source, bn.campaign_source) AS campaign_source,
           bn.image_url AS banner_image_url,
           CASE f.status WHEN 'SECURED' THEN 'FUNDED' WHEN 'REFUNDED' THEN 'REFUNDED' ELSE 'UNFUNDED' END AS funding_status
      FROM cases c
      LEFT JOIN public.store_paid_ad_campaigns sp
        ON c.product_kind = 'store_sponsored' AND sp.id = c.campaign_id
      LEFT JOIN public.store_banner_ad_campaigns bn
        ON c.product_kind = 'banner' AND bn.id = c.campaign_id
      LEFT JOIN public.delivery_ad_canonical_bc_fundings f
        ON f.product_kind = c.product_kind AND f.application_id = c.campaign_id
     WHERE c.campaign_id IS NOT NULL
  )
  SELECT j.case_id, j.product_kind, j.campaign_id, j.owner_user_id, j.updated_at, j.funding_status,
         CASE
           WHEN j.product_kind = 'banner'
                AND (nullif(btrim(coalesce(j.banner_image_url, '')), '') IS NULL
                     OR btrim(j.banner_image_url) = p_pending_asset) THEN 'needs_creative'
           WHEN btrim(coalesce(j.lifecycle_status, '')) = 'SUBMITTED'
                AND btrim(coalesce(j.review_notes, '')) <> '' THEN 'resubmit'
           WHEN btrim(coalesce(j.lifecycle_status, '')) = 'SUBMITTED' THEN 'new_application'
           ELSE 'awaiting_review'
         END AS bucket
    FROM joined j
   -- 결제 확인: 디바이 직접 등록은 항상 · 광고주 유료는 FUNDED 만 (`isDeliveryAdFundingReadyForGoLive`)
   WHERE btrim(coalesce(j.campaign_source, 'OWNER_PAID')) = 'DIBAY_FIRST_PARTY'
      OR j.funding_status = 'FUNDED';
$$;

REVOKE ALL ON FUNCTION public.admin_delivery_ad_action_queue_rows(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivery_ad_action_queue_rows(text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_delivery_ad_action_queue_page(
  p_product_kind text,
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
  WITH rows_all AS (
    SELECT q.*
      FROM public.admin_delivery_ad_action_queue_rows(p_pending_asset) q
     WHERE p_product_kind IS NULL OR p_product_kind NOT IN ('store_sponsored', 'banner')
        OR q.product_kind = p_product_kind
  ),
  paged AS (
    SELECT * FROM rows_all
     ORDER BY updated_at DESC, case_id DESC
     LIMIT LEAST(100, GREATEST(1, coalesce(p_limit, 50)))
    OFFSET LEAST(100000, GREATEST(0, coalesce(p_offset, 0)))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM rows_all),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'case_id', case_id, 'product_kind', product_kind, 'campaign_id', campaign_id,
               'owner_user_id', owner_user_id, 'updated_at', updated_at, 'funding_status', funding_status)
             ORDER BY updated_at DESC, case_id DESC)
        FROM paged
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_delivery_ad_action_queue_page(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivery_ad_action_queue_page(text, text, integer, integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 배달 광고 목록 페이지
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_delivery_ad_campaigns_page(
  p_product text,
  p_view text,
  p_store_id uuid,
  p_owner_user_id uuid,
  p_inventory_key text,
  p_primary_slug text,
  p_sub_slug text,
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
    SELECT CASE WHEN p_product IN ('store_sponsored', 'banner') THEN p_product END AS product,
           coalesce(nullif(btrim(coalesce(p_view, '')), ''), 'all') AS view,
           nullif(btrim(coalesce(p_inventory_key, '')), '') AS inv,
           nullif(lower(btrim(coalesce(p_primary_slug, ''))), '') AS primary_slug,
           nullif(lower(btrim(coalesce(p_sub_slug, ''))), '') AS sub_slug,
           LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
           LEAST(100000, GREATEST(0, coalesce(p_offset, 0))) AS off
  ),
  idx AS (
    SELECT * FROM public.admin_delivery_ad_campaign_index(p_pending_asset)
  ),
  -- 상품·매장·광고주 + 노출 위치(BROWSE 분류) 필터 = 요약·정책 건수의 기준
  scoped AS (
    SELECT x.*
      FROM idx x, params pr
     WHERE (pr.product IS NULL OR x.product_kind = pr.product)
       AND (p_store_id IS NULL OR x.store_id = p_store_id)
       AND (p_owner_user_id IS NULL OR x.owner_user_id = p_owner_user_id)
       AND (pr.inv IS NULL OR (
             pr.inv = ANY (x.inventory_keys)
             AND (pr.inv <> 'STORES_CATEGORY_FEED' OR pr.primary_slug IS NULL OR (
                   coalesce(x.store_primary_slug, '') = pr.primary_slug
                   AND (pr.sub_slug IS NULL OR coalesce(x.store_sub_slug, '') = pr.sub_slug)))))
  ),
  filtered AS (
    SELECT sc.*
      FROM scoped sc, params pr
     WHERE pr.view = 'all'
        OR (pr.view = 'actionable' AND sc.list_bucket IN ('needs_creative', 'review'))
        OR (pr.view = 'history' AND sc.list_bucket IN ('ended', 'rejected'))
        OR sc.list_bucket = pr.view
  ),
  -- 오늘 요약 (전체 기준 — 필터 무관): 처리 Case 묶음 + 캠페인 목록 버킷
  queue AS (
    SELECT q.campaign_id, q.product_kind, q.bucket
      FROM public.admin_delivery_ad_action_queue_rows(p_pending_asset) q
  ),
  today AS (
    SELECT
      (SELECT count(*) FROM queue WHERE bucket = 'new_application') AS new_n,
      (SELECT count(*) FROM queue WHERE bucket = 'resubmit') AS resubmit_n,
      (SELECT count(*) FROM queue WHERE bucket = 'needs_creative') AS needs_n,
      (SELECT count(*) FROM queue WHERE bucket = 'awaiting_review')
        + (SELECT count(*) FROM idx x
            WHERE x.list_bucket = 'review'
              AND NOT EXISTS (SELECT 1 FROM queue q WHERE q.campaign_id = x.id)) AS pending_review_n,
      (SELECT count(*) FROM idx WHERE list_bucket = 'scheduled') AS scheduled_n,
      (SELECT count(*) FROM idx WHERE list_bucket = 'active') AS active_n,
      (SELECT count(*) FROM idx WHERE list_bucket = 'held') AS held_n,
      (SELECT count(*) FROM idx WHERE lifecycle_status IN ('PAUSED_OWNER', 'PAUSED_ADMIN')) AS paused_n
  ),
  paged AS (
    SELECT f.product_kind, f.id, f.updated_at
      FROM filtered f
     ORDER BY f.updated_at DESC, (f.product_kind = 'banner') ASC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'summary', (SELECT jsonb_build_object(
        'total', count(*),
        'review', count(*) FILTER (WHERE list_bucket = 'review'),
        'active', count(*) FILTER (WHERE list_bucket = 'active'),
        'held', count(*) FILTER (WHERE list_bucket = 'held'),
        'ended', count(*) FILTER (WHERE list_bucket IN ('ended', 'rejected'))) FROM scoped),
    'policy_counts', CASE WHEN (SELECT inv FROM params) IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object(
        'linked', count(*),
        'exposable_now', count(*) FILTER (WHERE lifecycle_status = 'ACTIVE'),
        'under_review', count(*) FILTER (WHERE lifecycle_status IN ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED')))
        FROM scoped) END,
    'today_counts', (SELECT jsonb_build_object(
        'new', new_n, 'resubmit', resubmit_n, 'needs_production', needs_n,
        'pending_review', pending_review_n, 'scheduled', scheduled_n, 'active', active_n,
        'pending_payment', held_n, 'paused', paused_n) FROM today),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('product_kind', pg.product_kind, 'id', pg.id)
                       ORDER BY pg.updated_at DESC, (pg.product_kind = 'banner') ASC, pg.id DESC)
        FROM paged pg
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_delivery_ad_campaigns_page(text, text, uuid, uuid, text, text, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivery_ad_campaigns_page(text, text, uuid, uuid, text, text, text, text, integer, integer)
  TO service_role;
