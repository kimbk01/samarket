BEGIN;

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  chat_push_enabled boolean NOT NULL DEFAULT true,
  marketing_push_enabled boolean NOT NULL DEFAULT false,
  do_not_disturb_enabled boolean NOT NULL DEFAULT false,
  do_not_disturb_start text NULL,
  do_not_disturb_end text NULL,
  video_autoplay_mode text NOT NULL DEFAULT 'wifi_only',
  preferred_language text NOT NULL DEFAULT 'ko',
  preferred_country text NOT NULL DEFAULT 'PH',
  personalization_enabled boolean NOT NULL DEFAULT true,
  chat_preview_enabled boolean NOT NULL DEFAULT true,
  app_banner_hidden boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_video_autoplay_mode_check
    CHECK (video_autoplay_mode IN ('always', 'wifi_only', 'never'))
);

CREATE TABLE IF NOT EXISTS public.point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  related_type text NOT NULL DEFAULT 'admin_manual',
  related_id text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'system',
  earned_at timestamptz NULL,
  expires_at timestamptz NULL,
  expired_amount integer NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.point_charge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL DEFAULT '',
  plan_name text NOT NULL DEFAULT '',
  payment_method text NOT NULL DEFAULT 'manual_confirm',
  payment_amount integer NOT NULL DEFAULT 0,
  point_amount integer NOT NULL DEFAULT 0,
  request_status text NOT NULL DEFAULT 'pending',
  depositor_name text NOT NULL DEFAULT '',
  receipt_image_url text NOT NULL DEFAULT '',
  admin_memo text NULL,
  user_memo text NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_ledger_user_created_at
  ON public.point_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_point_charge_requests_user_requested_at
  ON public.point_charge_requests (user_id, requested_at DESC);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_charge_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_settings_select_own" ON public.user_settings;
CREATE POLICY "user_settings_select_own"
  ON public.user_settings
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_settings_upsert_own" ON public.user_settings;
CREATE POLICY "user_settings_upsert_own"
  ON public.user_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "point_ledger_select_own" ON public.point_ledger;
CREATE POLICY "point_ledger_select_own"
  ON public.point_ledger
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "point_charge_requests_select_own" ON public.point_charge_requests;
CREATE POLICY "point_charge_requests_select_own"
  ON public.point_charge_requests
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "point_charge_requests_insert_own" ON public.point_charge_requests;
CREATE POLICY "point_charge_requests_insert_own"
  ON public.point_charge_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "point_charge_requests_update_own" ON public.point_charge_requests;
CREATE POLICY "point_charge_requests_update_own"
  ON public.point_charge_requests
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
