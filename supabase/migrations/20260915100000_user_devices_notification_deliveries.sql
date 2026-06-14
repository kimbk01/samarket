-- Native push device registry + delivery audit log (FCM/APNS/VoIP/Web Push unified dispatch)

CREATE TABLE IF NOT EXISTS public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  device_id text NOT NULL,
  push_token text NOT NULL,
  push_provider text NOT NULL CHECK (push_provider IN ('fcm', 'apns', 'voip_apns', 'web_push')),
  app_version text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_devices_push_provider_token_key UNIQUE (push_provider, push_token)
);

CREATE INDEX IF NOT EXISTS user_devices_user_active_idx
  ON public.user_devices (user_id, is_active);

CREATE INDEX IF NOT EXISTS user_devices_user_device_idx
  ON public.user_devices (user_id, device_id);

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.user_devices (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  target_type text,
  target_id text,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_deliveries_user_created_idx
  ON public.notification_deliveries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_deliveries_status_created_idx
  ON public.notification_deliveries (status, created_at DESC);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_devices_select_own ON public.user_devices;
CREATE POLICY user_devices_select_own
  ON public.user_devices FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_devices_insert_own ON public.user_devices;
CREATE POLICY user_devices_insert_own
  ON public.user_devices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_devices_update_own ON public.user_devices;
CREATE POLICY user_devices_update_own
  ON public.user_devices FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_devices_delete_own ON public.user_devices;
CREATE POLICY user_devices_delete_own
  ON public.user_devices FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_devices IS 'Native/Web push tokens per device. service_role reads for dispatch.';
COMMENT ON TABLE public.notification_deliveries IS 'Push dispatch audit — pending/sent/failed/skipped per device attempt.';
