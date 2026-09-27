-- Supabase Security Advisor — rls_disabled_in_public close
-- Project: ckdosyydvgzqwpbwuhon
-- Table: public.admin_banner_change_logs
--
-- Live advisor (2026-09-27): public.admin_banner_change_logs is exposed
-- to PostgREST with RLS off. The table is admin audit-only and is written
-- only from /api/admin/banners* via tryCreateSupabaseServiceClient().
--
-- Harden (same pattern as 20270120120000_security_lints_rls_disabled_in_public_close):
--   ENABLE + FORCE RLS
--   REVOKE ALL from PUBLIC, anon, authenticated
--   GRANT ALL to service_role
--   No client policies (service_role bypasses RLS)

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.admin_banner_change_logs') IS NULL THEN
    RAISE EXCEPTION
      'admin_banner_change_logs missing — refuse rls_disabled close';
  END IF;

  ALTER TABLE public.admin_banner_change_logs
    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.admin_banner_change_logs
    FORCE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE public.admin_banner_change_logs
    FROM PUBLIC, anon, authenticated;

  GRANT ALL ON TABLE public.admin_banner_change_logs
    TO service_role;

  COMMENT ON TABLE public.admin_banner_change_logs IS
    'Admin banner audit log. RLS on; service_role API only.';
END $$;

COMMIT;
