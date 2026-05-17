-- =============================================================================
-- Owner dashboard API indexes — Supabase SQL Editor 에서 이 파일 사용
-- (CONCURRENTLY 없음 → 트랜잭션 안에서도 실행 가능, 전체 붙여넣기 OK)
--
-- owner-dashboard-index-concurrent.sql 은 PROD 대용량용이며
-- SQL Editor 에서 한꺼번에 실행하면 ERROR 25001 이 납니다.
-- =============================================================================
-- Owner dashboard API indexes — SQL Editor / manual apply
-- Verified against migrations:
--   - store_orders: order_status, fulfillment_type, store_id, created_at (timestamptz)
--   - store_order_items: order_id (FK), product_id (idx_store_order_items_product exists)
--   - store_inquiries: store_id, status, created_at (app queries)
--   - notifications: user_id, is_read, created_at
--
-- EXISTING (skip — do not duplicate names):
--   idx_store_orders_store_created_status  (store_id, created_at desc) partial non-cancelled
--   idx_store_order_items_product          (product_id)
--   notifications_user_push_kind_created_idx (user_id, push_kind, created_at desc)
-- =============================================================================

-- §1 store_orders — owner list (no status filter; partial non-cancelled index may not cover all rows)
create index if not exists idx_store_orders_store_created_desc
  on public.store_orders (store_id, created_at desc);

-- §2 store_orders — order-counts head counts
create index if not exists idx_store_orders_store_status_pending
  on public.store_orders (store_id, order_status)
  where order_status = 'pending';

create index if not exists idx_store_orders_store_pending_local_delivery
  on public.store_orders (store_id, fulfillment_type, order_status)
  where order_status = 'pending' and fulfillment_type = 'local_delivery';

create index if not exists idx_store_orders_store_refund_requested
  on public.store_orders (store_id, order_status)
  where order_status = 'refund_requested';

-- §3 store_order_items — orders list IN (order_id)
create index if not exists idx_store_order_items_order_id
  on public.store_order_items (order_id);

-- §4 store_inquiries — owner list + open count (table may be absent in some envs)
do $$
begin
  if to_regclass('public.store_inquiries') is not null then
    execute $sql$
      create index if not exists idx_store_inquiries_store_created_desc
        on public.store_inquiries (store_id, created_at desc)
    $sql$;
    execute $sql$
      create index if not exists idx_store_inquiries_store_status_open
        on public.store_inquiries (store_id, status)
        where status = 'open'
    $sql$;
  else
    raise notice 'store_inquiries not found — skipped';
  end if;
end $$;

-- §5 notifications — unread scan (owner_store_commerce_unread_only path)
do $$
begin
  if to_regclass('public.notifications') is not null then
    execute $sql$
      create index if not exists idx_notifications_user_unread_created
        on public.notifications (user_id, created_at desc)
        where is_read = false
    $sql$;
  else
    raise notice 'notifications not found — skipped';
  end if;
end $$;

-- Verify (optional):
-- select indexname, indexdef from pg_indexes
-- where tablename in ('store_orders','store_order_items','store_inquiries','notifications')
--   and indexname like 'idx_%owner%' or indexname like 'idx_store_orders%' or indexname like 'idx_notifications_user_unread%'
-- order by 1;
