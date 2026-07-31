-- Notification SSOT Fix 4: durable Admin test events.
-- Test events are unread=false and excluded from Bell/App Icon by application policy.

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
      'admin_test',
      'missed_call',
      'incoming_call',
      'incoming_call_signal'
    )
  );

COMMENT ON CONSTRAINT notification_events_type_check ON public.notification_events IS
  'Canonical notification registry event types; admin_test is durable but excluded from unread projections.';
