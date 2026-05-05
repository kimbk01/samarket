-- Delivery-only bottom navigation configuration for /stores surface.
-- UI consumes only active items; admins manage ordering/visibility.

create extension if not exists "pgcrypto";

create table if not exists public.delivery_bottom_nav_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  icon_key text not null,
  href text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_center boolean not null default false,
  requires_store_id boolean not null default false,
  color text not null default '#1C8DB8',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_bottom_nav_items_active_sort_idx
  on public.delivery_bottom_nav_items (is_active, sort_order asc, id asc);

-- Center button must be unique (at most one is_center = true).
create unique index if not exists delivery_bottom_nav_items_one_center_uniq
  on public.delivery_bottom_nav_items (is_center)
  where is_center = true;

-- updated_at trigger helper (shared).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_delivery_bottom_nav_items_updated_at on public.delivery_bottom_nav_items;
create trigger trg_delivery_bottom_nav_items_updated_at
before update on public.delivery_bottom_nav_items
for each row
execute function public.set_updated_at();

alter table public.delivery_bottom_nav_items enable row level security;

-- Users can read active items only.
drop policy if exists delivery_bottom_nav_items_authenticated_select on public.delivery_bottom_nav_items;
create policy delivery_bottom_nav_items_authenticated_select
  on public.delivery_bottom_nav_items
  for select
  to authenticated
  using (is_active = true);

-- Admin-only mutations.
drop policy if exists delivery_bottom_nav_items_admin_insert on public.delivery_bottom_nav_items;
create policy delivery_bottom_nav_items_admin_insert
  on public.delivery_bottom_nav_items
  for insert
  to authenticated
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists delivery_bottom_nav_items_admin_update on public.delivery_bottom_nav_items;
create policy delivery_bottom_nav_items_admin_update
  on public.delivery_bottom_nav_items
  for update
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists delivery_bottom_nav_items_admin_delete on public.delivery_bottom_nav_items;
create policy delivery_bottom_nav_items_admin_delete
  on public.delivery_bottom_nav_items
  for delete
  to authenticated
  using (public.is_platform_admin(auth.uid()));

-- Seed defaults (idempotent-ish; avoids duplicates by href+icon_key).
insert into public.delivery_bottom_nav_items (label, icon_key, href, sort_order, is_active, is_center, requires_store_id, color)
select v.label, v.icon_key, v.href, v.sort_order, v.is_active, v.is_center, v.requires_store_id, v.color
from (values
  ('내주문', 'orders', '/my/store-orders', 0, true, false, false, '#1C8DB8'),
  ('장바구니', 'cart', '/stores/cart', 1, true, false, false, '#1C8DB8'),
  ('홈', 'home', '/philife', 2, true, true, false, '#1C8DB8'),
  ('내매장', 'store', '/my/business', 3, true, false, true, '#1C8DB8'),
  ('내정보', 'user', '/mypage', 4, true, false, false, '#1C8DB8')
) as v(label, icon_key, href, sort_order, is_active, is_center, requires_store_id, color)
where not exists (
  select 1
  from public.delivery_bottom_nav_items i
  where i.href = v.href and i.icon_key = v.icon_key
);

