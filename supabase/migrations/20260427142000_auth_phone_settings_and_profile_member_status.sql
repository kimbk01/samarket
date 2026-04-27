-- Phone OTP membership rollout:
-- - add profile columns required by phone verification flow
-- - enforce unique phone across profiles
-- - add admin-managed auth_phone_settings

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_verification_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_verification_attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS member_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verified_member_at timestamptz;

ALTER TABLE public.profiles
  ALTER COLUMN member_status SET DEFAULT 'pending';

-- Keep legacy values for backward compatibility while allowing new rollout states.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_member_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_member_status_check
  CHECK (
    member_status IS NULL
    OR member_status IN (
      'pending',
      'active',
      'sns_member',
      'verified_member',
      'admin_manual'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique_idx
  ON public.profiles (phone)
  WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.auth_phone_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT false,
  country_code text NOT NULL DEFAULT 'PH',
  provider text NOT NULL DEFAULT 'semaphore_local',
  sms_from_name text,
  otp_ttl_seconds int NOT NULL DEFAULT 300,
  resend_cooldown_seconds int NOT NULL DEFAULT 60,
  max_attempts int NOT NULL DEFAULT 5,
  guide_text text DEFAULT '필리핀 휴대폰 번호만 인증 가능합니다. 예: 0917 123 4567',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure single-row settings behavior using fixed country/provider tuple.
CREATE UNIQUE INDEX IF NOT EXISTS auth_phone_settings_country_provider_unique_idx
  ON public.auth_phone_settings (country_code, provider);

INSERT INTO public.auth_phone_settings (
  enabled,
  country_code,
  provider,
  otp_ttl_seconds,
  resend_cooldown_seconds,
  max_attempts
)
SELECT
  false,
  'PH',
  'semaphore_local',
  300,
  60,
  5
WHERE NOT EXISTS (SELECT 1 FROM public.auth_phone_settings);
