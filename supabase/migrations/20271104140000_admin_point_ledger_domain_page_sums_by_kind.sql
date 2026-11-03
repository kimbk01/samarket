-- 실기 A-7 FAIL (Owner 「DB 함수로 수정」 2026-11-03) — 관리자 거래·커뮤니티 포인트 원장 목록의 조건 합계를
-- 「들어온·나간」 2칸에서 칸별(충전·지급·환불·사용·회수·보류 중)로. 칸 분류는 앱(회원 포인트 화면과 같은 함수)이 하고,
-- DB 는 같은 1회 호출 안에서 종류별 합만 더 돌려준다 — R7 계약(목록·합계 = 이 함수 1회 · 행 전량 읽기·상한 없음) 유지.
-- 추가: 결과 jsonb 의 'sums_by_kind' = [{entry_type, related_type, hold_captured, amount_in, amount_out, count}]
--   hold_captured = 포인트 보류 줄(ad_hold)이 승인으로 확정된 보류(captured·charged)인지 — 확정 보류는 「사용」, 나머지 보류·해제는 「보류 중」.
--   보류 표: promotion_order → promotion_point_holds.promotion_order_id · feed_ad_request → feed_ad_point_holds.request_id ·
--            trade_post_ad → trade_ad_point_holds.trade_post_ad_id (TS 짝: lib/points/point-period-history.ts POINT_HOLD_TABLES)
-- 기존 키(total·sums·rows)와 거르기·정렬·페이지는 한 글자도 바꾸지 않는다. 데이터 변경 없음.
-- Rollback: 20270601161000_r7_point_ledger_domain_page.sql 의 함수 정의 재적용(운영 정의와 같음 — 2026-11-03 pg_get_functiondef 확인).

BEGIN;

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
  ),
  kinded AS (
    SELECT lower(btrim(coalesce(f.entry_type, ''))) AS entry_type,
           coalesce(f.related_type, '') AS related_type,
           f.amount,
           (lower(btrim(coalesce(f.entry_type, ''))) = 'ad_hold' AND CASE f.related_type
              WHEN 'promotion_order' THEN EXISTS (
                SELECT 1 FROM public.promotion_point_holds h
                 WHERE h.promotion_order_id::text = regexp_replace(coalesce(f.related_id, ''), '^hold:', '')
                   AND lower(h.status) IN ('captured', 'charged'))
              WHEN 'feed_ad_request' THEN EXISTS (
                SELECT 1 FROM public.feed_ad_point_holds h
                 WHERE h.request_id::text = regexp_replace(coalesce(f.related_id, ''), '^hold:', '')
                   AND lower(h.status) IN ('captured', 'charged'))
              WHEN 'trade_post_ad' THEN EXISTS (
                SELECT 1 FROM public.trade_ad_point_holds h
                 WHERE h.trade_post_ad_id::text = regexp_replace(coalesce(f.related_id, ''), '^hold:', '')
                   AND lower(h.status) IN ('captured', 'charged'))
              ELSE false
            END) AS hold_captured
      FROM filtered f
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
    'sums_by_kind', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'entry_type', g.entry_type,
               'related_type', g.related_type,
               'hold_captured', g.hold_captured,
               'amount_in', g.amount_in,
               'amount_out', g.amount_out,
               'count', g.n) ORDER BY g.entry_type, g.related_type, g.hold_captured)
        FROM (
          SELECT k.entry_type, k.related_type, k.hold_captured,
                 coalesce(sum(k.amount) FILTER (WHERE k.amount >= 0), 0) AS amount_in,
                 coalesce(sum(k.amount) FILTER (WHERE k.amount < 0), 0) AS amount_out,
                 count(*) AS n
            FROM kinded k
           GROUP BY k.entry_type, k.related_type, k.hold_captured
        ) g
    ), '[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.id DESC) FROM page p), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_point_ledger_domain_page(text, text[], uuid, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_point_ledger_domain_page(text, text[], uuid, text, timestamptz, timestamptz, integer, integer) TO service_role;

COMMIT;
