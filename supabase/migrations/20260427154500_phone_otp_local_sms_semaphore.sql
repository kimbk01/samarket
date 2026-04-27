-- Local SMS OTP (Philippines) rollout:
-- - move provider from hosted OTP to local SMS provider
-- - add server-owned OTP challenge table for code verification

CREATE TABLE IF NOT EXISTS public.phone_otp_challenges (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  otp_code_hash text NOT NULL,
  otp_expires_at timestamptz NOT NULL,
  attempt_count int NOT NULL DEFAULT 0,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_otp_challenges_phone_idx
  ON public.phone_otp_challenges (phone);

-- Keep admin settings tuple aligned with local SMS provider.
UPDATE public.auth_phone_settings
SET provider = 'semaphore_local',
    updated_at = now()
WHERE country_code = 'PH'
  AND provider = 'supabase';

INSERT INTO public.auth_phone_settings (
  enabled,
  country_code,
  provider,
  otp_ttl_seconds,
  resend_cooldown_seconds,
  max_attempts
)
SELECT false, 'PH', 'semaphore_local', 300, 60, 5
WHERE NOT EXISTS (
  SELECT 1
  FROM public.auth_phone_settings
  WHERE country_code = 'PH'
    AND provider = 'semaphore_local'
);
