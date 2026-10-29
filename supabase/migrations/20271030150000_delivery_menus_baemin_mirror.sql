-- 배달 메뉴 — 배민 미러링 (설계: docs/audit/delivery-baemin-mirror-design-v6-2026-10-30.html §4·§5·§8)
-- 1단(parent_id null) = 홈 상단 탭 (음식배달·픽업·장보기·쇼핑·선물하기·혜택모아보기). 업종과 무관.
-- 2단 = 아이콘·메뉴 페이지 탭. 매장은 하나씩 지정(delivery_menu_store_overrides mode='include'), 업종 제한 없음.
-- 업종(store_categories·store_topics)·수수료는 바꾸지 않는다.
-- 안전장치: 노출 매장은 항상 메뉴 1개 이상 (업종 기본 메뉴 자동 배정 · 마지막 연결 삭제 거부 · 매장 남은 메뉴 삭제 거부).

-- ── 1. 구조 ─────────────────────────────────────────────
alter table public.delivery_menus drop constraint if exists delivery_menus_level_chk;
drop index if exists public.delivery_menus_primary_uniq;

alter table public.delivery_menus
  add column if not exists show_in_page_tab boolean not null default true,
  add column if not exists link_target text,
  add column if not exists pickup_only boolean not null default false,
  add column if not exists badge_text text,
  add column if not exists show_feature boolean not null default false,
  add column if not exists feature_title text,
  add column if not exists feature_image_url text,
  add column if not exists feature_bg text,
  add column if not exists feature_link_target text;

alter table public.delivery_menus drop constraint if exists delivery_menus_link_target_chk;
alter table public.delivery_menus add constraint delivery_menus_link_target_chk check (
  (link_target is null or link_target in (
    'gift_mall', 'gift_platform', 'gift_store', 'gift_owned', 'gift_received', 'gift_sent',
    'coupons', 'points', 'events', 'member_benefits'))
  and (feature_link_target is null or feature_link_target in (
    'gift_mall', 'gift_platform', 'gift_store', 'gift_owned', 'gift_received', 'gift_sent',
    'coupons', 'points', 'events', 'member_benefits'))
);

alter table public.delivery_menus drop constraint if exists delivery_menus_feature_bg_chk;
alter table public.delivery_menus add constraint delivery_menus_feature_bg_chk check (
  feature_bg is null or feature_bg ~ '^#[0-9A-Fa-f]{6}$'
);

alter table public.delivery_menu_store_overrides
  add column if not exists sort_order integer not null default 0;

