-- R7 · 도메인별 포인트 원장 페이지 (홍보 주문 id 500건 상한 · 합계 5,000행 상한 제거)
-- 목적: /api/admin/community/points 가 홍보 주문 id 를 최근 500건만 모아 in(...) 으로 거르고, 합계를 최대 5,000행만
--       읽어 계산하던 경로를 DB 한 번의 필터·정렬·페이지·합계로 바꾼다.
-- 대상 화면: /admin/community/points (p_domain = 'community'). 거래 원장도 같은 규칙이라 p_domain 으로 재사용 가능.
-- 규칙(lib/points/promotion-ledger-related-ids.ts 와 동일): related_type='promotion_order' 원장의 related_id 형식 =
--   `{order}` · `hold:{order}` · `capture:{order}` · `release:{holdId}` — 해당 도메인 홍보 주문에 연결된 행만.
-- p_related_types: 원장 유형 목록. 'promotion_order' 가 들어 있으면 위 연결 규칙, 나머지는 related_type 일치.
-- 정렬: created_at DESC, id DESC (결정적). sums 는 같은 조건 전체 행 기준.
-- 읽기 전용. 권한: service_role 만 EXECUTE.
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_point_ledger_domain_page(text, text[], uuid, text, timestamptz, timestamptz, integer, integer);
--   DROP INDEX IF EXISTS public.idx_point_ledger_related_type_created;
--   DROP INDEX IF EXISTS public.idx_point_promotion_orders_domain_created;

CREATE INDEX IF NOT EXISTS idx_point_ledger_related_type_created
  ON public.point_ledger (related_type, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_point_promotion_orders_domain_created
  ON public.point_promotion_orders (domain, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_point_ledger_domain_page(
  p_domain text,
  p_related_types text[],
  p_user_id uuid,
  p_entry_type text,
  p_from timestamptz,
  p_to timestamptz,
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
    SELECT ARRAY(SELECT t FROM unnest(coalesce(p_related_types, ARRAY[]::text[])) t WHERE t <> 'promotion_order') AS plain,
           ('promotion_order' = ANY (coalesce(p_related_types, ARRAY[]::text[]))) AS with_promo,
           nullif(btrim(coalesce(p_entry_type, '')), '') AS entry_type,
           LEAST(100, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  promo_orders AS (
    SELECT o.id FROM public.point_promotion_orders o
     CROSS JOIN params pr
     WHERE pr.with_promo AND o.domain = p_domain
  ),
  promo_related AS (
    SELECT po.id::text AS rid FROM promo_orders po
    UNION ALL SELECT 'hold:' || po.id::text FROM promo_orders po
    UNION ALL SELECT 'capture:' || po.id::text FROM promo_orders po
    UNION ALL
    SELECT 'release:' || h.id::text FROM public.promotion_point_holds h
     WHERE h.promotion_order_id IN (SELECT po.id FROM promo_orders po)
  ),
  filtered AS (
    SELECT l.*
      FROM public.point_ledger l
     CROSS JOIN params pr
     WHERE (l.related_type = ANY (pr.plain)
            OR (pr.with_promo AND l.related_type = 'promotion_order'
                AND l.related_id IN (SELECT rid FROM promo_related)))
       AND (p_user_id IS NULL OR l.user_id = p_user_id)
       AND (pr.entry_type IS NULL OR l.entry_type = pr.entry_type)
       AND (p_from IS NULL OR l.created_at >= p_from)
       AND (p_to IS NULL OR l.created_at < p_to)
  ),
  page AS (
    SELECT f.* FROM filtered f
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'sums', (
      SELECT jsonb_build_object(
               'count', count(*),
               'amount_in', coalesce(sum(f.amount) FILTER (WHERE f.amount >= 0), 0),
               'amount_out', coalesce(sum(f.amount) FILTER (WHERE f.amount < 0), 0))
        FROM filtered f
    ),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.id DESC) FROM page p), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_point_ledger_domain_page(text, text[], uuid, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_point_ledger_domain_page(text, text[], uuid, text, timestamptz, timestamptz, integer, integer) TO service_role;
