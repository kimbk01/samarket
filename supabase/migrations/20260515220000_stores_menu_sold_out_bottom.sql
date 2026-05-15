-- 매장 메뉴판: 품절 상품을 카테고리 하단으로 모을지 여부 (기본: 원래 순서 유지)
alter table public.stores
  add column if not exists menu_sold_out_bottom boolean not null default false;

comment on column public.stores.menu_sold_out_bottom is
  'true면 카테고리 내 목록에서 품절 상품을 sort_order 정렬 후 하단으로 이동';
