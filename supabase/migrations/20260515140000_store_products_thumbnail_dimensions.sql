-- 대표 이미지 메타(목록 레이아웃·CLS 완화). 상세 갤러리는 images_json 유지.
alter table public.store_products
  add column if not exists thumbnail_width integer,
  add column if not exists thumbnail_height integer;

comment on column public.store_products.thumbnail_width is '대표(thumbnail_url) 이미지 가로 픽셀(선택)';
comment on column public.store_products.thumbnail_height is '대표(thumbnail_url) 이미지 세로 픽셀(선택)';
