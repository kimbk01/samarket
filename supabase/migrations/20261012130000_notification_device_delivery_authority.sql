-- Notification SSOT Fix 5: environment-scoped devices, event origin, and
-- idempotent per-device delivery reservations.

ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.user_devices
  DROP CONSTRAINT IF EXISTS user_devices_environment_check;
ALTER TABLE public.user_devices
  ADD CONSTRAINT user_devices_environment_check CHECK (
    environment IN ('production', 'preview', 'development')
  );

ALTER TABLE public.user_devices
  DROP CONSTRAINT IF EXISTS user_devices_push_provider_token_key;
ALTER TABLE public.user_devices
  DROP CONSTRAINT IF EXISTS user_devices_push_provider_token_environment_key;
ALTER TABLE public.user_devices
  ADD CONSTRAINT user_devices_push_provider_token_environment_key
  UNIQUE (push_provider, push_token, environment);

CREATE INDEX IF NOT EXISTS user_devices_user_environment_active_idx
  ON public.user_devices (user_id, environment, is_active, last_seen_at DESC);

ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS origin_device_id text;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS notification_event_id uuid
    REFERENCES public.notification_events (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_environment_check;
ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_environment_check CHECK (
    environment IN ('production', 'preview', 'development')
  );

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_event_device_uidx
  ON public.notification_deliveries (notification_event_id, device_id)
  WHERE notification_event_id IS NOT NULL AND device_id IS NOT NULL;

COMMENT ON COLUMN public.user_devices.environment IS
  'Push token environment authority; Production/Preview/Development targets never mix.';
COMMENT ON COLUMN public.notification_events.origin_device_id IS
  'Physical client instance that originated the domain event; sender push remains suppressed.';
COMMENT ON COLUMN public.notification_deliveries.notification_event_id IS
  'Durable event authority for idempotent per-device delivery.';
