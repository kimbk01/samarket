-- R7 후속 · 거래 개요 통계 — 홍보 주문 id 500건 상한 · 원장 5,000행 상한 제거 (DB 집계)
-- 원인: lib/admin/trade-admin/trade-metrics.ts 가 거래 홍보 주문 id 를 최근 500건만 모아
--       (lib/points/promotion-ledger-related-ids.ts) ① 거래 문의 범위(홍보 주문 참조) in(...) 필터와
--       ② 포인트 원장 in(...) 필터에 쓰고, ② 는 원장 행을 최대 5,000행만 읽어 메모리에서 합산했다.
--       → 오래된 거래 홍보 주문에 걸린 문의·원장 행이 지표에서 빠질 수 있었다.
-- 수정: 이 함수 한 번으로 전체 데이터 기준 집계.
--   open_support / support_received : 거래 문의 범위 = category = p_category
--        OR reference_type = ANY(p_reference_types)
--        OR (reference_type = 'POINT_PROMOTION_ORDER' AND reference_id ∈ 거래 홍보 주문 id 전체)
--     (범위 상수는 TS lib/support/support-community-filter.ts 의 SUPPORT_TRADE_REFERENCE_TYPES ·
--      SUPPORT_TRADE_CATEGORY 를 인자로 받는다 — 규칙 정의는 TS 한 곳, 구조는 supportTradeScopeOrFilter 와 동일)
--   points_used / points_refunded : 원장 연결 규칙은 기존 admin_point_ledger_domain_page(20270601161000) 를
--     그대로 호출해 재사용 (`{order}`·`hold:{order}`·`capture:{order}`·`release:{holdId}`). 계산식은 기존 TS 와 동일:
--       used = -(Σspend + Σad_hold + Σad_hold_release) · refunded = Σrefund  (기간 = 원장 created_at [p_from, p_to))
--     p_with_points = false(요약 모드)면 null.
-- 대상 화면: /admin/trade (거래 대시보드 · GET /api/admin/trade/overview) · 통합 대시보드 거래 요약.
-- 읽기 전용. 권한: service_role 만 EXECUTE (앱 서버가 거래 관리자 가드 통과 후 호출).
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_trade_overview_promo_stats(timestamptz, timestamptz, text[], text[], text, boolean);

CREATE OR REPLACE FUNCTION public.admin_trade_overview_promo_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_open_statuses text[],
  p_reference_types text[],
  p_category text,
  p_with_points boolean
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH trade_orders AS (
    SELECT o.id::text AS id FROM public.point_promotion_orders o WHERE o.domain = 'trade'
  ),
  scoped AS (
    SELECT s.status, s.created_at
      FROM public.support_cases s
     WHERE s.category = p_category
        OR s.reference_type = ANY (coalesce(p_reference_types, ARRAY[]::text[]))
        OR (s.reference_type = 'POINT_PROMOTION_ORDER' AND s.reference_id IN (SELECT t.id FROM trade_orders t))
  ),
  pts AS (
    SELECT e.t,
           coalesce((d.page -> 'sums' ->> 'amount_in')::numeric, 0)
             + coalesce((d.page -> 'sums' ->> 'amount_out')::numeric, 0) AS net
      FROM unnest(ARRAY['spend', 'ad_hold', 'ad_hold_release', 'refund']) AS e(t)
     CROSS JOIN LATERAL (
       SELECT public.admin_point_ledger_domain_page(
                'trade', ARRAY['promotion_order'], NULL::uuid, e.t, p_from, p_to, 1, 0) AS page
     ) d
     WHERE coalesce(p_with_points, false)
  )
  SELECT jsonb_build_object(
    'open_support', (SELECT count(*) FROM scoped WHERE scoped.status = ANY (coalesce(p_open_statuses, ARRAY[]::text[]))),
    'support_received', (
      SELECT count(*) FROM scoped
       WHERE (p_from IS NULL OR scoped.created_at >= p_from)
         AND (p_to IS NULL OR scoped.created_at < p_to)
    ),
    'points_used', CASE WHEN coalesce(p_with_points, false)
      THEN (SELECT -coalesce(sum(pts.net), 0) FROM pts WHERE pts.t IN ('spend', 'ad_hold', 'ad_hold_release')) END,
    'points_refunded', CASE WHEN coalesce(p_with_points, false)
      THEN (SELECT coalesce(sum(pts.net), 0) FROM pts WHERE pts.t = 'refund') END
  );
$$;

REVOKE ALL ON FUNCTION public.admin_trade_overview_promo_stats(timestamptz, timestamptz, text[], text[], text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_trade_overview_promo_stats(timestamptz, timestamptz, text[], text[], text, boolean) TO service_role;
