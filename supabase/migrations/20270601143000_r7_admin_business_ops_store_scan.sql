-- R7 (delivery_b) — 매장 운영 목록 `/admin/business` 고정 조회 상한 제거
--
-- 목적: lib/admin-business/load-admin-business-list.ts 가 매장 전수(50,000 상한 루프·오류 시 조용히 중단)와 함께
--       판매 권한·수수료 신호·신고(각 10,000 상한)·최근 주문(8,000건으로 마지막 주문 추정)·이름 검색(2,000)·
--       사장님 검색(200 후보 id)·업종(200)·쪽 행 마지막 주문(500) 을 따로 읽던 경로를, 매장마다 한 행으로 합친
--       DB 한 번의 조회로 바꾼다 (상한 없음 · jsonb 한 값이라 PostgREST 행 상한과도 무관).
-- 영업 중 판정(영업시간·휴게·시간대 = lib/stores/store-auto-hours.ts resolveStoreFrontCommerceState)은 공개 매장과
--   같은 TS 계약 하나로 유지한다 (SQL 이중 구현 금지) → 이 함수는 판정 재료(is_open·business_hours_json)를 전 매장에 대해
--   빠짐없이 돌려주고, 필터·KPI(영업 중)·정렬·쪽 나누기는 TS 가 전수 위에서 한다 (누락 없음 · 성능 위험만 남음).
-- 대상 화면: /admin/business (GET /api/admin/business/ops-list) · 통합 대시보드 지표 stores.open_now (같은 로더)
-- 조회 전용.
--
-- 권한: SECURITY DEFINER · search_path=public · PUBLIC/anon/authenticated EXECUTE 회수 · service_role 만 실행.
--
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_business_ops_store_scan(text, text[], text[]);

CREATE OR REPLACE FUNCTION public.admin_business_ops_store_scan(
  p_q text,
  p_in_progress_statuses text[],
  p_delivering_statuses text[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT nullif(lower(btrim(coalesce(p_q, ''))), '') AS q
  ),
  owner_hits AS (
    SELECT p.id
      FROM public.profiles p
     CROSS JOIN params pr
     WHERE pr.q IS NOT NULL
       AND (strpos(lower(coalesce(p.display_name, '')), pr.q) > 0
            OR strpos(lower(coalesce(p.nickname, '')), pr.q) > 0
            OR strpos(lower(coalesce(p.username, '')), pr.q) > 0)
  ),
  sales AS (
    SELECT sp.store_id, sp.allowed_to_sell, sp.sales_status FROM public.store_sales_permissions sp
  ),
  settle AS (
    SELECT o.store_id,
           bool_or(o.fee_outstanding_minor > 0) AS outstanding,
           bool_or(o.adjustment_status = 'review_required') AS review_required
      FROM public.store_sale_fee_obligations o
     WHERE o.fee_outstanding_minor > 0 OR o.adjustment_status = 'review_required'
     GROUP BY o.store_id
  ),
  reports AS (
    SELECT r.store_id, count(*) AS open_count
      FROM public.store_reports r
     WHERE r.status = 'open'
     GROUP BY r.store_id
  ),
  orders AS (
    SELECT o.store_id,
           max(o.created_at) AS last_order_at,
           count(*) FILTER (WHERE o.order_status = ANY (coalesce(p_in_progress_statuses, ARRAY[]::text[]))) AS in_progress,
           count(*) FILTER (WHERE o.order_status = ANY (coalesce(p_delivering_statuses, ARRAY[]::text[]))) AS delivering
      FROM public.store_orders o
     GROUP BY o.store_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.stores),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id,
               'store_name', s.store_name,
               'is_open', s.is_open,
               'business_hours_json', s.business_hours_json,
               'approval_status', s.approval_status,
               'point_commerce_blocked', s.point_commerce_blocked,
               'owner_user_id', s.owner_user_id,
               'delivery_available', s.delivery_available,
               'region', s.region,
               'city', s.city,
               'store_category_id', s.store_category_id,
               'created_at', s.created_at,
               'has_sales_permission', sa.store_id IS NOT NULL,
               'allowed_to_sell', sa.allowed_to_sell,
               'sales_status', sa.sales_status,
               'settle_outstanding', coalesce(se.outstanding, false),
               'settle_review_required', coalesce(se.review_required, false),
               'open_report_count', coalesce(rp.open_count, 0),
               'last_order_at', od.last_order_at,
               'in_progress_order_count', coalesce(od.in_progress, 0),
               'delivering_order_count', coalesce(od.delivering, 0),
               'q_match', (
                 pr.q IS NULL
                 OR strpos(lower(s.store_name), pr.q) > 0
                 OR strpos(lower(s.slug), pr.q) > 0
                 OR s.owner_user_id IN (SELECT id FROM owner_hits)
               )
             ) ORDER BY s.id)
        FROM public.stores s
       CROSS JOIN params pr
        LEFT JOIN sales sa ON sa.store_id = s.id
        LEFT JOIN settle se ON se.store_id = s.id
        LEFT JOIN reports rp ON rp.store_id = s.id
        LEFT JOIN orders od ON od.store_id = s.id
    ), '[]'::jsonb),
    'categories', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name, c.id)
        FROM public.store_categories c
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_business_ops_store_scan(text, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_business_ops_store_scan(text, text[], text[]) TO service_role;
