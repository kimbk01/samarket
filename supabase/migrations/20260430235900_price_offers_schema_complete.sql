-- =============================================================================
-- SAMarket 가격 제안 — 전체 스키마 (한 번에 적용용)
-- =============================================================================
-- 전제: public.posts(id, user_id), auth.users 가 존재 (Supabase 기본).
-- 앱·서버 코드 컬럼명: product_id, buyer_id, seller_id (고정).
--
-- 멱등: IF NOT EXISTS / DROP IF EXISTS + CREATE / ADD COLUMN IF NOT EXISTS.
-- 레거시 컬럼명은 information_schema 로 확인한 뒤에만 RENAME (추측 컬럼 추가 없음).
--
-- 적용: Supabase SQL Editor 에 통째로 붙여 넣기.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) 거래 글 — 가격 제안 받기 토글
-- -----------------------------------------------------------------------------
alter table public.posts
  add column if not exists is_price_offer boolean not null default false;

comment on column public.posts.is_price_offer is
  'true 이면 구매자 가격 제안 허용 (public.price_offers 와 연동).';


-- -----------------------------------------------------------------------------
-- 2) 레거시 price_offers 컬럼명 정렬 (테이블이 있을 때만, 컬럼 존재 시에만 RENAME)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.price_offers') is not null then

  -- product_id
  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'post_id'
  ) and not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'product_id'
  ) then
    alter table public.price_offers rename column post_id to product_id;
  elsif exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'item_id'
  ) and not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'product_id'
  ) then
    alter table public.price_offers rename column item_id to product_id;
  end if;

  -- buyer_id (구매자)
  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'buyer_user_id'
  ) and not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'buyer_id'
  ) then
    alter table public.price_offers rename column buyer_user_id to buyer_id;
  elsif exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'buyer_id'
  ) then
    alter table public.price_offers rename column user_id to buyer_id;
  end if;

  -- seller_id (판매자) — 앱과 동일한 이름으로 통일
  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'seller_user_id'
  ) and not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'seller_id'
  ) then
    alter table public.price_offers rename column seller_user_id to seller_id;
  elsif exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'listing_seller_id'
  ) and not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'seller_id'
  ) then
    alter table public.price_offers rename column listing_seller_id to seller_id;
  elsif exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'post_owner_id'
  ) and not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'seller_id'
  ) then
    alter table public.price_offers rename column post_owner_id to seller_id;
  elsif exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'owner_user_id'
  ) and not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'seller_id'
  ) then
    alter table public.price_offers rename column owner_user_id to seller_id;
  end if;

  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 3) price_offers 본체 (정식 스키마 — 신규 DB)
-- -----------------------------------------------------------------------------
create table if not exists public.price_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.posts (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  original_price numeric not null check (original_price >= 0),
  offered_price numeric not null check (offered_price > 0),
  message text null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'expired')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint price_offers_buyer_seller_diff check (buyer_id <> seller_id)
);


-- -----------------------------------------------------------------------------
-- 3a) 레거시 테이블에만 있는 부분 스키마 보강 (CREATE TABLE IF NOT EXISTS 가 스킵된 경우)
--     앱이 기대하는 컬럼: original_price, offered_price, message, status, created_at, updated_at
-- -----------------------------------------------------------------------------
alter table public.price_offers add column if not exists original_price numeric;
alter table public.price_offers add column if not exists offered_price numeric;
alter table public.price_offers add column if not exists message text;
alter table public.price_offers add column if not exists status text;
alter table public.price_offers add column if not exists created_at timestamptz;
alter table public.price_offers add column if not exists updated_at timestamptz;

-- 게시글 가격으로 정가 스냅샷 채움
update public.price_offers po
set original_price = greatest(
  0,
  floor(coalesce(p.price::numeric, 0))
)::numeric
from public.posts p
where p.id = po.product_id
  and po.original_price is null;

update public.price_offers po
set original_price = greatest(0, floor(coalesce(po.original_price::numeric, 0)))::numeric
where po.original_price is null;

-- 제안가: 비어 있으면 정가와 동일하게 두되 최소 1 (체크 offered_price > 0)
update public.price_offers po
set offered_price = greatest(
  1,
  floor(coalesce(po.offered_price::numeric, po.original_price::numeric, nullif(p.price::numeric, 0), 1))
)::numeric
from public.posts p
where p.id = po.product_id
  and po.offered_price is null;

update public.price_offers
set offered_price = greatest(1, floor(coalesce(offered_price::numeric, original_price::numeric, 1))::numeric)
where offered_price is null;

update public.price_offers
set status = 'pending'
where status is null
   or btrim(status::text) = '';

