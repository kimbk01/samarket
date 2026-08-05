-- Phase 5 Slice 2: notice_published (Campaign notice/system)
-- Legacy admin_notice rows remain dual-read; no historical backfill.
-- Badge COUNT folds notice_published into admin_notice digit bucket.

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
      'incoming_call_signal'
    )
  );

COMMENT ON CONSTRAINT notification_events_type_check ON public.notification_events IS
  'Canonical notification registry; Phase 5 Slice 2 adds notice_published.';

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
      'notice_published',
      'inquiry_answered',
      'inbox_message_received',
      'missed_call',
      'incoming_call_signal',
      'chat',
      'group',
      'trade',
      'store',
      'call'
    )
  );

CREATE OR REPLACE FUNCTION public.count_notification_events_badge(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible AS (
    SELECT e.category
    FROM public.notification_events e
    WHERE e.user_id = p_user_id
      AND e.unread = true
      AND e.read_at IS NULL
      AND public.notification_badge_event_eligible(e.display_payload)
  )
  SELECT CASE
    WHEN (SELECT auth.role()) <> 'service_role'
         AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id)
      THEN jsonb_build_object(
        'chat_message', 0,
        'group_message', 0,
        'trade_message', 0,
        'trade_status', 0,
        'order_status', 0,
        'delivery_status', 0,
        'community_activity', 0,
        'admin_marketing_banner', 0,
        'admin_notice', 0,
        'missed_call', 0
      )
    ELSE jsonb_build_object(
      'chat_message',
        (SELECT COUNT(*)::int FROM eligible WHERE category IN ('chat_message', 'chat')),
      'group_message',
        (SELECT COUNT(*)::int FROM eligible WHERE category IN ('group_message', 'group')),
      'trade_message',
        (SELECT COUNT(*)::int FROM eligible WHERE category IN ('trade_message', 'trade')),
      'trade_status',
        (SELECT COUNT(*)::int FROM eligible WHERE category = 'trade_status'),
      'order_status',
        (SELECT COUNT(*)::int FROM eligible WHERE category IN ('order_status', 'store')),
      'delivery_status',
        (SELECT COUNT(*)::int FROM eligible WHERE category = 'delivery_status'),
      'community_activity',
        (SELECT COUNT(*)::int FROM eligible WHERE category = 'community_activity'),
      'admin_marketing_banner',
        (SELECT COUNT(*)::int FROM eligible WHERE category = 'admin_marketing_banner'),
      'admin_notice',
        (SELECT COUNT(*)::int FROM eligible WHERE category IN (
          'admin_notice',
          'notice_published',
          'inquiry_answered',
          'inbox_message_received'
        )),
      'missed_call',
        (SELECT COUNT(*)::int FROM eligible WHERE category = 'missed_call')
    )
  END;
$$;

COMMENT ON FUNCTION public.count_notification_events_badge(uuid) IS
  '알림 뱃지 집계 — Phase 5 Slice 2 notice_published folded into admin_notice.';