create table if not exists public.delivery_menu_shortcuts (
  root_menu_id uuid not null references public.delivery_menus(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  sort_order integer not null default 0,
  caption text,
  created_at timestamptz not null default now(),
  primary key (root_menu_id, store_id)
);
alter table public.delivery_menu_shortcuts enable row level security;

create table if not exists public.delivery_menu_defaults (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.store_categories(id) on delete cascade,
  topic_id uuid references public.store_topics(id) on delete cascade,
  menu_id uuid not null references public.delivery_menus(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint delivery_menu_defaults_scope_uniq unique nulls not distinct (category_id, topic_id)
);
alter table public.delivery_menu_defaults enable row level security;

comment on table public.delivery_menu_defaults is
  '업종(1차, 2차) → 기본 메뉴. 승인 화면 미리 선택 · 노출 매장 자동 배정 · 미배정 매장 표시 폴백.';

-- 이전 구조(1단 = 1차 업종) 의 업종 범위 트리거 제거 — 메뉴는 업종과 무관
drop trigger if exists trg_delivery_menu_sources_scope on public.delivery_menu_sources;
drop trigger if exists trg_delivery_menu_store_overrides_scope on public.delivery_menu_store_overrides;
drop function if exists public.delivery_menu_child_scope_guard();

-- 2단에만 매장·연결 지정
create or replace function public.delivery_menu_assignment_child_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.delivery_menus m where m.id = new.menu_id and m.parent_id is not null) then
    raise exception 'delivery_menu_assignment_requires_child_menu' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_menu_store_overrides_child on public.delivery_menu_store_overrides;
create trigger trg_delivery_menu_store_overrides_child
before insert or update of menu_id on public.delivery_menu_store_overrides
for each row execute function public.delivery_menu_assignment_child_guard();

-- ── 2. 이전 메뉴 정리 (운영: 개별 매장 지정 0건 · 1차 업종 복사본) ─────────
delete from public.delivery_menu_sources;
delete from public.delivery_menu_store_overrides;
delete from public.delivery_menus where parent_id is not null;
delete from public.delivery_menus;

-- 메뉴는 업종과 무관 — 정리 뒤에 건다 (이전 1단 행은 1차 업종을 가졌음)
alter table public.delivery_menus drop constraint if exists delivery_menus_mirror_level_chk;
alter table public.delivery_menus add constraint delivery_menus_mirror_level_chk check (primary_category_id is null);

-- ── 3. 상단 탭·메뉴 초기값 (배민 순서) ─────────────────────
insert into public.delivery_menus
  (slug, name_ko, name_en, sort_order, show_on_home, home_sort_order, pickup_only, show_feature, feature_title, feature_bg, feature_link_target)
values
  ('food',    '음식배달',     'Food delivery', 1, true, 1, false, false, null, null, null),
  ('pickup',  '픽업',         'Pickup',        2, true, 2, true,  true, '가까운 매장에서 바로 픽업', '#EAC784', null),
  ('shop',    '장보기·쇼핑',  'Groceries & Shopping', 3, true, 3, false, false, null, null, null),
  ('gift',    '선물하기',     'Gifts',         4, true, 4, false, true, '마음을 상품권으로 전해요', '#EAC784', 'gift_mall'),
  ('benefit', '혜택모아보기', 'Benefits',      5, true, 5, false, true, '모든 혜택을 한눈에', '#EAC784', 'coupons');

-- 2단: (상단 탭, slug, 이름, 영문, 탭 순서, 홈 표시, 홈 순서, 화면 연결)
insert into public.delivery_menus
  (parent_id, slug, name_ko, name_en, sort_order, show_on_home, home_sort_order, link_target)
select r.id, v.slug, v.name_ko, v.name_en, v.sort_order, v.show_on_home, v.home_sort_order, v.link_target
from (values
  ('food', 'korean',        '한식',        'Korean',        1, true, 1, null),
  ('food', 'chinese',       '중식',        'Chinese',       2, true, 2, null),
  ('food', 'western',       '양식',        'Western',       3, true, 3, null),
  ('food', 'snack',         '분식',        'Snacks',        4, true, 4, null),
  ('food', 'chicken',       '치킨',        'Chicken',       5, true, 5, null),
  ('food', 'pizza',         '피자',        'Pizza',         6, true, 6, null),
  ('food', 'stew',          '찜·탕',       'Stews',         7, true, 7, null),
  ('food', 'late-night',    '야식',        'Late night',    8, true, 8, null),
  ('food', 'cafe-dessert',  '카페·디저트', 'Cafe & dessert', 9, true, 9, null),
  ('pickup', 'p-coffee',    '커피',        'Coffee',        1, true, 1, null),
  ('pickup', 'p-bakery',    '베이커리',    'Bakery',        2, true, 2, null),
  ('pickup', 'p-meal',      '식사',        'Meals',         3, true, 3, null),
  ('pickup', 'p-chicken',   '치킨',        'Chicken',       4, true, 4, null),
  ('pickup', 'p-snack',     '분식',        'Snacks',        5, true, 5, null),
  ('pickup', 'p-pizza',     '피자',        'Pizza',         6, true, 6, null),
  ('shop', 'k-mart',        '한인마트',    'Korean mart',   1, true, 1, null),
  ('shop', 'local-mart',    '로컬마트',    'Local mart',    2, true, 2, null),
  ('shop', 'meat',          '정육',        'Meat',          3, true, 3, null),
  ('shop', 'seafood',       '수산',        'Seafood',       4, true, 4, null),
  ('shop', 'side-dish',     '반찬',        'Side dishes',   5, true, 5, null),
  ('shop', 'fruit',         '과일',        'Fruit',         6, true, 6, null),
  ('shop', 'tools',         '공구',        'Tools',         7, true, 7, null),
  ('shop', 'pet',           '펫',          'Pet',           8, true, 8, null),
  ('shop', 'pet-care',      '펫케어',      'Pet care',      9, false, 9, null),
  ('shop', 'beauty',        '뷰티',        'Beauty',       10, false, 10, null),
  ('shop', 'academy',       '학원',        'Academy',      11, false, 11, null),
  ('shop', 'cleaning',      '청소',        'Cleaning',     12, false, 12, null),
  ('shop', 'laundry',       '세탁',        'Laundry',      13, false, 13, null),
  ('shop', 'repair',        '수리',        'Repair',       14, false, 14, null),
  ('gift', 'gift-mall',     '상품권몰',    'Gift mall',     1, true, 1, 'gift_mall'),
  ('gift', 'gift-dibay',    'DIBAY 상품권', 'DIBAY gifts',  2, true, 2, 'gift_platform'),
  ('gift', 'gift-store',    '매장 상품권', 'Store gifts',   3, true, 3, 'gift_store'),
  ('gift', 'gift-owned',    '선물함',      'My gifts',      4, true, 4, 'gift_owned'),
  ('gift', 'gift-received', '받은 선물',   'Received',      5, true, 5, 'gift_received'),
  ('gift', 'gift-sent',     '보낸 선물',   'Sent',          6, true, 6, 'gift_sent'),
  ('benefit', 'coupons',    '쿠폰함',      'Coupons',       1, true, 1, 'coupons'),
  ('benefit', 'points',     '포인트',      'Points',        2, true, 2, 'points'),
  ('benefit', 'events',     '이벤트',      'Events',        3, true, 3, 'events'),
  ('benefit', 'member-benefits', '회원 혜택', 'Member benefits', 4, true, 4, 'member_benefits')
) as v(root_slug, slug, name_ko, name_en, sort_order, show_on_home, home_sort_order, link_target)
join public.delivery_menus r on r.slug = v.root_slug and r.parent_id is null;

-- ── 4. 매장 지정 — 업종(1차, 2차) 단위 ─────────────────────
insert into public.delivery_menu_store_overrides (menu_id, store_id, mode, sort_order)
select m.id, s.id, 'include', row_number() over (partition by m.id order by s.store_name)
from (values
  ('korean', 'restaurant', 'korean'),
  ('chinese', 'restaurant', 'chinese'),
  ('western', 'restaurant', 'western'),
  ('snack', 'restaurant', 'snack'),
  ('chicken', 'restaurant', 'chicken'),
  ('pizza', 'restaurant', 'pizza'),
  ('cafe-dessert', 'restaurant', 'dessert'),
  ('cafe-dessert', 'cafe', 'coffee'),
  ('cafe-dessert', 'cafe', 'bakery'),
  ('p-coffee', 'cafe', 'coffee'),
  ('p-bakery', 'cafe', 'bakery'),
  ('p-meal', 'restaurant', 'korean'),
  ('p-meal', 'restaurant', 'chinese'),
  ('p-meal', 'restaurant', 'western'),
  ('p-chicken', 'restaurant', 'chicken'),
  ('p-snack', 'restaurant', 'snack'),
  ('p-pizza', 'restaurant', 'pizza'),
  ('k-mart', 'mart', 'korean-mart'),
  ('local-mart', 'mart', 'local-mart'),
  ('meat', 'mart', 'meat'),
  ('seafood', 'mart', 'seafood'),
  ('side-dish', 'mart', 'side-dish'),
  ('fruit', 'mart', 'fruit'),
  ('tools', 'hardware', null),
  ('pet', 'pet', 'pet-food'),
  ('pet', 'pet', 'pet-snack'),
  ('pet', 'pet', 'pet-goods'),
  ('pet-care', 'pet', 'pet-groom'),
  ('pet-care', 'pet', 'pet-hospital'),
  ('beauty', 'beauty', null),
  ('academy', 'academy', null),
  ('cleaning', 'life', 'cleaning'),
  ('laundry', 'life', 'laundry'),
  ('repair', 'life', 'repair')
) as v(menu_slug, category_slug, topic_slug)
join public.delivery_menus m on m.slug = v.menu_slug and m.parent_id is not null
join public.store_categories c on c.slug = v.category_slug
join public.stores s on s.store_category_id = c.id
left join public.store_topics t on t.id = s.store_topic_id
where s.approval_status = 'approved'
  and s.is_visible = true
  and (v.topic_slug is null or t.slug = v.topic_slug)
on conflict (menu_id, store_id) do nothing;

-- 브런치(카페) → 양식, 한 매장 여러 메뉴 예시 (찜·탕 · 야식)
insert into public.delivery_menu_store_overrides (menu_id, store_id, mode, sort_order)
select m.id, s.id, 'include', 100 + row_number() over (partition by m.id order by s.store_name)
from (values
  ('western', 'cafe', 'brunch', null),
  ('stew', 'restaurant', 'korean', '서울국밥'),
  ('stew', 'restaurant', 'korean', '한마당 백반'),
  ('late-night', 'restaurant', 'chicken', '숯불닭'),
  ('late-night', 'restaurant', 'chicken', '바삭치킨하우스'),
  ('late-night', 'restaurant', 'pizza', '피자앤펍'),
  ('late-night', 'restaurant', 'snack', '떡볶이공장')
) as v(menu_slug, category_slug, topic_slug, store_name)
join public.delivery_menus m on m.slug = v.menu_slug and m.parent_id is not null
join public.store_categories c on c.slug = v.category_slug
join public.stores s on s.store_category_id = c.id
join public.store_topics t on t.id = s.store_topic_id and t.slug = v.topic_slug
where s.approval_status = 'approved'
  and s.is_visible = true
  and (v.store_name is null or s.store_name = v.store_name)
on conflict (menu_id, store_id) do nothing;

-- ── 5. 업종 기본 메뉴 (S1) ─────────────────────────────
insert into public.delivery_menu_defaults (category_id, topic_id, menu_id)
select c.id, t.id, m.id
from (values
  ('restaurant', null, 'korean'),
  ('restaurant', 'korean', 'korean'),
  ('restaurant', 'chinese', 'chinese'),
  ('restaurant', 'western', 'western'),
  ('restaurant', 'snack', 'snack'),
  ('restaurant', 'chicken', 'chicken'),
  ('restaurant', 'pizza', 'pizza'),
  ('restaurant', 'dessert', 'cafe-dessert'),
  ('cafe', null, 'cafe-dessert'),
  ('cafe', 'brunch', 'western'),
  ('mart', null, 'local-mart'),
  ('mart', 'korean-mart', 'k-mart'),
  ('mart', 'local-mart', 'local-mart'),
  ('mart', 'meat', 'meat'),
  ('mart', 'seafood', 'seafood'),
  ('mart', 'side-dish', 'side-dish'),
  ('mart', 'fruit', 'fruit'),
  ('hardware', null, 'tools'),
  ('pet', null, 'pet'),
  ('pet', 'pet-groom', 'pet-care'),
  ('pet', 'pet-hospital', 'pet-care'),
  ('beauty', null, 'beauty'),
  ('academy', null, 'academy'),
  ('life', null, 'repair'),
  ('life', 'cleaning', 'cleaning'),
  ('life', 'laundry', 'laundry'),
  ('life', 'repair', 'repair')
) as v(category_slug, topic_slug, menu_slug)
join public.store_categories c on c.slug = v.category_slug
left join public.store_topics t on t.store_category_id = c.id and t.slug = v.topic_slug
join public.delivery_menus m on m.slug = v.menu_slug and m.parent_id is not null
where v.topic_slug is null or t.id is not null
on conflict on constraint delivery_menu_defaults_scope_uniq do nothing;

-- ── 6. 매장 바로가기 줄 ─────────────────────────────────
insert into public.delivery_menu_shortcuts (root_menu_id, store_id, sort_order)
select r.id, s.id, v.sort_order
from (values
  ('food', '소담한식', 1), ('food', '홍반점', 2), ('food', '나폴리 화덕피자', 3), ('food', '스위트문', 4), ('food', '숯불닭', 5),
  ('shop', '코리아마트 마닐라', 1), ('shop', '한빛마켓', 2), ('shop', '우리장터 한인마트', 3), ('shop', '전동공구센터', 4), ('shop', '냠냠펫', 5)
) as v(root_slug, store_name, sort_order)
join public.delivery_menus r on r.slug = v.root_slug and r.parent_id is null
join public.stores s on s.store_name = v.store_name and s.approval_status = 'approved' and s.is_visible = true
on conflict do nothing;

insert into public.delivery_menu_shortcuts (root_menu_id, store_id, sort_order)
select r.id, g.store_id, row_number() over (order by g.store_name)
from public.delivery_menus r
join lateral (
  select distinct s.id as store_id, s.store_name
  from public.gift_certificate_products p
  join public.stores s on s.id = p.store_id
  where s.approval_status = 'approved' and s.is_visible = true
  order by s.store_name
  limit 5
) g on true
where r.slug = 'gift' and r.parent_id is null
on conflict do nothing;

-- ── 7. 안전장치 (S4) ───────────────────────────────────
-- 7-a. 노출 매장 — 메뉴 0개면 업종 기본 메뉴에 자동 배정, 기본 메뉴도 없으면 거부
create or replace function public.stores_ensure_delivery_menu_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_menu uuid;
begin
  if new.approval_status is distinct from 'approved' or new.is_visible is distinct from true then
    return new;
  end if;
  if exists (
    select 1 from public.delivery_menu_store_overrides o
    where o.store_id = new.id and o.mode = 'include'
  ) then
    return new;
  end if;
  select d.menu_id into v_menu
  from public.delivery_menu_defaults d
  where d.category_id = new.store_category_id
    and (d.topic_id = new.store_topic_id or d.topic_id is null)
  order by (d.topic_id is null) asc
  limit 1;
  if v_menu is null then
    raise exception 'delivery_menu_required' using errcode = '23514',
      detail = 'approved visible store needs at least one delivery menu (no default menu for its category)';
  end if;
  insert into public.delivery_menu_store_overrides (menu_id, store_id, mode, sort_order)
  values (v_menu, new.id, 'include', 1000)
  on conflict (menu_id, store_id) do update set mode = 'include';
  return new;
end;
$$;

drop trigger if exists trg_stores_ensure_delivery_menu on public.stores;
create trigger trg_stores_ensure_delivery_menu
after insert or update of approval_status, is_visible, store_category_id, store_topic_id on public.stores
for each row execute function public.stores_ensure_delivery_menu_assignment();

-- 7-b. 노출 매장의 마지막 메뉴 연결 삭제 거부 (매장 자체 삭제·숨김 매장은 허용)
create or replace function public.delivery_menu_last_assignment_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.mode is distinct from 'include' then
    return old;
  end if;
  if not exists (
    select 1 from public.stores s
    where s.id = old.store_id and s.approval_status = 'approved' and s.is_visible = true
  ) then
    return old;
  end if;
  if exists (
    select 1 from public.delivery_menu_store_overrides o
    where o.store_id = old.store_id and o.mode = 'include'
      and o.menu_id <> old.menu_id
  ) then
    return old;
  end if;
  raise exception 'delivery_menu_last_assignment' using errcode = '23514',
    detail = 'store must stay in at least one delivery menu — assign another menu first';
end;
$$;

drop trigger if exists trg_delivery_menu_last_assignment on public.delivery_menu_store_overrides;
create trigger trg_delivery_menu_last_assignment
before delete on public.delivery_menu_store_overrides
for each row execute function public.delivery_menu_last_assignment_guard();

-- 7-c. 다른 메뉴에 없는 노출 매장이 남은 메뉴 삭제 거부 (먼저 다른 메뉴로 옮김)
create or replace function public.delivery_menus_delete_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if exists (
    select 1 from public.delivery_menu_store_overrides o
    join public.stores s on s.id = o.store_id
    where o.menu_id = old.id and o.mode = 'include'
      and s.approval_status = 'approved' and s.is_visible = true
      and not exists (
        select 1 from public.delivery_menu_store_overrides o2
        where o2.store_id = o.store_id and o2.mode = 'include' and o2.menu_id <> old.id
      )
  ) then
    raise exception 'delivery_menu_has_stores' using errcode = '23514',
      detail = 'move the stores of this menu to another menu first';
  end if;
  if exists (select 1 from public.delivery_menu_defaults d where d.menu_id = old.id) then
    raise exception 'delivery_menu_is_default' using errcode = '23514',
      detail = 'this menu is a default menu of a store category — change the default first';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_delivery_menus_delete_guard on public.delivery_menus;
create trigger trg_delivery_menus_delete_guard
before delete on public.delivery_menus
for each row execute function public.delivery_menus_delete_guard();