update public.price_offers
set status = 'pending'
where status not in ('pending', 'accepted', 'rejected', 'expired');

update public.price_offers
set created_at = coalesce(created_at, timezone('utc', now()))
where created_at is null;

update public.price_offers
set updated_at = coalesce(updated_at, timezone('utc', now()))
where updated_at is null;

alter table public.price_offers alter column original_price set not null;
alter table public.price_offers alter column offered_price set not null;
alter table public.price_offers alter column status set not null;


-- -----------------------------------------------------------------------------
-- 3b) seller_id 가 없거나 남아 NULL 인 행: 게시글 작성자(posts.user_id)로 보정
--      (컬럼이 통째로 없던 레거시 테이블용 — product_id 가 유효할 때만 채워짐)
-- -----------------------------------------------------------------------------
alter table public.price_offers
  add column if not exists seller_id uuid references auth.users (id) on delete cascade;

update public.price_offers po
set seller_id = p.user_id
from public.posts p
where p.id = po.product_id
  and po.seller_id is null;

alter table public.price_offers
  alter column seller_id set not null;


-- -----------------------------------------------------------------------------
-- 4) 인덱스
-- -----------------------------------------------------------------------------
create unique index if not exists price_offers_pending_unique_idx
  on public.price_offers (product_id, buyer_id)
  where status = 'pending';

create index if not exists price_offers_buyer_created_idx
  on public.price_offers (buyer_id, created_at desc);

create index if not exists price_offers_seller_created_idx
  on public.price_offers (seller_id, created_at desc);

create index if not exists price_offers_product_status_created_idx
  on public.price_offers (product_id, status, created_at desc);


-- -----------------------------------------------------------------------------
-- 5) updated_at 트리거
-- -----------------------------------------------------------------------------
create or replace function public.price_offers_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists price_offers_set_updated_at on public.price_offers;
create trigger price_offers_set_updated_at
before update on public.price_offers
for each row
execute function public.price_offers_set_updated_at();


-- -----------------------------------------------------------------------------
-- 6) RLS — 삽입 행 컬럼은 모두 public.price_offers.* 로 한정
-- -----------------------------------------------------------------------------
alter table public.price_offers enable row level security;

drop policy if exists price_offers_select_participants on public.price_offers;
create policy price_offers_select_participants
  on public.price_offers
  for select
  to authenticated
  using (
    auth.uid() = public.price_offers.buyer_id
    or auth.uid() = public.price_offers.seller_id
  );

drop policy if exists price_offers_insert_buyer on public.price_offers;
create policy price_offers_insert_buyer
  on public.price_offers
  for insert
  to authenticated
  with check (
    auth.uid() = public.price_offers.buyer_id
    and public.price_offers.buyer_id <> public.price_offers.seller_id
    and public.price_offers.status = 'pending'
    and exists (
      select 1
      from public.posts as p
      where p.id = public.price_offers.product_id
        and p.user_id = public.price_offers.seller_id
    )
  );

drop policy if exists price_offers_update_participants on public.price_offers;
create policy price_offers_update_participants
  on public.price_offers
  for update
  to authenticated
  using (
    auth.uid() = public.price_offers.seller_id
    or auth.uid() = public.price_offers.buyer_id
  )
  with check (
    auth.uid() = public.price_offers.seller_id
    or (
      auth.uid() = public.price_offers.buyer_id
      and public.price_offers.status = 'expired'
    )
  );


-- -----------------------------------------------------------------------------
-- 7) 설명
-- -----------------------------------------------------------------------------
comment on table public.price_offers is
  '거래 글 가격 제안. 승인 시에만 기존 거래 채팅으로 연결된다.';
comment on column public.price_offers.original_price is
  '제안 생성 시점의 게시 판매가 스냅샷.';
comment on column public.price_offers.offered_price is
  '구매자가 제안한 금액.';

-- 트리거 오류 시: execute function → execute procedure (Postgres 버전에 따라)


-- -----------------------------------------------------------------------------
-- 8) (선택) 레거시 amount 컬럼 NOT NULL — offered_price 와 동기화
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'amount'
  )
  and exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'price_offers' and c.column_name = 'offered_price'
  ) then
    execute $createfn$
      create or replace function public.price_offers_sync_amount_before_write()
      returns trigger
      language plpgsql
      as $fnbody$
      begin
        new.amount := coalesce(new.amount, new.offered_price);
        return new;
      end;
      $fnbody$;
    $createfn$;

    drop trigger if exists price_offers_sync_amount_before_write on public.price_offers;
    create trigger price_offers_sync_amount_before_write
      before insert or update of offered_price on public.price_offers
      for each row
      execute function public.price_offers_sync_amount_before_write();
  end if;
end
$$;
