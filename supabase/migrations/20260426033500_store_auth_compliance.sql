ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_version text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_device_info text,
  ADD COLUMN IF NOT EXISTS phone_verification_method text,
  ADD COLUMN IF NOT EXISTS phone_verification_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_account_type text;

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL UNIQUE,
  device_info text,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON public.user_sessions (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx ON public.user_sessions (user_id, active);

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'completed', 'rejected', 'cancelled')),
  confirmation_text text,
  reason text,
  requested_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_user_id_idx
  ON public.account_deletion_requests (user_id, requested_at DESC);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_provider_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_provider_check
  CHECK (
    provider IS NULL
    OR provider IN ('google', 'kakao', 'naver', 'apple', 'admin_manual', 'email')
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_auth_provider_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_auth_provider_check
  CHECK (
    auth_provider IS NULL
    OR auth_provider IN ('google', 'kakao', 'naver', 'apple', 'admin_manual', 'email')
  );
