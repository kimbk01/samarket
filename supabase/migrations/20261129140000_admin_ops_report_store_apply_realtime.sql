-- P0-D: AdminOps realtime wake-up for reports + store apply.
-- Publication ADD TABLE only when MISSING. RLS admin SELECT only when table already has RLS enabled.

BEGIN;

DO $$
DECLARE
  v_rls boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'admin_ops_report_store_apply_rt: supabase_realtime publication missing — skip ADD TABLE';
    RETURN;
  END IF;

  IF to_regclass('public.reports') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'reports'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reports';
  END IF;

  IF to_regclass('public.store_reports') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'store_reports'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.store_reports';
  END IF;

  IF to_regclass('public.community_reports') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'community_reports'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.community_reports';
  END IF;

  IF to_regclass('public.stores') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'stores'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.stores';
  END IF;
END $$;

-- Minimal admin SELECT for RT when RLS is already enabled on the table.
DO $$
DECLARE
  v_rls boolean;
BEGIN
  IF to_regclass('public.reports') IS NOT NULL THEN
    SELECT c.relrowsecurity INTO v_rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'reports';
    IF v_rls AND NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'reports_admin_select'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY reports_admin_select ON public.reports
          FOR SELECT TO authenticated
          USING (public.is_platform_admin(auth.uid()))
      $pol$;
    END IF;
  END IF;

  IF to_regclass('public.store_reports') IS NOT NULL THEN
    SELECT c.relrowsecurity INTO v_rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'store_reports';
    IF v_rls AND NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'store_reports' AND policyname = 'store_reports_admin_select'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY store_reports_admin_select ON public.store_reports
          FOR SELECT TO authenticated
          USING (public.is_platform_admin(auth.uid()))
      $pol$;
    END IF;
  END IF;

  IF to_regclass('public.community_reports') IS NOT NULL THEN
    SELECT c.relrowsecurity INTO v_rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'community_reports';
    IF v_rls AND NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'community_reports' AND policyname = 'community_reports_admin_select'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY community_reports_admin_select ON public.community_reports
          FOR SELECT TO authenticated
          USING (public.is_platform_admin(auth.uid()))
      $pol$;
    END IF;
  END IF;

  IF to_regclass('public.stores') IS NOT NULL THEN
    SELECT c.relrowsecurity INTO v_rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'stores';
    IF v_rls AND NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'stores' AND policyname = 'stores_admin_select'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY stores_admin_select ON public.stores
          FOR SELECT TO authenticated
          USING (public.is_platform_admin(auth.uid()))
      $pol$;
    END IF;
  END IF;
END $$;

COMMIT;
