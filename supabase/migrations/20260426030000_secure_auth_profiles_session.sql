-- Secure auth/member profile hardening
-- - provider/status/role/session 기반 회원 정책으로 정렬
-- - 기존 profiles/auth_provider/test_users 레거시와 최대한 호환

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS phone_country_code text DEFAULT '+63',
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS active_session_id text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_admin uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.profiles
SET display_name = COALESCE(
  NULLIF(btrim(display_name), ''),
  NULLIF(btrim(nickname), ''),
  NULLIF(btrim(username), ''),
  CASE
    WHEN email IS NOT NULL AND POSITION('@' IN email) > 1 THEN split_part(email, '@', 1)
    ELSE NULL
  END,
  left(id::text, 8)
)
WHERE display_name IS NULL OR btrim(display_name) = '';

UPDATE public.profiles
SET phone_country_code = '+63'
WHERE phone_country_code IS NULL OR btrim(phone_country_code) = '';

UPDATE public.profiles
SET phone_number = CASE
  WHEN phone IS NULL OR btrim(phone) = '' THEN NULL
  WHEN phone LIKE '+63%' THEN substring(phone FROM 4)
  ELSE regexp_replace(phone, '^\+?', '')
END
WHERE phone_number IS NULL OR btrim(phone_number) = '';

UPDATE public.profiles
SET phone_verified_at = COALESCE(phone_verified_at, CASE WHEN phone_verified = true THEN now() ELSE NULL END)
WHERE phone_verified = true;

UPDATE public.profiles
SET provider = CASE
  WHEN lower(COALESCE(auth_provider, '')) IN ('manual_admin', 'manual_admin_backfill', 'manual') THEN 'manual'
  WHEN lower(COALESCE(auth_provider, '')) IN ('google', 'kakao', 'naver', 'email') THEN lower(auth_provider)
  WHEN lower(COALESCE(auth_provider, '')) IN ('apple', 'sync_from_auth', '') THEN 'email'
  ELSE 'email'
END
WHERE provider IS NULL OR btrim(provider) = '';

UPDATE public.profiles
SET auth_provider = provider
WHERE provider IS NOT NULL
  AND (auth_provider IS NULL OR btrim(auth_provider) = '' OR auth_provider <> provider);

UPDATE public.profiles
SET status = CASE
  WHEN lower(COALESCE(status, '')) IN ('deleted') THEN 'deleted'
  WHEN lower(COALESCE(status, '')) IN ('blocked', 'suspended') THEN 'suspended'
  WHEN lower(COALESCE(status, '')) IN ('sns_pending', 'verified_user') THEN lower(status)
  ELSE 'verified_user'
END;

UPDATE public.profiles
SET role = CASE
  WHEN lower(COALESCE(role, '')) = 'master' THEN 'super_admin'
  WHEN lower(COALESCE(role, '')) = 'admin' THEN 'admin'
  ELSE 'user'
END;

ALTER TABLE public.profiles
  ALTER COLUMN provider SET DEFAULT 'email',
  ALTER COLUMN phone_country_code SET DEFAULT '+63',
  ALTER COLUMN status SET DEFAULT 'sns_pending',
  ALTER COLUMN role SET DEFAULT 'user';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('sns_pending', 'verified_user', 'suspended', 'deleted'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'super_admin'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_provider_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_provider_check
  CHECK (provider IN ('google', 'kakao', 'naver', 'manual', 'email'));

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);
CREATE INDEX IF NOT EXISTS profiles_phone_number_idx ON public.profiles (phone_number);
CREATE INDEX IF NOT EXISTS profiles_status_idx ON public.profiles (status);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);
CREATE INDEX IF NOT EXISTS profiles_active_session_id_idx ON public.profiles (active_session_id);

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
      FROM public.profiles p
      WHERE p.id = check_uid
        AND p.role IN ('admin', 'super_admin')
    );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_profiles_self_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor uuid := auth.uid();
  jwt_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF jwt_role = 'service_role' THEN
    RETURN NEW;
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

DROP TRIGGER IF EXISTS trg_profiles_guard_sensitive_updates ON public.profiles;
CREATE TRIGGER trg_profiles_guard_sensitive_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profiles_self_update();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS profiles_insert_own_or_admin ON public.profiles;
CREATE POLICY profiles_insert_own_or_admin
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS profiles_update_own_or_admin ON public.profiles;
CREATE POLICY profiles_update_own_or_admin
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_platform_admin(auth.uid()))
  WITH CHECK (id = auth.uid() OR public.is_platform_admin(auth.uid()));

COMMIT;
