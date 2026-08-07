-- PHASE E.1 — Admin Membership SSOT (additive)
-- Contract: docs/dibay-member-auth-phase-d-structure-design.md §1
-- Dual-read window: privilege may still use profiles.role until membership-only cutover.
-- DO NOT drop profiles.role in this migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'super_admin')),
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),
  admin_tier text NULL CHECK (admin_tier IS NULL OR admin_tier IN ('operator', 'manager')),
  granted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  granted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz NULL,
  revoked_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason text NULL,
  bootstrap_seed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.admin_memberships IS
  'Platform Admin Membership SSOT (TARGET). PHASE E dual-read with profiles.role until cutover.';

-- At most one active membership per person
CREATE UNIQUE INDEX IF NOT EXISTS admin_memberships_one_active_per_user_idx
  ON public.admin_memberships (user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS admin_memberships_user_status_idx
  ON public.admin_memberships (user_id, status);

CREATE INDEX IF NOT EXISTS admin_memberships_role_active_idx
  ON public.admin_memberships (role)
  WHERE status = 'active';

ALTER TABLE public.admin_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_memberships_select_admin ON public.admin_memberships;
CREATE POLICY admin_memberships_select_admin ON public.admin_memberships
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

-- service_role / server use service key; no broad authenticated write policies

-- Ensure transitional profiles.admin_tier exists (older envs may lack 20260614120000)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_tier text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_admin_tier_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_admin_tier_check
      CHECK (admin_tier IS NULL OR admin_tier IN ('operator', 'manager'));
  END IF;
END $$;

-- Backfill from transitional profiles.role
INSERT INTO public.admin_memberships (
  user_id,
  role,
  status,
  admin_tier,
  granted_at,
  bootstrap_seed,
  created_at,
  updated_at
)
SELECT
  p.id,
  CASE
    WHEN lower(COALESCE(p.role, '')) IN ('master', 'super_admin') THEN 'super_admin'
    ELSE 'admin'
  END,
  'active',
  CASE
    WHEN lower(COALESCE(p.role, '')) IN ('master', 'super_admin') THEN NULL
    WHEN lower(COALESCE(p.admin_tier, '')) = 'manager' THEN 'manager'
    WHEN lower(COALESCE(p.admin_tier, '')) = 'operator' THEN 'operator'
    ELSE 'operator'
  END,
  COALESCE(p.created_at, timezone('utc', now())),
  false,
  timezone('utc', now()),
  timezone('utc', now())
FROM public.profiles p
WHERE lower(COALESCE(p.role, '')) IN ('admin', 'super_admin', 'master')
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.admin_memberships m
    WHERE m.user_id = p.id
      AND m.status = 'active'
  );

-- Dual-read for RLS: membership OR profiles.role
CREATE OR REPLACE FUNCTION public.is_platform_admin(check_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT check_uid IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.admin_memberships m
        WHERE m.user_id = check_uid
          AND m.status = 'active'
          AND m.role IN ('admin', 'super_admin')
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = check_uid
          AND p.role IN ('admin', 'super_admin')
      )
    );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO service_role;

COMMIT;
