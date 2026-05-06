-- Rider/dispatch domain (v1): delivery_riders + store_order_deliveries
-- - store_orders.order_status 는 유지, 배차/배송은 별도 테이블로 운영
-- - 구매자 위치 노출은 v1 에서 하지 않으므로 tracking_logs 는 보류

-- Base table: riders (platform-managed)
create table if not exists public.delivery_riders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  rider_status text not null default 'active',
  is_online boolean not null default false,
  current_lat double precision,
  current_lng double precision,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_riders_user_id_idx on public.delivery_riders (user_id);
create index if not exists delivery_riders_online_idx on public.delivery_riders (is_online, updated_at desc);

-- Per-order delivery record (single source for dispatch status)
create table if not exists public.store_order_deliveries (
  order_id uuid primary key references public.store_orders(id) on delete cascade,
  store_id uuid not null,
  buyer_user_id uuid not null,
  rider_id uuid references public.delivery_riders(id) on delete set null,
  delivery_status text not null default 'waiting_rider',
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_order_deliveries_store_status_idx
  on public.store_order_deliveries (store_id, delivery_status, updated_at desc);
create index if not exists store_order_deliveries_buyer_updated_idx
  on public.store_order_deliveries (buyer_user_id, updated_at desc);
create index if not exists store_order_deliveries_rider_status_idx
  on public.store_order_deliveries (rider_id, delivery_status, updated_at desc);

-- updated_at triggers (shared helper `public.set_updated_at()` expected)
drop trigger if exists trg_delivery_riders_updated_at on public.delivery_riders;
create trigger trg_delivery_riders_updated_at
before update on public.delivery_riders
for each row
execute function public.set_updated_at();

drop trigger if exists trg_store_order_deliveries_updated_at on public.store_order_deliveries;
create trigger trg_store_order_deliveries_updated_at
before update on public.store_order_deliveries
for each row
execute function public.set_updated_at();

-- RLS
alter table public.delivery_riders enable row level security;
alter table public.store_order_deliveries enable row level security;

-- delivery_riders: admin-only read/write (rider UI is admin surface)
drop policy if exists delivery_riders_admin_select on public.delivery_riders;
create policy delivery_riders_admin_select
  on public.delivery_riders
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

drop policy if exists delivery_riders_admin_insert on public.delivery_riders;
create policy delivery_riders_admin_insert
  on public.delivery_riders
  for insert
  to authenticated
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists delivery_riders_admin_update on public.delivery_riders;
create policy delivery_riders_admin_update
  on public.delivery_riders
  for update
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists delivery_riders_admin_delete on public.delivery_riders;
create policy delivery_riders_admin_delete
  on public.delivery_riders
  for delete
  to authenticated
  using (public.is_platform_admin(auth.uid()));

-- store_order_deliveries: buyer can read their rows; store owner can read rows for own store; admin can read/write
drop policy if exists store_order_deliveries_buyer_select on public.store_order_deliveries;
create policy store_order_deliveries_buyer_select
  on public.store_order_deliveries
  for select
  to authenticated
  using (buyer_user_id = auth.uid());

drop policy if exists store_order_deliveries_owner_select on public.store_order_deliveries;
create policy store_order_deliveries_owner_select
  on public.store_order_deliveries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_order_deliveries.store_id
        and s.owner_user_id = auth.uid()
    )
  );

drop policy if exists store_order_deliveries_admin_select on public.store_order_deliveries;
create policy store_order_deliveries_admin_select
  on public.store_order_deliveries
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

drop policy if exists store_order_deliveries_admin_insert on public.store_order_deliveries;
create policy store_order_deliveries_admin_insert
  on public.store_order_deliveries
  for insert
  to authenticated
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists store_order_deliveries_admin_update on public.store_order_deliveries;
create policy store_order_deliveries_admin_update
  on public.store_order_deliveries
  for update
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists store_order_deliveries_admin_delete on public.store_order_deliveries;
create policy store_order_deliveries_admin_delete
  on public.store_order_deliveries
  for delete
  to authenticated
  using (public.is_platform_admin(auth.uid()));

-- Publication (Realtime) — idempotent add
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'delivery_rt_pub: supabase_realtime publication 없음 — 건너뜀';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'store_order_deliveries'
  ) then
    execute 'alter publication supabase_realtime add table public.store_order_deliveries';
    raise notice 'delivery_rt_pub: public.store_order_deliveries publication 추가';
  else
    raise notice 'delivery_rt_pub: store_order_deliveries already in publication';
  end if;
end $$;

