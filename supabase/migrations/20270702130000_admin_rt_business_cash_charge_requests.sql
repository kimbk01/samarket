-- N-13 (docs/audit/notification-system-full-audit-2026-10-27.md)
-- Admin Action Queue `cash_charges` is RT_REQUIRED + soundEligible (lib/admin/admin-action-queue-registry.ts)
-- but `business_cash_charge_requests` was not in supabase_realtime and had no Admin SELECT policy,
-- so other admins/tabs only saw new or handled requests after the 75s poll.
-- Same pattern as section B of 20261028120000_global_notification_ssot_owner_admin.sql.
-- Rollback: ALTER PUBLICATION supabase_realtime DROP TABLE public.business_cash_charge_requests;
--           DROP POLICY business_cash_charge_requests_admin_select ON public.business_cash_charge_requests;

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'admin_rt: supabase_realtime publication missing — skip ADD TABLE';
    RETURN;
  END IF;

  IF to_regclass('public.business_cash_charge_requests') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'business_cash_charge_requests'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.business_cash_charge_requests';
  END IF;
END $$;

-- Tight Admin SELECT for RT (authenticated + is_platform_admin only)
DROP POLICY IF EXISTS business_cash_charge_requests_admin_select ON public.business_cash_charge_requests;
CREATE POLICY business_cash_charge_requests_admin_select
  ON public.business_cash_charge_requests
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

COMMIT;
