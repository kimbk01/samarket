-- Phase A: admin notification campaigns — channel split, delivery SSOT, device permission

-- 1) notification_events — admin categories/types (app code already writes these)
ALTER TABLE public.notification_events
  DROP CONSTRAINT IF EXISTS notification_events_type_check;

ALTER TABLE public.notification_events
  ADD CONSTRAINT notification_events_type_check CHECK (
    type IN (
      'chat_message',
      'group_message',
      'mention_message',
      'pin_message',
      'trade_message',
      'store_order_message',
      'trade_status',
      'order_status',
      'delivery_status',
      'community_activity',
      'admin_marketing_banner',
      'admin_notice',
      'missed_call',
      'incoming_call',
      'incoming_call_signal'
    )
  );

ALTER TABLE public.notification_events
  DROP CONSTRAINT IF EXISTS notification_events_category_check;

ALTER TABLE public.notification_events
  ADD CONSTRAINT notification_events_category_check CHECK (
    category IN (
      'chat_message',
      'group_message',
      'trade_message',
      'trade_status',
      'order_status',
      'delivery_status',
      'community_activity',
      'admin_marketing_banner',
      'admin_notice',
      'missed_call',
      'incoming_call_signal',
      'chat',
      'group',
      'trade',
      'store',
      'call'
    )
  );

-- 2) admin_notification_campaigns — channel, split URLs/images, extended status
ALTER TABLE public.admin_notification_campaigns
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'push_and_in_app',
  ADD COLUMN IF NOT EXISTS push_image_url text,
  ADD COLUMN IF NOT EXISTS in_app_image_url text,
  ADD COLUMN IF NOT EXISTS deeplink_url text,
  ADD COLUMN IF NOT EXISTS web_url text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS visibility_policy text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS target_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS target_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count int NOT NULL DEFAULT 0;

-- Migrate legacy columns
UPDATE public.admin_notification_campaigns
SET
  deeplink_url = COALESCE(deeplink_url, target_url),
  in_app_image_url = COALESCE(in_app_image_url, image_url),
  push_image_url = COALESCE(push_image_url, image_url)
WHERE target_url IS NOT NULL OR image_url IS NOT NULL;

ALTER TABLE public.admin_notification_campaigns
  DROP CONSTRAINT IF EXISTS admin_notification_campaigns_channel_check;
ALTER TABLE public.admin_notification_campaigns
  ADD CONSTRAINT admin_notification_campaigns_channel_check CHECK (
    channel IN ('push_only', 'in_app_only', 'push_and_in_app', 'test_only')
  );

ALTER TABLE public.admin_notification_campaigns
  DROP CONSTRAINT IF EXISTS admin_notification_campaigns_priority_check;
ALTER TABLE public.admin_notification_campaigns
  ADD CONSTRAINT admin_notification_campaigns_priority_check CHECK (
    priority IN ('low', 'normal', 'high')
  );

ALTER TABLE public.admin_notification_campaigns
  DROP CONSTRAINT IF EXISTS admin_notification_campaigns_visibility_policy_check;
ALTER TABLE public.admin_notification_campaigns
  ADD CONSTRAINT admin_notification_campaigns_visibility_policy_check CHECK (
    visibility_policy IN ('default', 'public', 'private')
  );

ALTER TABLE public.admin_notification_campaigns
  DROP CONSTRAINT IF EXISTS admin_notification_campaigns_status_check;
ALTER TABLE public.admin_notification_campaigns
  ADD CONSTRAINT admin_notification_campaigns_status_check CHECK (
    status IN ('draft', 'scheduled', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled')
  );

COMMENT ON COLUMN public.admin_notification_campaigns.channel IS 'push_only | in_app_only | push_and_in_app | test_only';
COMMENT ON COLUMN public.admin_notification_campaigns.deeplink_url IS 'In-app deeplink (app route) — preferred over web_url';
COMMENT ON COLUMN public.admin_notification_campaigns.web_url IS 'Fallback web URL when deeplink absent';

-- 3) campaign_targets — link to notification_event
ALTER TABLE public.admin_notification_campaign_targets
  ADD COLUMN IF NOT EXISTS notification_event_id uuid REFERENCES public.notification_events (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS skip_reason text;

-- 4) notification_campaign_deliveries — per-device delivery SSOT
CREATE TABLE IF NOT EXISTS public.notification_campaign_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.admin_notification_campaigns (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.user_devices (id) ON DELETE SET NULL,
  notification_event_id uuid REFERENCES public.notification_events (id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('push', 'in_app')),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'failed', 'skipped', 'opened', 'dismissed')
  ),
  skip_reason text,
  provider_message_id text,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_campaign_deliveries_campaign_idx
  ON public.notification_campaign_deliveries (campaign_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_campaign_deliveries_campaign_user_idx
  ON public.notification_campaign_deliveries (campaign_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS notification_campaign_deliveries_campaign_user_device_channel_uidx
  ON public.notification_campaign_deliveries (campaign_id, user_id, COALESCE(device_id, '00000000-0000-0000-0000-000000000000'::uuid), channel);

ALTER TABLE public.notification_campaign_deliveries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.notification_campaign_deliveries IS 'Admin campaign per-user/per-device delivery audit (service_role only)';

-- 5) user_devices — notification permission tracking
ALTER TABLE public.user_devices
  ADD COLUMN IF NOT EXISTS notification_permission_status text,
  ADD COLUMN IF NOT EXISTS permission_updated_at timestamptz;

ALTER TABLE public.user_devices
  DROP CONSTRAINT IF EXISTS user_devices_notification_permission_status_check;
ALTER TABLE public.user_devices
  ADD CONSTRAINT user_devices_notification_permission_status_check CHECK (
    notification_permission_status IS NULL
    OR notification_permission_status IN ('granted', 'denied', 'not_determined', 'provisional')
  );

COMMENT ON COLUMN public.user_devices.notification_permission_status IS 'OS notification permission snapshot from client register';
