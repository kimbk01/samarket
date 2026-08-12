-- GATE 4.5 — point_charge_requests RT FIRST BREAK
-- Production paste only. Do NOT ALTER REPLICA IDENTITY. Do NOT poll-workaround.
-- Project: ckdosyydvgzqwpbwuhon
--
-- Runtime evidence (2026-08-12):
--   is_platform_admin(aaaa) = true
--   Admin JWT REST store_point_charge_requests SELECT = HIT
--   Admin JWT REST point_charge_requests SELECT = MISS (row exists)
--   Member JWT REST point_charge_requests SELECT = HIT
--   RT postgres_changes INSERT+UPDATE:
--     store_point_charge_requests Admin JWT = 1/1
--     point_charge_requests Admin JWT = 0/0
--     point_charge_requests Member owner JWT = 0/0  (SELECT works → not RLS)
--     point_charge_requests service_role KEY = 0/0
--
-- RT FIRST BREAK: table not publishing on supabase_realtime (missing ADD TABLE or pubinsert=false).
-- SECOND BREAK: point_charge_requests_admin_select not effective on prod.

-- =============================================================================
-- A. DIAGNOSTIC (read-only)
-- =============================================================================

SELECT c.relname,
       c.relreplident,
       CASE c.relreplident
         WHEN 'd' THEN 'default'
         WHEN 'n' THEN 'nothing'
         WHEN 'f' THEN 'full'
         WHEN 'i' THEN 'index'
       END AS replica_identity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('point_charge_requests', 'store_point_charge_requests');

SELECT p.pubname,
       p.puballtables,
       p.pubinsert,
       p.pubupdate,
       p.pubdelete,
       p.pubtruncate
  FROM pg_publication p
 WHERE p.pubname = 'supabase_realtime';

SELECT pt.schemaname,
       pt.tablename
  FROM pg_publication_tables pt
 WHERE pt.pubname = 'supabase_realtime'
   AND pt.tablename IN (
         'point_charge_requests',
         'store_point_charge_requests',
         'feed_ad_requests',
         'delivery_operation_alert_events'
       )
 ORDER BY pt.tablename;

SELECT pol.polname,
       pol.polcmd,
       pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr,
       rol.rolname
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN LATERAL unnest(pol.polroles) AS r(oid) ON true
  LEFT JOIN pg_roles rol ON rol.oid = r.oid
 WHERE n.nspname = 'public'
   AND c.relname = 'point_charge_requests'
 ORDER BY pol.polname, rol.rolname;

-- Expected if FIRST BREAK is publication:
--   point_charge_requests missing from pg_publication_tables
--   store_point_charge_requests present
--   supabase_realtime.pubinsert = true (publication-wide; not per-table)
-- Expected if SECOND BREAK is admin SELECT:
--   no policy named point_charge_requests_admin_select
--   OR using_expr does not call is_platform_admin

-- =============================================================================
-- B. FIX (publication + Admin SELECT only — no replica identity change)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'pcr_rt: supabase_realtime publication missing — abort';
    RETURN;
  END IF;

  IF to_regclass('public.point_charge_requests') IS NULL THEN
    RAISE NOTICE 'pcr_rt: point_charge_requests missing — abort';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'point_charge_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.point_charge_requests';
    RAISE NOTICE 'pcr_rt: ADD TABLE public.point_charge_requests';
  ELSE
    RAISE NOTICE 'pcr_rt: already in supabase_realtime — skip ADD TABLE';
  END IF;
END $$;

DROP POLICY IF EXISTS point_charge_requests_admin_select ON public.point_charge_requests;
CREATE POLICY point_charge_requests_admin_select
  ON public.point_charge_requests
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Keep existing own-row SELECT. Do not drop point_charge_requests_select_own.

-- =============================================================================
-- C. RECHECK (read-only)
-- =============================================================================

SELECT pt.tablename
  FROM pg_publication_tables pt
 WHERE pt.pubname = 'supabase_realtime'
   AND pt.tablename IN ('point_charge_requests', 'store_point_charge_requests')
 ORDER BY pt.tablename;

SELECT pol.polname, pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname = 'point_charge_requests'
   AND pol.polname = 'point_charge_requests_admin_select';
