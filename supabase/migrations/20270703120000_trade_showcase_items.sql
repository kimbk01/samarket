-- P-7 (2026-10-27, Owner 승인 계획안 v3): 거래 「샘플 상품」 — 실제 거래 글(posts)과 완전히 분리된 예시 카탈로그.
-- 채팅·찜·신고·통계·알림 경로가 posts 만 보므로 샘플이 실제 매물로 섞일 경로가 없다.
-- 쓰기는 service_role(어드민 API)만. 공개 읽기는 활성 행만.

create table if not exists public.trade_showcase_items (
  id uuid primary key default gen_random_uuid(),
  trade_category_id uuid null references public.categories(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  price numeric(14, 2) null check (price is null or price >= 0),
  price_note text null check (price_note is null or char_length(price_note) <= 40),
  region_label text null check (region_label is null or char_length(region_label) <= 60),
  description text null check (description is null or char_length(description) <= 2000),
  image_urls text[] not null default '{}' check (cardinality(image_urls) <= 10),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trade_showcase_items_active_order_idx
  on public.trade_showcase_items (is_active, sort_order, created_at desc);
create index if not exists trade_showcase_items_category_idx
  on public.trade_showcase_items (trade_category_id) where is_active;

alter table public.trade_showcase_items enable row level security;

drop policy if exists trade_showcase_items_public_select_active on public.trade_showcase_items;
create policy trade_showcase_items_public_select_active
  on public.trade_showcase_items
  for select
  to anon, authenticated
  using (is_active);

revoke insert, update, delete on public.trade_showcase_items from anon, authenticated;
grant select on public.trade_showcase_items to anon, authenticated;

comment on table public.trade_showcase_items is
  'P-7 거래 샘플 상품(예시 · 거래 불가). posts 와 분리 — 채팅/찜/신고/통계 대상 아님. 쓰기는 어드민 API(service_role)만.';
