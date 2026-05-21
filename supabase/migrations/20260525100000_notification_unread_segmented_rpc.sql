-- Owner dashboard: segmented unread — single RPC per mode (1 PostgREST RTT).
-- CONTRACT: p_segment ∈ all | consumer | consumer_no_chat | owner_store_commerce | bottom_nav | bottom_nav_no_chat

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
          AND coalesce(n.notification_type, '') <> 'chat'
        )
        OR (
          n.notification_type = 'commerce'
          AND coalesce(n.meta->>'kind', '') NOT IN (
            'store_order_created',
            'store_order_accept_reminder_30s',
            'store_order_accept_reminder_60s',
            'store_order_payment_completed',
            'store_order_buyer_cancelled',
            'store_order_refund_requested',
            'community_chat',
            'trade_chat',
            'group_chat'
          )
        )
      WHEN 'bottom_nav' THEN
        (
          coalesce(n.notification_type, '') <> 'commerce'
          AND coalesce(n.notification_type, '') <> 'chat'
        )
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
            'store_order_auto_completed',
            'community_chat',
            'trade_chat',
            'group_chat'
          )
        )
      WHEN 'bottom_nav_no_chat' THEN
        (
          coalesce(n.notification_type, '') <> 'commerce'
          AND coalesce(n.notification_type, '') <> 'chat'
        )
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
            'store_order_auto_completed',
            'community_chat',
            'trade_chat',
            'group_chat'
          )
        )
      ELSE false
    END;
$$;

COMMENT ON FUNCTION public.count_notification_unread_segmented(uuid, text) IS
  'Segmented in-app notification unread count — one indexed scan per hub/badge mode.';

-- Owner store commerce inbox list (meta.store_id filter in SQL, not 220-row client filter)
CREATE OR REPLACE FUNCTION public.get_owner_store_commerce_notifications(
  p_user_id uuid,
  p_store_id uuid,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'notification_type', n.notification_type,
        'title', n.title,
        'body', n.body,
        'link_url', n.link_url,
        'is_read', n.is_read,
        'created_at', n.created_at,
        'meta', n.meta
      )
      ORDER BY n.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT n.*
    FROM public.notifications AS n
    WHERE n.user_id = p_user_id
      AND n.notification_type = 'commerce'
      AND (n.meta->>'kind') IN (
        'store_order_created',
        'store_order_accept_reminder_30s',
        'store_order_accept_reminder_60s',
        'store_order_payment_completed',
        'store_order_buyer_cancelled',
        'store_order_refund_requested'
      )
      AND trim(coalesce(n.meta->>'store_id', '')) = p_store_id::text
    ORDER BY n.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 200), 220))
  ) AS n;
$$;

COMMENT ON FUNCTION public.get_owner_store_commerce_notifications(uuid, uuid, integer) IS
  'Owner store order notifications for one store_id — SQL filter (no 220-row app slice).';
