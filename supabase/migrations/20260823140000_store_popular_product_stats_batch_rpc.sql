-- P1-B discovery: batch platform popular product stats (completed order items only).
-- Metric: SUM(store_order_items.qty) per store_id + product_id.
-- Population: order_status = 'completed' AND created_at >= p_since.
-- TIME AUTHORITY: store_orders.created_at.

create or replace function public.get_store_popular_product_stats_batch(
  p_store_ids uuid[],
  p_since timestamptz,
  p_limit_per_store int
)
returns table (
  store_id uuid,
  product_id uuid,
  total_qty bigint,
  last_ordered_at timestamptz,
  popular_rank integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with aggregated as (
    select
      so.store_id,
      soi.product_id,
      sum(soi.qty)::bigint as total_qty,
      max(so.created_at) as last_ordered_at
    from public.store_order_items as soi
    inner join public.store_orders as so on so.id = soi.order_id
    where
      p_store_ids is not null
      and cardinality(p_store_ids) > 0
      and so.store_id = any (p_store_ids)
      and so.order_status = 'completed'
      and so.created_at >= p_since
    group by so.store_id, soi.product_id
  ),
  ranked as (
    select
      a.store_id,
      a.product_id,
      a.total_qty,
      a.last_ordered_at,
      row_number() over (
        partition by a.store_id
        order by a.total_qty desc, a.last_ordered_at desc, a.product_id asc
      )::integer as popular_rank
    from aggregated as a
  )
  select
    r.store_id,
    r.product_id,
    r.total_qty,
    r.last_ordered_at,
    r.popular_rank
  from ranked as r
  where r.popular_rank <= greatest(1, least(p_limit_per_store, 50));
$$;

comment on function public.get_store_popular_product_stats_batch(uuid[], timestamptz, int) is
  'P1-B discovery platform popular product: SUM(qty) per product since p_since, completed orders only, deterministic per-store rank.';

grant execute on function public.get_store_popular_product_stats_batch(uuid[], timestamptz, int) to authenticated;
grant execute on function public.get_store_popular_product_stats_batch(uuid[], timestamptz, int) to service_role;
