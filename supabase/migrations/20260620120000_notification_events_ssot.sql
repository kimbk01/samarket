-- P0: notification_events — chat/missed-call badge SSOT (commerce/social stay on notifications).

CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  type text NOT NULL,
  category text NOT NULL,
  room_id uuid NULL,
  call_session_id uuid NULL,
  actor_user_id uuid NULL,
  message_id uuid NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  unread boolean NOT NULL DEFAULT true,
  read_at timestamptz NULL,
  delivered_at timestamptz NULL,
  opened_at timestamptz NULL,
  muted_snapshot boolean NOT NULL DEFAULT false,
  push_suppressed_reason text NULL,
  sound_suppressed_reason text NULL,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_events_type_check CHECK (
    type IN (
      'chat_message',
      'group_message',
      'trade_message',
      'store_order_message',
      'missed_call',
      'incoming_call'
    )
  ),
  CONSTRAINT notification_events_category_check CHECK (
    category IN ('chat', 'group', 'trade', 'store', 'missed_call', 'call')
  ),
  CONSTRAINT notification_events_user_dedupe_uidx UNIQUE (user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_events_user_unread
  ON public.notification_events (user_id, created_at DESC)
  WHERE unread = true AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notification_events_user_room
  ON public.notification_events (user_id, room_id)
  WHERE room_id IS NOT NULL;

COMMENT ON TABLE public.notification_events IS
  'P0 messenger/call notification SSOT — badge-count API reads this table only for chat segments.';

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_events_select_self ON public.notification_events;
CREATE POLICY notification_events_select_self ON public.notification_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_events_update_self ON public.notification_events;
CREATE POLICY notification_events_update_self ON public.notification_events
  FOR UPDATE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.count_notification_events_badge(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'chat',
    COALESCE(
      (SELECT COUNT(*)::int FROM notification_events e
       WHERE e.user_id = p_user_id AND e.unread = true AND e.read_at IS NULL
         AND e.category = 'chat'),
      0
    ),
    'group',
    COALESCE(
      (SELECT COUNT(*)::int FROM notification_events e
       WHERE e.user_id = p_user_id AND e.unread = true AND e.read_at IS NULL
         AND e.category = 'group'),
      0
    ),
    'trade',
    COALESCE(
      (SELECT COUNT(*)::int FROM notification_events e
       WHERE e.user_id = p_user_id AND e.unread = true AND e.read_at IS NULL
         AND e.category = 'trade'),
      0
    ),
    'store',
    COALESCE(
      (SELECT COUNT(*)::int FROM notification_events e
       WHERE e.user_id = p_user_id AND e.unread = true AND e.read_at IS NULL
         AND e.category = 'store'),
      0
    ),
    'missed_call',
    COALESCE(
      (SELECT COUNT(*)::int FROM notification_events e
       WHERE e.user_id = p_user_id AND e.unread = true AND e.read_at IS NULL
         AND e.category = 'missed_call'),
      0
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.count_notification_events_badge(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_notification_events_badge(uuid) TO service_role;

ALTER TABLE public.community_messenger_presence_snapshots
  ADD COLUMN IF NOT EXISTS active_room_id uuid NULL;

COMMENT ON COLUMN public.community_messenger_presence_snapshots.active_room_id IS
  'Foreground open room — notify pipeline suppresses push/sound when matches message room_id.';
