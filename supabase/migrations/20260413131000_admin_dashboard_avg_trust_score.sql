-- 관리자 대시보드: 평균 신뢰도 — 전체 profiles 행을 앱으로 가져오지 않고 DB에서 집계
CREATE OR REPLACE FUNCTION public.admin_dashboard_avg_trust_score()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COUNT(*) = 0 THEN 50::numeric
    ELSE ROUND(AVG(trust_score)::numeric, 1)
  END
  FROM public.profiles;
$$;

COMMENT ON FUNCTION public.admin_dashboard_avg_trust_score() IS 'Admin stats: average trust_score; callable with service role from API.';

REVOKE ALL ON FUNCTION public.admin_dashboard_avg_trust_score() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_avg_trust_score() TO service_role;
