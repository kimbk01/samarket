-- 인기 메뉴 집계 RPC + 인덱스 + admin_settings 기본값

create index if not exists idx_store_orders_store_created_status
  on public.store_orders (store_id, created_at desc)
  where coalesce(order_status, '') <> 'cancelled';

create index if not exists idx_store_order_items_product
  on public.store_order_items (product_id);

create or replace function public.get_store_popular_product_stats(
  p_store_id uuid,
  p_since timestamptz,
  p_limit int
)
returns table (
  product_id uuid,
  total_qty bigint,
  last_ordered_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    soi.product_id,
    sum(soi.qty)::bigint as total_qty,
    max(so.created_at) as last_ordered_at
  from public.store_order_items soi
  inner join public.store_orders so on so.id = soi.order_id
  where so.store_id = p_store_id
    and so.created_at >= p_since
    and coalesce(so.order_status, '') <> 'cancelled'
    and (
      so.order_status = 'completed'
      or coalesce(so.payment_status, '') = 'paid'
    )
  group by soi.product_id
  order by total_qty desc, last_ordered_at desc
  limit greatest(1, least(p_limit, 50));
$$;

comment on function public.get_store_popular_product_stats(uuid, timestamptz, int) is
  '매장 인기 메뉴: 최근 기간 completed 또는 paid 주문 라인 수량 합산';

insert into public.admin_settings (key, value_json, updated_at)
values
  ('popular_menu_window_days', '{"value":30}'::jsonb, now()),
  ('popular_menu_min_qty', '{"value":1}'::jsonb, now()),
  ('popular_menu_top_n', '{"value":5}'::jsonb, now()),
  ('popular_menu_recommended_max', '{"value":10}'::jsonb, now())
on conflict (key) do nothing;
