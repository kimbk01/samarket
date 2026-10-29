-- DS-03 (2026-10-29 실기 확인): 배달 화면 구성 › 업종 목록 탭 「집행 배너」가 1차 업종을 골라도 전체 건수(8)로 나옴.
-- 원인: admin_delivery_ad_campaigns_page 의 업종 필터가 STORES_CATEGORY_FEED 에만 적용.
-- 변경: STORES_CATEGORY_TOP 배너에 배너 업종 대상 조건 추가. 그 밖의 본문·권한 동일(CREATE OR REPLACE).
-- 롤백: 이 파일 아래 주석의 이전 정의를 실행.
CREATE OR REPLACE FUNCTION public.admin_delivery_ad_campaigns_page(p_product text, p_view text, p_store_id uuid, p_owner_user_id uuid, p_inventory_key text, p_primary_slug text, p_sub_slug text, p_pending_asset text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                   AND (pr.sub_slug IS NULL OR coalesce(x.store_sub_slug, '') = pr.sub_slug)))
             -- DS-03: 업종 상단 배너는 배너의 업종 대상(browse_primary/secondary_slug)으로 거른다.
             --        대상이 비어 있으면 모든 업종 페이지 노출(묶음2 bannerBrowseTargetMatchesPage 와 동일).
             AND (pr.inv <> 'STORES_CATEGORY_TOP' OR pr.primary_slug IS NULL OR x.product_kind <> 'banner' OR EXISTS (
                   SELECT 1 FROM public.store_banner_ad_campaigns b
                    WHERE b.id = x.id
                      AND (b.browse_primary_slug IS NULL
                           OR (lower(b.browse_primary_slug) = pr.primary_slug
                               AND (b.browse_secondary_slug IS NULL OR pr.sub_slug IS NULL
                                    OR lower(b.browse_secondary_slug) = pr.sub_slug)))))))
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
$function$;

