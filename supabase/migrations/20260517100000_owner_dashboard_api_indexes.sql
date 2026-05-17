-- Owner dashboard API indexes (order-counts, orders list, inquiries, notifications unread scan)
-- Non-concurrent — safe for Supabase migration runner.
-- For large production tables use docs/owner-dashboard-index-concurrent.sql instead.

-- Already exists (do not duplicate): idx_store_orders_store_created_status
--   on (store_id, created_at desc) where coalesce(order_status,'') <> 'cancelled'
-- Owner list has no status filter — add full-store timeline index when cancelled rows matter:
create index if not exists idx_store_orders_store_created_desc
  on public.store_orders (store_id, created_at desc);

create index if not exists idx_store_orders_store_status_pending
  on public.store_orders (store_id, order_status)
  where order_status = 'pending';

create index if not exists idx_store_orders_store_pending_local_delivery
  on public.store_orders (store_id, fulfillment_type, order_status)
  where order_status = 'pending' and fulfillment_type = 'local_delivery';

create index if not exists idx_store_orders_store_refund_requested
  on public.store_orders (store_id, order_status)
  where order_status = 'refund_requested';

create index if not exists idx_store_order_items_order_id
  on public.store_order_items (order_id);

do $$
begin
  if to_regclass('public.store_inquiries') is not null then
    execute 'create index if not exists idx_store_inquiries_store_created_desc on public.store_inquiries (store_id, created_at desc)';
    execute 'create index if not exists idx_store_inquiries_store_status_open on public.store_inquiries (store_id, status) where status = ''open''';
  else
    raise notice 'store_inquiries missing — skip inquiry indexes';
  end if;
end $$;

do $$
begin
  if to_regclass('public.notifications') is not null then
    execute 'create index if not exists idx_notifications_user_unread_created on public.notifications (user_id, created_at desc) where is_read = false';
  else
    raise notice 'notifications missing — skip unread index';
  end if;
end $$;
