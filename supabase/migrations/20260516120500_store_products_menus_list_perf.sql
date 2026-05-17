-- Menus list API: has_options without transferring options_json + list index
-- Apply when cold /api/stores/[slug]/menus is dominated by products fetch payload.

alter table public.store_products
  add column if not exists has_options boolean
  generated always as (
    case
      when options_json is null then false
      when jsonb_typeof(options_json) = 'array' then jsonb_array_length(options_json) > 0
      else false
    end
  ) stored;

comment on column public.store_products.has_options is
  'Menus list: options_json non-empty array — avoids list API reading full options_json';

create index if not exists idx_store_products_store_status_sort
  on public.store_products (store_id, product_status, sort_order);
