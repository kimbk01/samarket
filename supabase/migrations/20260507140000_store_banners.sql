-- 매장 상단 배너 (사장님 관리 → 고객 매장 페이지)
create table if not exists public.store_banners (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  image_url text not null,
  title text,
  description text,
  link_type text not null default 'none' check (link_type in ('none', 'product', 'notice', 'coupon')),
  link_target_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_banners_store_sort_idx on public.store_banners (store_id, sort_order, id);

comment on table public.store_banners is 'Dibay 매장 배너 — /api/stores/:slug/banners 로 공개 조회';
