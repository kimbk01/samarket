-- P0.5: admin/ads notification types — separate from chat badge SSOT.

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
      'missed_call',
      'incoming_call',
      'admin_ad',
      'admin_notice',
      'admin_event',
      'admin_system'
    )
  );

ALTER TABLE public.notification_events
  DROP CONSTRAINT IF EXISTS notification_events_category_check;

ALTER TABLE public.notification_events
  ADD CONSTRAINT notification_events_category_check CHECK (
    category IN (
      'chat',
      'group',
      'trade',
      'store',
      'missed_call',
      'call',
      'admin_ad',
      'admin_notice',
      'admin_event',
      'admin_system'
    )
  );

COMMENT ON TABLE public.notification_events IS
  'Messenger/call badge SSOT + admin ads/notices (admin_* excluded from badge-count RPC).';
