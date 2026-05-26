-- Tier1 header inbox parity: unread count must match list filter
-- (exclude notification_type/push_kind chat + meta chat kinds on all rows).
-- CONTRACT: aligns with isInAppChatMessageNotificationRow + consumer_no_chat list.

CREATE OR REPLACE FUNCTION public.count_notification_unread_segmented(
  p_user_id uuid,
  p_segment text
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.notifications AS n
  WHERE n.user_id = p_user_id
    AND n.is_read = false
    AND CASE trim(coalesce(p_segment, ''))
      WHEN 'all' THEN true
      WHEN 'owner_store_commerce' THEN
        n.notification_type = 'commerce'
        AND (n.meta->>'kind') IN (
          'store_order_created',
          'store_order_accept_reminder_30s',
          'store_order_accept_reminder_60s',
          'store_order_payment_completed',
          'store_order_buyer_cancelled',
          'store_order_refund_requested'
        )
      WHEN 'consumer' THEN
        coalesce(n.notification_type, '') <> 'commerce'
        OR (
          n.notification_type = 'commerce'
          AND coalesce(n.meta->>'kind', '') NOT IN (
            'store_order_created',
            'store_order_accept_reminder_30s',
            'store_order_accept_reminder_60s',
            'store_order_payment_completed',
            'store_order_buyer_cancelled',
            'store_order_refund_requested'
          )
        )
      WHEN 'consumer_no_chat' THEN
        (
          coalesce(n.notification_type, '') <> 'commerce'
          OR (
            n.notification_type = 'commerce'
            AND coalesce(n.meta->>'kind', '') NOT IN (
              'store_order_created',
              'store_order_accept_reminder_30s',
              'store_order_accept_reminder_60s',
              'store_order_payment_completed',
              'store_order_buyer_cancelled',
              'store_order_refund_requested'
            )
          )
        )
        AND coalesce(n.notification_type, '') <> 'chat'
        AND coalesce(n.push_kind, '') <> 'chat'
        AND coalesce(n.meta->>'kind', '') NOT IN ('community_chat', 'trade_chat', 'group_chat')
      WHEN 'bottom_nav' THEN
        (
          coalesce(n.notification_type, '') <> 'commerce'
          OR (
            n.notification_type = 'commerce'
            AND coalesce(n.meta->>'kind', '') NOT IN (
              'store_order_created',
              'store_order_accept_reminder_30s',
              'store_order_accept_reminder_60s',
              'store_order_payment_completed',
              'store_order_buyer_cancelled',
              'store_order_refund_requested',
              'store_order_payment_completed_buyer',
              'store_order_owner_status',
              'store_order_payment_failed',
              'store_order_refund_approved',
              'store_order_auto_completed'
            )
          )
        )
        AND coalesce(n.notification_type, '') <> 'chat'
        AND coalesce(n.push_kind, '') <> 'chat'
        AND coalesce(n.meta->>'kind', '') NOT IN ('community_chat', 'trade_chat', 'group_chat')
      WHEN 'bottom_nav_no_chat' THEN
        (
          coalesce(n.notification_type, '') <> 'commerce'
          OR (
            n.notification_type = 'commerce'
            AND coalesce(n.meta->>'kind', '') NOT IN (
              'store_order_created',
              'store_order_accept_reminder_30s',
              'store_order_accept_reminder_60s',
              'store_order_payment_completed',
              'store_order_buyer_cancelled',
              'store_order_refund_requested',
              'store_order_payment_completed_buyer',
              'store_order_owner_status',
              'store_order_payment_failed',
              'store_order_refund_approved',
              'store_order_auto_completed'
            )
          )
        )
        AND coalesce(n.notification_type, '') <> 'chat'
        AND coalesce(n.push_kind, '') <> 'chat'
        AND coalesce(n.meta->>'kind', '') NOT IN ('community_chat', 'trade_chat', 'group_chat')
      ELSE false
    END;
$$;

COMMENT ON FUNCTION public.count_notification_unread_segmented(uuid, text) IS
  'Segmented in-app notification unread count — tier1 inbox list parity for chat exclusions.';
