-- 회원 가입/전화번호 인증 기반 회원 스키마
-- 기존 profiles / test_users 가 없거나 일부 컬럼이 빠진 환경을 모두 보정한다.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  username text,
  nickname text,
  avatar_url text,
  bio text,
  region_code text,
  region_name text,
  phone text,
  phone_verified boolean NOT NULL DEFAULT false,
  phone_verification_status text NOT NULL DEFAULT 'unverified',
  phone_verified_at timestamptz,
  phone_verification_requested_at timestamptz,
  phone_verification_method text,
  realname text,
  realname_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  role text NOT NULL DEFAULT 'user',
  member_type text NOT NULL DEFAULT 'normal',
  is_special_member boolean NOT NULL DEFAULT false,
  points integer NOT NULL DEFAULT 0,
  manner_score numeric NOT NULL DEFAULT 50,
  trust_score numeric NOT NULL DEFAULT 50,
  preferred_language text NOT NULL DEFAULT 'ko',
  preferred_country text NOT NULL DEFAULT 'PH',
  notify_commerce_email boolean NOT NULL DEFAULT true,
  auth_provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS region_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS region_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verification_status text NOT NULL DEFAULT 'unverified';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verification_requested_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verification_method text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS realname text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS realname_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS member_type text NOT NULL DEFAULT 'normal';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_special_member boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS manner_score numeric NOT NULL DEFAULT 50;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trust_score numeric NOT NULL DEFAULT 50;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'ko';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_country text NOT NULL DEFAULT 'PH';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_commerce_email boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_provider text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.profiles
SET
  phone_verification_status = CASE
    WHEN phone_verified = true THEN 'verified'
    WHEN phone IS NOT NULL AND btrim(phone) <> '' THEN 'pending'
    ELSE 'unverified'
  END
WHERE phone_verification_status IS NULL OR btrim(phone_verification_status) = '';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_verification_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_verification_status_check
  CHECK (phone_verification_status IN ('unverified', 'pending', 'verified', 'rejected'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'suspended', 'blocked', 'deleted'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'special', 'admin', 'master'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_member_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_member_type_check
  CHECK (member_type IN ('normal', 'premium', 'business', 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL AND btrim(username) <> '';

CREATE TABLE IF NOT EXISTS public.test_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  password text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  display_name text,
  contact_phone text,
  contact_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.test_users ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE public.test_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';
ALTER TABLE public.test_users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.test_users ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE public.test_users ADD COLUMN IF NOT EXISTS contact_address text;
ALTER TABLE public.test_users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS test_users_username_lower_unique_idx
  ON public.test_users (lower(username));

CREATE OR REPLACE FUNCTION public.set_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_profiles_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_own_or_admin'
  ) THEN
    CREATE POLICY profiles_select_own_or_admin
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (id = auth.uid() OR public.is_platform_admin(auth.uid()));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_insert_own_or_admin'
  ) THEN
    CREATE POLICY profiles_insert_own_or_admin
      ON public.profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (id = auth.uid() OR public.is_platform_admin(auth.uid()));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_own_or_admin'
  ) THEN
    CREATE POLICY profiles_update_own_or_admin
      ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (id = auth.uid() OR public.is_platform_admin(auth.uid()))
      WITH CHECK (id = auth.uid() OR public.is_platform_admin(auth.uid()));
  END IF;
END
$$;
