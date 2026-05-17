-- Owner dashboard: segmented unread counts (single index-friendly query each)

create or replace function public.count_owner_store_commerce_unread(p_user_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint
  from public.notifications n
  where n.user_id = p_user_id
    and n.is_read = false
    and n.notification_type = 'commerce'
    and (n.meta->>'kind') in (
      'store_order_created',
      'store_order_payment_completed',
      'store_order_buyer_cancelled',
      'store_order_refund_requested'
    );
$$;

create or replace function public.count_consumer_unread_no_chat(p_user_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint
  from public.notifications n
  where n.user_id = p_user_id
    and n.is_read = false
    and (
      (
        coalesce(n.notification_type, '') <> 'commerce'
        and coalesce(n.notification_type, '') <> 'chat'
      )
      or (
        n.notification_type = 'commerce'
        and coalesce(n.meta->>'kind', '') not in (
          'store_order_created',
          'store_order_payment_completed',
          'store_order_buyer_cancelled',
          'store_order_refund_requested',
          'community_chat',
          'trade_chat',
          'group_chat'
        )
      )
    );
$$;
