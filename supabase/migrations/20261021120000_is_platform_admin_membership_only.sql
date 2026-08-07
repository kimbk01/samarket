-- Admin DB authority cutover: is_platform_admin = active admin_memberships ONLY
-- Contract: Membership-only LIVE PASS (2026-08-07) unlocked this step.
-- DO NOT: drop profiles.role / is_admin · stop Grant/Revoke dual-write · rewrite older migrations.
-- Application dual-read (TS) remains CURRENT until the next Application fallback cutover.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_platform_admin(check_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT check_uid IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_memberships m
      WHERE m.user_id = check_uid
        AND m.status = 'active'
        AND m.role IN ('admin', 'super_admin')
    );
$$;

COMMENT ON FUNCTION public.is_platform_admin(uuid) IS
  'Platform Admin allow/deny for RLS/RPC. Membership-only (active admin|super_admin). No profiles.role / legacy mirror / alias fallback.';

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO service_role;

COMMIT;
