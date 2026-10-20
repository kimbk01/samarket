-- R7 후속 — 거래 대시보드 「기간 내 신규 글」 카테고리·지역 분포의 5,000행 상한 제거.
-- 원인: lib/admin/trade-admin/trade-metrics.ts 가 기간 내 posts 를 최대 5,000행 읽어 메모리에서 셌고,
--       5,000행을 넘으면 분포 전체를 null(확인 불가)로 표시했다.
-- 수정: 카테고리 분포 = 이 함수(DB 집계 · 상위 N) · 지역 분포 = 기존 admin_trade_region_stats(20270601150000, 같은 지역 판정).
-- 대상: /admin/trade (GET /api/admin/trade/overview) 카테고리·지역 분포.
-- 기간: 게시물 등록일 [p_from, p_to) (null = 제한 없음) — trade-metrics range() 와 같다.
-- 정렬: 글 수 desc → trade_category_id (카테고리 없음 = 마지막) — 결정적.
-- 반환: { total(카테고리 행 수), post_total(기간 내 글 수), rows[{ id, name, count }] } — name 은 categories.name (없으면 null).
-- 권한: SECURITY DEFINER · search_path=public · PUBLIC/anon/authenticated 회수 · service_role 만 EXECUTE.
-- 롤백: DROP FUNCTION IF EXISTS public.admin_trade_category_stats(timestamptz, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.admin_trade_category_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT p.trade_category_id AS id, count(*) AS n
      FROM public.posts p
     WHERE (p_from IS NULL OR p.created_at >= p_from)
       AND (p_to IS NULL OR p.created_at < p_to)
     GROUP BY p.trade_category_id
  ),
  page AS (
    SELECT a.id, a.n, c.name
      FROM agg a
      LEFT JOIN public.categories c ON c.id = a.id
     ORDER BY a.n DESC, a.id ASC NULLS LAST
     LIMIT LEAST(100, GREATEST(1, coalesce(p_limit, 10)))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM agg),
    'post_total', (SELECT coalesce(sum(a.n), 0) FROM agg a),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', pg.id, 'name', pg.name, 'count', pg.n)
                       ORDER BY pg.n DESC, pg.id ASC NULLS LAST)
        FROM page pg
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_trade_category_stats(timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_trade_category_stats(timestamptz, timestamptz, integer) TO service_role;
