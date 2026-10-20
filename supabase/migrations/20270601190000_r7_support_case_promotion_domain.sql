-- R7 후속 — 문의 목록 거래·커뮤니티 범위의 홍보 주문 500건 상한 제거 (홍보 주문 도메인 판정 단일 정의).
-- 원인: /api/admin/support-cases?group=trade|community 가 홍보 주문 id 를 최근 500건만 모아
--       `reference_id.in.(…)` 로 걸렀다 → 주문이 500건을 넘으면 오래된 주문의 문의가 목록에서 빠지고,
--       전체 기준인 대시보드 문의 수(admin_trade_overview_promo_stats)와 어긋난다.
--       커뮤니티 대시보드 처리 대기 문의 수는 반대로 홍보 주문 참조 전부(거래 주문 포함)를 셌다.
-- 수정: 문의의 홍보 주문 도메인을 DB 에서 판정하는 계산 열 support_case_promotion_domain(support_cases)
--       — 목록(PostgREST 필터)·지표 RPC·커뮤니티 지표가 같은 정의를 쓴다. 주문 id 목록 조회 없음.
-- 대상: /admin/support-cases?group=trade · ?group=community · 거래 대시보드 문의 수 · 커뮤니티 대시보드 처리 대기 문의.
-- 권한: 계산 열은 service_role 만 EXECUTE (관리자 서버 경로). admin_trade_overview_promo_stats 권한 그대로.
-- 인덱스: point_promotion_orders 는 PK(id) 조회 · support_cases 는 기존 idx_support_cases_reference.
-- 롤백:
--   20270601182000 의 admin_trade_overview_promo_stats 본문을 다시 적용한 뒤
--   DROP FUNCTION IF EXISTS public.support_case_promotion_domain(public.support_cases);

CREATE OR REPLACE FUNCTION public.support_case_promotion_domain(s public.support_cases)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- reference_id 는 text — UUID 형식일 때만 주문 PK 로 찾는다 (형식이 아니면 캐스트 오류 대신 NULL).
  SELECT o.domain
    FROM public.point_promotion_orders o
   WHERE s.reference_type = 'POINT_PROMOTION_ORDER'
     AND o.id = CASE
                  WHEN s.reference_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  THEN s.reference_id::uuid
                END;
$$;

REVOKE ALL ON FUNCTION public.support_case_promotion_domain(public.support_cases) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_case_promotion_domain(public.support_cases) TO service_role;

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
  WITH scoped AS (
    SELECT s.status, s.created_at
      FROM public.support_cases s
     WHERE s.category = p_category
        OR s.reference_type = ANY (coalesce(p_reference_types, ARRAY[]::text[]))
        OR public.support_case_promotion_domain(s) = 'trade'
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
