-- 매장 공지 (위치별 노출 — 사장님 관리 → 고객 매장 페이지)
create table if not exists public.store_notices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  title text not null,
  body text not null default '',
  images_json jsonb not null default '[]'::jsonb,
  placement text not null check (placement in ('store_top', 'menu_top', 'review_top', 'info_tab')),
  is_active boolean not null default true,
  start_at timestamptz,
  end_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_notices_store_placement_sort_idx
  on public.store_notices (store_id, placement, sort_order, id);

comment on table public.store_notices is 'Dibay 매장 공지 — placement별 /api/stores/:slug/notices';
