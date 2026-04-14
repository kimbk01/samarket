-- Admin dashboard: single-round-trip KPI + summary counts +7-day UTC trend.
-- Uses public.posts (operational truth). App env POSTS_TABLE_READ=posts_masked does not apply here.
-- Requires public.admin_dashboard_avg_trust_score (20260413131000).

CREATE OR REPLACE FUNCTION public.admin_dashboard_aggregate_json(p_today_start timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_trust numeric;
  v_total_users int;
  v_banned int;
  v_susp int;
  v_warn int;
  v_active_users int;
BEGIN
  v_trust := public.admin_dashboard_avg_trust_score();

  WITH act AS (
    SELECT user_id, sanction_type
    FROM public.sanctions
    WHERE end_at IS NULL OR end_at > now()
  ),
  banned AS (
    SELECT DISTINCT user_id FROM act WHERE sanction_type = 'permanent_ban'
  ),
  susp AS (
    SELECT DISTINCT a.user_id
    FROM act a
    WHERE a.sanction_type IN ('temp_suspend', 'chat_ban')
      AND a.user_id NOT IN (SELECT user_id FROM banned)
  ),
  warn AS (
    SELECT DISTINCT a.user_id
    FROM act a
    WHERE a.sanction_type = 'warning'
      AND a.user_id NOT IN (SELECT user_id FROM banned)
      AND a.user_id NOT IN (SELECT user_id FROM susp)
  )
  SELECT
    (SELECT COUNT(*)::int FROM public.profiles),
    (SELECT COUNT(*)::int FROM banned),
    (SELECT COUNT(*)::int FROM susp),
    (SELECT COUNT(*)::int FROM warn)
  INTO v_total_users, v_banned, v_susp, v_warn;

  v_active_users := GREATEST(0, v_total_users - v_banned - v_susp - v_warn);

  RETURN jsonb_build_object(
    'totalFavorites', (SELECT COUNT(*)::int FROM public.favorites),
    'totalUsers', v_total_users,
    'newUsersToday', (SELECT COUNT(*)::int FROM public.profiles WHERE created_at >= p_today_start),
    'newProductsToday', (SELECT COUNT(*)::int FROM public.posts WHERE created_at >= p_today_start),
    'activeProducts', (
      SELECT COUNT(*)::int FROM public.posts WHERE status IN ('active', 'reserved')
    ),
    'pendingReports', (
      SELECT COUNT(*)::int FROM public.reports WHERE status IN ('pending', 'reviewing')
    ),
    'chatsToday', (
      SELECT COUNT(*)::int FROM public.product_chats WHERE last_message_at >= p_today_start
    ),
    'completedTransactions', (SELECT COUNT(*)::int FROM public.posts WHERE status = 'sold'),
    'averageTrustScore', COALESCE(round(v_trust::numeric, 1), 50::numeric),
    'productSummary', jsonb_build_object(
      'active', (SELECT COUNT(*)::int FROM public.posts WHERE status = 'active'),
      'reserved', (SELECT COUNT(*)::int FROM public.posts WHERE status = 'reserved'),
      'sold', (SELECT COUNT(*)::int FROM public.posts WHERE status = 'sold'),
      'hidden', (SELECT COUNT(*)::int FROM public.posts WHERE status = 'hidden'),
      'blinded', (SELECT COUNT(*)::int FROM public.posts WHERE status = 'blinded'),
      'deleted', (SELECT COUNT(*)::int FROM public.posts WHERE status = 'deleted')
    ),
    'reportSummary', jsonb_build_object(
      'pending', (
        SELECT COUNT(*)::int FROM public.reports WHERE status IN ('pending', 'reviewing')
      ),
      'reviewed', (
        SELECT COUNT(*)::int
        FROM public.reports
        WHERE status IN ('reviewed', 'resolved', 'sanctioned')
      ),
      'rejected', (SELECT COUNT(*)::int FROM public.reports WHERE status = 'rejected')
    ),
    'chatSummary', jsonb_build_object(
      'active', (SELECT COUNT(*)::int FROM public.product_chats WHERE room_status = 'active'),
      'blocked', (SELECT COUNT(*)::int FROM public.product_chats WHERE room_status = 'blocked'),
      'reported', (SELECT COUNT(*)::int FROM public.product_chats WHERE room_status = 'report_hold'),
      'archived', (SELECT COUNT(*)::int FROM public.product_chats WHERE room_status = 'closed')
    ),
    'userSummary', jsonb_build_object(
      'active', v_active_users,
      'warned', v_warn,
      'suspended', v_susp,
      'banned', v_banned,
      'premium', (
        SELECT COUNT(*)::int FROM public.profiles WHERE role IN ('special', 'premium')
      ),
      'admin', (
        SELECT COUNT(*)::int FROM public.profiles WHERE role IN ('admin', 'master')
      )
    )
  );
END;
$$;

COMMENT ON FUNCTION public.admin_dashboard_aggregate_json(timestamptz) IS 'Admin dashboard KPIs and summary counts in one JSON payload; uses public.posts. service_role only.';

REVOKE ALL ON FUNCTION public.admin_dashboard_aggregate_json(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_aggregate_json(timestamptz) TO service_role;


CREATE OR REPLACE FUNCTION public.admin_dashboard_trend_utc_json()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  end_d date := (now() AT TIME ZONE 'utc')::date;
  start_d date := end_d - 6;
  d date;
  arr jsonb := '[]'::jsonb;
  d_start timestamptz;
  d_end timestamptz;
  nu int;
  np int;
  nr int;
  trc int;
BEGIN
  d := start_d;
  WHILE d <= end_d LOOP
    d_start := d::timestamp AT TIME ZONE 'UTC';
    d_end := d_start + interval '1 day';
    SELECT count(*)::int INTO nu FROM public.profiles WHERE created_at >= d_start AND created_at < d_end;
    SELECT count(*)::int INTO np FROM public.posts WHERE created_at >= d_start AND created_at < d_end;
    SELECT count(*)::int INTO nr FROM public.reports WHERE created_at >= d_start AND created_at < d_end;
    SELECT count(*)::int INTO trc
    FROM public.transaction_reviews
    WHERE created_at >= d_start AND created_at < d_end;
    arr := arr || jsonb_build_array(
      jsonb_build_object(
        'date', to_char(d, 'YYYY-MM-DD'),
        'newUsers', nu,
        'newProducts', np,
        'reports', nr,
        'completedTransactions', trc
      )
    );
    d := d + 1;
  END LOOP;
  RETURN arr;
END;
$$;

COMMENT ON FUNCTION public.admin_dashboard_trend_utc_json() IS
  'Admin dashboard last 7 UTC days trend; uses public.posts. service_role only.';

REVOKE ALL ON FUNCTION public.admin_dashboard_trend_utc_json() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_trend_utc_json() TO service_role;
