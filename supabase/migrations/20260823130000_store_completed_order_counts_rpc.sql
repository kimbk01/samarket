-- P1-A Popular Store: batch completed-order counts for discovery ranking.
-- Metric: COUNT(*) WHERE order_status = 'completed' AND created_at >= p_since.
-- TIME AUTHORITY: store_orders.created_at (no completed_at on store_orders).

create index if not exists idx_store_orders_store_completed_created
  on public.store_orders (store_id, created_at desc)
  where order_status = 'completed';

create or replace function public.get_store_completed_order_counts(
  p_store_ids uuid[],
  p_since timestamptz
)
returns table (
  store_id uuid,
  completed_order_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    so.store_id,
    count(*)::integer as completed_order_count
  from public.store_orders as so
  where
    p_store_ids is not null
    and cardinality(p_store_ids) > 0
    and so.store_id = any (p_store_ids)
    and so.order_status = 'completed'
    and so.created_at >= p_since
  group by so.store_id;
$$;

comment on function public.get_store_completed_order_counts(uuid[], timestamptz) is
  'P1-A popular store: completed order count per store since p_since (created_at window, completed status only).';

grant execute on function public.get_store_completed_order_counts(uuid[], timestamptz) to authenticated;
grant execute on function public.get_store_completed_order_counts(uuid[], timestamptz) to service_role;
