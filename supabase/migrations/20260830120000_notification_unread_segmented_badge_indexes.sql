-- Badge cold path: count_notification_unread_segmented segment filters on notifications.
-- CONTRACT: partial predicates mirror count_notification_unread_segmented CASE branches exactly
-- (20260526250000_notification_unread_tier1_chat_parity.sql) — unread semantics unchanged.
-- Warn modes: consumer_no_chat (header badge), bottom_nav_no_chat (main bottom nav badge).

do $$
begin
  if to_regclass('public.notifications') is null then
    raise notice 'notifications missing — skip segmented unread badge indexes';
    return;
  end if;

  -- consumer_no_chat: exclude owner commerce + in-app chat rows (header / philife badge).
  execute $sql$
    create index if not exists idx_notifications_user_unread_consumer_no_chat_count
      on public.notifications (user_id)
      where is_read = false
        and coalesce(notification_type, '') <> 'chat'
        and coalesce(push_kind, '') <> 'chat'
        and coalesce(meta->>'kind', '') not in ('community_chat', 'trade_chat', 'group_chat')
        and (
          coalesce(notification_type, '') <> 'commerce'
          or (
            notification_type = 'commerce'
            and coalesce(meta->>'kind', '') not in (
              'store_order_created',
              'store_order_accept_reminder_30s',
              'store_order_accept_reminder_60s',
              'store_order_payment_completed',
              'store_order_buyer_cancelled',
              'store_order_refund_requested'
            )
          )
        )
  $sql$;

  -- bottom_nav_no_chat: consumer_no_chat + exclude buyer store-order commerce meta kinds.
  execute $sql$
    create index if not exists idx_notifications_user_unread_bottom_nav_no_chat_count
      on public.notifications (user_id)
      where is_read = false
        and coalesce(notification_type, '') <> 'chat'
        and coalesce(push_kind, '') <> 'chat'
        and coalesce(meta->>'kind', '') not in ('community_chat', 'trade_chat', 'group_chat')
        and (
          coalesce(notification_type, '') <> 'commerce'
          or (
            notification_type = 'commerce'
            and coalesce(meta->>'kind', '') not in (
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
  $sql$;
end $$;

do $$
begin
  if to_regclass('public.idx_notifications_user_unread_consumer_no_chat_count') is not null then
    execute $sql$comment on index public.idx_notifications_user_unread_consumer_no_chat_count is
      'Unread count cold path — consumer_no_chat segment (count_notification_unread_segmented parity).'$sql$;
  end if;
  if to_regclass('public.idx_notifications_user_unread_bottom_nav_no_chat_count') is not null then
    execute $sql$comment on index public.idx_notifications_user_unread_bottom_nav_no_chat_count is
      'Unread count cold path — bottom_nav_no_chat segment (count_notification_unread_segmented parity).'$sql$;
  end if;
end $$;
