-- R7 · 포인트 충전 신청 검색 (닉네임 후보 200명 상한 제거)
-- 목적: /api/admin/point-charges 공용 처리(lib/admin/shared-handlers/admin-point-charges-list.ts)가 닉네임 검색 시
--       일치 회원 id 를 200명까지만 모아 user_id in(...) 으로 거르던 경로를 DB 한 번의 필터·정렬·페이지로 바꾼다.
--       (검색어가 없거나 UUID 검색이면 라우트의 기존 PostgREST 경로 그대로 — 이 함수는 텍스트 검색에서만 쓴다.)
-- 대상 화면: /admin/point-charges · 거래 포인트 충전(/api/admin/trade/point-charges) · 커뮤니티 포인트 충전 화면 (같은 처리 공유)
-- 검색: depositor_name ILIKE p_q_pattern OR 신청 회원 닉네임 ILIKE p_q_pattern (TS 가 이스케이프한 '%…%').
-- 반환: { total, ids } — 현재 페이지 신청 id(정렬 순서). 정렬: requested_at DESC, id DESC (기존과 같음).
-- 읽기 전용. 권한: service_role 만 EXECUTE.
-- 롤백: DROP FUNCTION IF EXISTS public.admin_point_charge_requests_search_page(text[], text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_point_charge_requests_search_page(
  p_statuses text[],
  p_q_pattern text,
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
    SELECT nullif(coalesce(p_q_pattern, ''), '') AS q,
           LEAST(200, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  filtered AS (
    SELECT r.id, r.requested_at
      FROM public.point_charge_requests r
     CROSS JOIN params pr
     WHERE (p_statuses IS NULL OR r.request_status = ANY (p_statuses))
       AND (pr.q IS NULL
            OR r.depositor_name ILIKE pr.q
            OR r.user_id IN (SELECT p.id FROM public.profiles p WHERE p.nickname ILIKE pr.q))
  ),
  page AS (
    SELECT f.id, f.requested_at FROM filtered f
     ORDER BY f.requested_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'ids', coalesce((SELECT jsonb_agg(p.id ORDER BY p.requested_at DESC, p.id DESC) FROM page p), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_point_charge_requests_search_page(text[], text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_point_charge_requests_search_page(text[], text, integer, integer) TO service_role;
