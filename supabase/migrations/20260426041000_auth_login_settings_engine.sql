ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_login_email text,
  ADD COLUMN IF NOT EXISTS member_status text,
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

UPDATE public.profiles
SET
  provider = CASE
    WHEN provider IS NULL OR btrim(provider) = '' THEN NULL
    WHEN lower(btrim(provider)) = 'custom:naver' THEN 'naver'
    WHEN lower(btrim(provider)) IN ('manual', 'manual_admin', 'manual_admin_backfill', 'admin_manual') THEN 'admin_manual'
    WHEN lower(btrim(provider)) = 'sync_from_auth' THEN 'email'
    WHEN lower(btrim(provider)) IN ('google', 'kakao', 'naver', 'apple', 'facebook', 'email') THEN lower(btrim(provider))
    ELSE NULL
  END,
  auth_provider = CASE
    WHEN auth_provider IS NULL OR btrim(auth_provider) = '' THEN NULL
    WHEN lower(btrim(auth_provider)) = 'custom:naver' THEN 'naver'
    WHEN lower(btrim(auth_provider)) IN ('manual', 'manual_admin', 'manual_admin_backfill', 'admin_manual') THEN 'admin_manual'
    WHEN lower(btrim(auth_provider)) = 'sync_from_auth' THEN 'email'
    WHEN lower(btrim(auth_provider)) IN ('google', 'kakao', 'naver', 'apple', 'facebook', 'email') THEN lower(btrim(auth_provider))
    ELSE NULL
  END
WHERE
  provider IS NOT NULL
  OR auth_provider IS NOT NULL;

UPDATE public.profiles
SET
  auth_login_email = COALESCE(NULLIF(auth_login_email, ''), NULLIF(email, '')),
  is_admin = COALESCE(is_admin, false) OR role IN ('admin', 'super_admin', 'master'),
  member_status = CASE
    WHEN COALESCE(provider, auth_provider) = 'admin_manual' THEN 'verified_member'
    WHEN COALESCE(phone_verified, false) = true OR phone_verified_at IS NOT NULL THEN 'verified_member'
    ELSE 'sns_member'
  END
WHERE auth_login_email IS NULL OR member_status IS NULL OR is_admin IS DISTINCT FROM (COALESCE(is_admin, false) OR role IN ('admin', 'super_admin', 'master'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_provider_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_provider_check
  CHECK (
    provider IS NULL
    OR provider IN ('google', 'kakao', 'naver', 'apple', 'facebook', 'admin_manual', 'email')
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_auth_provider_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_auth_provider_check
  CHECK (
    auth_provider IS NULL
    OR auth_provider IN ('google', 'kakao', 'naver', 'apple', 'facebook', 'admin_manual', 'email')
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_member_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_member_status_check
  CHECK (
    member_status IS NULL
    OR member_status IN ('sns_member', 'verified_member', 'admin_manual')
  );

CREATE TABLE IF NOT EXISTS public.auth_login_settings (
  id text PRIMARY KEY,
  provider text NOT NULL UNIQUE,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT auth_login_settings_provider_check
    CHECK (provider IN ('password', 'google', 'kakao', 'naver', 'apple', 'facebook'))
);

INSERT INTO public.auth_login_settings (id, provider, label, enabled, sort_order)
VALUES
  ('password', 'password', '아이디 로그인', true, 1),
  ('google', 'google', 'Google', true, 2),
  ('kakao', 'kakao', 'Kakao', true, 3),
  ('naver', 'naver', 'Naver', true, 4),
  ('apple', 'apple', 'Apple', true, 5),
  ('facebook', 'facebook', 'Facebook', false, 6)
ON CONFLICT (provider) DO UPDATE
SET
  label = EXCLUDED.label,
  enabled = EXCLUDED.enabled,
  sort_order = EXCLUDED.sort_order,
  updated_at = timezone('utc', now());
