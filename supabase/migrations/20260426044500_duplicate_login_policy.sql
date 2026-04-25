ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS login_identifier text,
  ADD COLUMN IF NOT EXISTS device_key text,
  ADD COLUMN IF NOT EXISTS browser_key text,
  ADD COLUMN IF NOT EXISTS ip_address text;

CREATE INDEX IF NOT EXISTS user_sessions_user_active_device_idx
  ON public.user_sessions (user_id, active, device_key);

CREATE INDEX IF NOT EXISTS user_sessions_user_active_browser_idx
  ON public.user_sessions (user_id, active, browser_key);

CREATE INDEX IF NOT EXISTS user_sessions_user_active_ip_idx
  ON public.user_sessions (user_id, active, ip_address);

CREATE TABLE IF NOT EXISTS public.auth_duplicate_login_policy (
  id text PRIMARY KEY,
  compare_same_login_id boolean NOT NULL DEFAULT true,
  compare_same_device boolean NOT NULL DEFAULT true,
  compare_same_browser boolean NOT NULL DEFAULT true,
  compare_same_ip boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

INSERT INTO public.auth_duplicate_login_policy (
  id,
  compare_same_login_id,
  compare_same_device,
  compare_same_browser,
  compare_same_ip
)
VALUES
  ('default', true, true, true, false)
ON CONFLICT (id) DO UPDATE
SET
  compare_same_login_id = EXCLUDED.compare_same_login_id,
  compare_same_device = EXCLUDED.compare_same_device,
  compare_same_browser = EXCLUDED.compare_same_browser,
  compare_same_ip = EXCLUDED.compare_same_ip,
  updated_at = timezone('utc', now());
