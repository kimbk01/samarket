-- CUT E1 — Align F-07 service_role detection with canonical auth.role()
--
-- ROOT CAUSE (Production proven):
--   guard_profiles_self_update used only:
--     current_setting('request.jwt.claim.role', true)
--   Supabase PostgREST service_role requests populate auth.role()='service_role'
--   but do NOT reliably set request.jwt.claim.role.
--   Result: legitimate project_user_point_balance_from_ledger UPDATE of profiles.points
--   (when cache must change after ledger spend) raised profiles_points_direct_update_forbidden.
--   No-op projection (points already equal ledger) appeared to "PASS".
--
-- F-07 AUTHORITY PRESERVED:
--   - Guard remains; not removed
--   - authenticated/anon still cannot mutate profiles.points
--   - Column ACL from 20270118151000 unchanged
--   - Canonical writer remains project_user_point_balance_from_ledger (SECURITY DEFINER)
--     invoked under service_role (promotion purchase RPCs already require auth.role()=service_role)
--
-- DO NOT widen to authenticated. DO NOT allow arbitrary direct user points writes.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_profiles_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor uuid := auth.uid();
  jwt_claim_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  request_role text := auth.role();
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Canonical service writers: PostgREST service_role (auth.role) and/or jwt claim.
  -- auth.role() is the Supabase-canonical detector used by purchase_* / finance locks.
  IF request_role = 'service_role' OR jwt_claim_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- F-07: points is never member/admin-JWT writable.
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
  'F-07: blocks profiles.points mutation unless auth.role()/jwt claim is service_role. '
  'Canonical cache writer: project_user_point_balance_from_ledger (SECURITY DEFINER) under service_role. '
  'CUT E1: detect service_role via auth.role() (PostgREST), not only request.jwt.claim.role.';

COMMIT;
