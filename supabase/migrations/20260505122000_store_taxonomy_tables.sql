-- Store taxonomy (categories/topics) for /stores and business apply/admin.
-- This migration creates:
-- - store_categories (primary)
-- - store_topics (secondary)

create extension if not exists "pgcrypto";

-- 1) Primary categories
create table if not exists public.store_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists store_categories_slug_uniq on public.store_categories (slug);
create index if not exists store_categories_active_sort_idx on public.store_categories (is_active, sort_order);

-- 2) Secondary topics
create table if not exists public.store_topics (
  id uuid primary key default gen_random_uuid(),
  store_category_id uuid not null references public.store_categories(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists store_topics_slug_uniq on public.store_topics (slug);
create index if not exists store_topics_category_sort_idx on public.store_topics (store_category_id, sort_order);
create index if not exists store_topics_active_idx on public.store_topics (is_active);

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_store_categories_updated_at on public.store_categories;
create trigger trg_store_categories_updated_at
before update on public.store_categories
for each row
execute function public.set_updated_at();

drop trigger if exists trg_store_topics_updated_at on public.store_topics;
create trigger trg_store_topics_updated_at
before update on public.store_topics
for each row
execute function public.set_updated_at();

