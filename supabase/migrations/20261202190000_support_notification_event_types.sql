-- Support Center notification event types (CUT 3B)
-- App registry already defines support_* types; DB CHECK must allow inserts.

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
      'notice_published',
      'inquiry_answered',
      'inbox_message_received',
      'admin_test',
      'missed_call',
      'incoming_call',
      'incoming_call_signal',
      'support_case_created',
      'support_admin_replied',
      'support_customer_replied',
      'support_case_assigned',
      'support_case_resolved',
      'support_case_reopened'
    )
  );

COMMENT ON CONSTRAINT notification_events_type_check ON public.notification_events IS
  'Canonical notification registry; CUT 3B adds support_* case lifecycle types.';