-- ===== 이전 정의(롤백용) =====
-- CREATE OR REPLACE FUNCTION public.admin_delivery_ad_campaigns_page(p_product text, p_view text, p_store_id uuid, p_owner_user_id uuid, p_inventory_key text, p_primary_slug text, p_sub_slug text, p_pending_asset text, p_limit integer, p_offset integer)
--  RETURNS jsonb
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
--   WITH params AS (
--     SELECT CASE WHEN p_product IN ('store_sponsored', 'banner') THEN p_product END AS product,
--            coalesce(nullif(btrim(coalesce(p_view, '')), ''), 'all') AS view,
--            nullif(btrim(coalesce(p_inventory_key, '')), '') AS inv,
--            nullif(lower(btrim(coalesce(p_primary_slug, ''))), '') AS primary_slug,
--            nullif(lower(btrim(coalesce(p_sub_slug, ''))), '') AS sub_slug,
--            LEAST(100, GREATEST(1, coalesce(p_limit, 20))) AS lim,
--            LEAST(100000, GREATEST(0, coalesce(p_offset, 0))) AS off
--   ),
--   idx AS (
--     SELECT * FROM public.admin_delivery_ad_campaign_index(p_pending_asset)
--   ),
--   -- 상품·매장·광고주 + 노출 위치(BROWSE 분류) 필터 = 요약·정책 건수의 기준
--   scoped AS (
--     SELECT x.*
--       FROM idx x, params pr
--      WHERE (pr.product IS NULL OR x.product_kind = pr.product)
--        AND (p_store_id IS NULL OR x.store_id = p_store_id)
--        AND (p_owner_user_id IS NULL OR x.owner_user_id = p_owner_user_id)
--        AND (pr.inv IS NULL OR (
--              pr.inv = ANY (x.inventory_keys)
--              AND (pr.inv <> 'STORES_CATEGORY_FEED' OR pr.primary_slug IS NULL OR (
--                    coalesce(x.store_primary_slug, '') = pr.primary_slug
--                    AND (pr.sub_slug IS NULL OR coalesce(x.store_sub_slug, '') = pr.sub_slug)))))
--   ),
--   filtered AS (
--     SELECT sc.*
--       FROM scoped sc, params pr
--      WHERE pr.view = 'all'
--         OR (pr.view = 'actionable' AND sc.list_bucket IN ('needs_creative', 'review'))
--         OR (pr.view = 'history' AND sc.list_bucket IN ('ended', 'rejected'))
--         OR sc.list_bucket = pr.view
--   ),
--   -- 오늘 요약 (전체 기준 — 필터 무관): 처리 Case 묶음 + 캠페인 목록 버킷
--   queue AS (
--     SELECT q.campaign_id, q.product_kind, q.bucket
--       FROM public.admin_delivery_ad_action_queue_rows(p_pending_asset) q
--   ),
--   today AS (
--     SELECT
--       (SELECT count(*) FROM queue WHERE bucket = 'new_application') AS new_n,
--       (SELECT count(*) FROM queue WHERE bucket = 'resubmit') AS resubmit_n,
--       (SELECT count(*) FROM queue WHERE bucket = 'needs_creative') AS needs_n,
--       (SELECT count(*) FROM queue WHERE bucket = 'awaiting_review')
--         + (SELECT count(*) FROM idx x
--             WHERE x.list_bucket = 'review'
--               AND NOT EXISTS (SELECT 1 FROM queue q WHERE q.campaign_id = x.id)) AS pending_review_n,
--       (SELECT count(*) FROM idx WHERE list_bucket = 'scheduled') AS scheduled_n,
--       (SELECT count(*) FROM idx WHERE list_bucket = 'active') AS active_n,
--       (SELECT count(*) FROM idx WHERE list_bucket = 'held') AS held_n,
--       (SELECT count(*) FROM idx WHERE lifecycle_status IN ('PAUSED_OWNER', 'PAUSED_ADMIN')) AS paused_n
--   ),
--   paged AS (
--     SELECT f.product_kind, f.id, f.updated_at
--       FROM filtered f
--      ORDER BY f.updated_at DESC, (f.product_kind = 'banner') ASC, f.id DESC
--      LIMIT (SELECT lim FROM params)
--     OFFSET (SELECT off FROM params)
--   )
--   SELECT jsonb_build_object(
--     'total', (SELECT count(*) FROM filtered),
--     'summary', (SELECT jsonb_build_object(
--         'total', count(*),
--         'review', count(*) FILTER (WHERE list_bucket = 'review'),
--         'active', count(*) FILTER (WHERE list_bucket = 'active'),
--         'held', count(*) FILTER (WHERE list_bucket = 'held'),
--         'ended', count(*) FILTER (WHERE list_bucket IN ('ended', 'rejected'))) FROM scoped),
--     'policy_counts', CASE WHEN (SELECT inv FROM params) IS NULL THEN NULL ELSE (
--       SELECT jsonb_build_object(
--         'linked', count(*),
--         'exposable_now', count(*) FILTER (WHERE lifecycle_status = 'ACTIVE'),
--         'under_review', count(*) FILTER (WHERE lifecycle_status IN ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED')))
--         FROM scoped) END,
--     'today_counts', (SELECT jsonb_build_object(
--         'new', new_n, 'resubmit', resubmit_n, 'needs_production', needs_n,
--         'pending_review', pending_review_n, 'scheduled', scheduled_n, 'active', active_n,
--         'pending_payment', held_n, 'paused', paused_n) FROM today),
--     'rows', coalesce((
--       SELECT jsonb_agg(jsonb_build_object('product_kind', pg.product_kind, 'id', pg.id)
--                        ORDER BY pg.updated_at DESC, (pg.product_kind = 'banner') ASC, pg.id DESC)
--         FROM paged pg
--     ), '[]'::jsonb)
--   );
-- $function$
