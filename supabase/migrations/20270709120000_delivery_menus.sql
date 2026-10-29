-- 배달 고객 화면 「메뉴」 — 업종(store_categories·store_topics)과 분리된 화면 구성.
-- 업종 = 내부 구분·수수료 기준(변경 없음). 메뉴 = 어드민이 만드는 1단(페이지)·2단(탭).
-- 설계: docs/audit/delivery-baemin-master-plan-2026-10-29.md WP1
--
-- 1단: parent_id IS NULL, primary_category_id 필수(1차 업종 1개당 1단 메뉴 1개).
-- 2단: parent_id = 1단, 연결 2차 업종(delivery_menu_sources) + 매장 개별 추가·제외(delivery_menu_store_overrides).
-- 2단 연결 업종·개별 매장은 부모 1단의 1차 업종 안에서만 허용(트리거).
-- 고객·어드민 모두 서버(service role) API로만 읽고 쓴다 → RLS 켜고 정책 없음.

create table if not exists public.delivery_menus (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.delivery_menus(id) on delete cascade,
  primary_category_id uuid references public.store_categories(id) on delete restrict,
  slug text not null,
  name_ko text not null,
  name_en text,
  icon_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  show_on_home boolean not null default false,
  home_sort_order integer not null default 0,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_menus_level_chk check (
    (parent_id is null and primary_category_id is not null)
    or (parent_id is not null and primary_category_id is null)
  ),
  constraint delivery_menus_slug_chk check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  constraint delivery_menus_window_chk check (start_at is null or end_at is null or start_at < end_at)
);

create unique index if not exists delivery_menus_slug_uniq on public.delivery_menus (slug);
create unique index if not exists delivery_menus_primary_uniq
  on public.delivery_menus (primary_category_id) where parent_id is null;
create index if not exists delivery_menus_parent_sort_idx on public.delivery_menus (parent_id, sort_order);

comment on table public.delivery_menus is
  'Customer delivery menus (1단 page / 2단 tab). Separate from store taxonomy (commission basis).';

drop trigger if exists trg_delivery_menus_updated_at on public.delivery_menus;
create trigger trg_delivery_menus_updated_at
before update on public.delivery_menus
for each row execute function public.set_updated_at();

-- 2단만 부모를 가질 수 있음 (3단 금지)
create or replace function public.delivery_menus_parent_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'delivery_menu_parent_self' using errcode = '23514';
    end if;
    if exists (select 1 from public.delivery_menus p where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'delivery_menu_depth_exceeded' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_menus_parent_guard on public.delivery_menus;
create trigger trg_delivery_menus_parent_guard
before insert or update of parent_id on public.delivery_menus
for each row execute function public.delivery_menus_parent_guard();

create table if not exists public.delivery_menu_sources (
  menu_id uuid not null references public.delivery_menus(id) on delete cascade,
  topic_id uuid not null references public.store_topics(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (menu_id, topic_id)
);

create index if not exists delivery_menu_sources_topic_idx on public.delivery_menu_sources (topic_id);

create table if not exists public.delivery_menu_store_overrides (
  menu_id uuid not null references public.delivery_menus(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  mode text not null check (mode in ('include', 'exclude')),
  created_at timestamptz not null default now(),
  primary key (menu_id, store_id)
);

create index if not exists delivery_menu_store_overrides_store_idx on public.delivery_menu_store_overrides (store_id);

-- 연결 업종·개별 매장은 2단 메뉴에만, 부모 1단의 1차 업종 안에서만
create or replace function public.delivery_menu_child_scope_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_parent uuid;
  v_primary uuid;
  v_target_primary uuid;
begin
  select m.parent_id into v_parent from public.delivery_menus m where m.id = new.menu_id;
  if v_parent is null then
    raise exception 'delivery_menu_source_requires_child_menu' using errcode = '23514';
  end if;
  select p.primary_category_id into v_primary from public.delivery_menus p where p.id = v_parent;

  if tg_table_name = 'delivery_menu_sources' then
    select t.store_category_id into v_target_primary from public.store_topics t where t.id = new.topic_id;
  else
    select s.store_category_id into v_target_primary from public.stores s where s.id = new.store_id;
  end if;

  if v_target_primary is distinct from v_primary then
    raise exception 'delivery_menu_scope_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_menu_sources_scope on public.delivery_menu_sources;
create trigger trg_delivery_menu_sources_scope
before insert or update on public.delivery_menu_sources
for each row execute function public.delivery_menu_child_scope_guard();

drop trigger if exists trg_delivery_menu_store_overrides_scope on public.delivery_menu_store_overrides;
create trigger trg_delivery_menu_store_overrides_scope
before insert or update on public.delivery_menu_store_overrides
for each row execute function public.delivery_menu_child_scope_guard();

alter table public.delivery_menus enable row level security;
alter table public.delivery_menu_sources enable row level security;
alter table public.delivery_menu_store_overrides enable row level security;

-- 초기 메뉴 = 현재 업종과 같은 구성 (배포 직후 고객 화면 구성 불변)
insert into public.delivery_menus (parent_id, primary_category_id, slug, name_ko, name_en, icon_url, sort_order, is_active, show_on_home, home_sort_order)
select null, c.id, c.slug, c.name, c.name_en, c.image_url, c.sort_order, c.is_active, true, c.sort_order
from public.store_categories c
where c.slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'
on conflict do nothing;

insert into public.delivery_menus (parent_id, primary_category_id, slug, name_ko, name_en, icon_url, sort_order, is_active, show_on_home, home_sort_order)
select m.id, null, t.slug, t.name, t.name_en, t.image_url, t.sort_order, t.is_active, false, 0
from public.store_topics t
join public.delivery_menus m on m.primary_category_id = t.store_category_id and m.parent_id is null
where t.slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'
on conflict do nothing;

insert into public.delivery_menu_sources (menu_id, topic_id)
select dm.id, t.id
from public.store_topics t
join public.delivery_menus parent on parent.primary_category_id = t.store_category_id and parent.parent_id is null
join public.delivery_menus dm on dm.parent_id = parent.id and dm.slug = t.slug
on conflict do nothing;
