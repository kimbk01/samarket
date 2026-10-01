-- R6-A1 — admin_staff_permissions SELECT: membership SSOT (not profiles.is_admin)
-- Repair regression introduced by 20270406120000_admin_staff_permissions_jsonb_canonical
-- which used `profiles.is_admin = true` instead of canonical platform admin authority.
--
-- Canonical helper: public.is_platform_admin(auth.uid())
--   → INVOKER shim → internal.is_platform_admin (SECURITY DEFINER)
--   → active admin_memberships role IN ('admin','super_admin')
--
-- DO NOT: mutate profiles · mutate admin_memberships · drop columns · rewrite history

BEGIN;

-- Idempotent: drop known policy names then recreate membership-only SELECT.
DROP POLICY IF EXISTS admin_staff_permissions_select_admin
  ON public.admin_staff_permissions;

CREATE POLICY admin_staff_permissions_select_admin
  ON public.admin_staff_permissions
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

COMMENT ON POLICY admin_staff_permissions_select_admin ON public.admin_staff_permissions IS
  'R6: SELECT allowed only via public.is_platform_admin (active admin_memberships). Legacy profile privilege mirrors excluded.';

COMMIT;
