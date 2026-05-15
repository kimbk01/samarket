-- 배민식 메뉴판: 사장님 추천·대표 메뉴 플래그 분리 (기존 is_featured 와 병행 백필)

alter table public.store_products
  add column if not exists is_owner_recommended boolean not null default false,
  add column if not exists is_representative boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_products'
      and column_name = 'is_featured'
  ) then
    update public.store_products
    set is_owner_recommended = true
    where coalesce(is_featured, false) = true
      and coalesce(is_owner_recommended, false) = false;
  end if;
end $$;

comment on column public.store_products.is_owner_recommended is '사장님 추천 — 카테고리 본문과 별도 상단 섹션 중복 노출 가능';
comment on column public.store_products.is_representative is '대표 메뉴 — 상단 가로 카드 등(카테고리에서 제외하지 않음)';
