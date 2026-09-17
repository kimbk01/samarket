-- F-07: profiles.points is projection cache only.
-- Member/client MUST NOT direct-UPDATE points.
-- Canonical writer: project_user_point_balance_from_ledger (SECURITY DEFINER)
-- and service_role fallback projection path.
-- Preserves normal profile self-edit (nickname/avatar/etc.).

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_profiles_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor uuid := auth.uid();
  jwt_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Canonical Point projection and service writers use service_role JWT.
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- F-07: points is never member/admin-JWT writable. Only service_role / DEFINER path.
  IF NEW.points IS DISTINCT FROM OLD.points THEN
    RAISE EXCEPTION 'profiles_points_direct_update_forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF actor IS NULL OR actor <> OLD.id OR public.is_platform_admin(actor) THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.provider IS DISTINCT FROM OLD.provider
    OR NEW.auth_provider IS DISTINCT FROM OLD.auth_provider
    OR NEW.phone_verified IS DISTINCT FROM OLD.phone_verified
    OR NEW.phone_verification_status IS DISTINCT FROM OLD.phone_verification_status
    OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
    OR NEW.phone_country_code IS DISTINCT FROM OLD.phone_country_code
    OR NEW.phone_number IS DISTINCT FROM OLD.phone_number
    OR NEW.active_session_id IS DISTINCT FROM OLD.active_session_id
    OR NEW.last_login_at IS DISTINCT FROM OLD.last_login_at
    OR NEW.created_by_admin IS DISTINCT FROM OLD.created_by_admin
    OR NEW.member_type IS DISTINCT FROM OLD.member_type
    OR NEW.is_special_member IS DISTINCT FROM OLD.is_special_member THEN
    RAISE EXCEPTION 'profiles_restricted_field_update';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profiles_self_update() IS
  'Blocks member/admin JWT from updating restricted profile fields and profiles.points (F-07). service_role + SECURITY DEFINER projection remain the only points writers.';

-- Defense in depth: column privilege — authenticated/anon cannot UPDATE points.
REVOKE UPDATE (points) ON TABLE public.profiles FROM PUBLIC;
REVOKE UPDATE (points) ON TABLE public.profiles FROM anon;
REVOKE UPDATE (points) ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (points) ON TABLE public.profiles TO service_role;

COMMIT;
