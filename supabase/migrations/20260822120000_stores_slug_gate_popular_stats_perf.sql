-- 상세 cold: stores.slug gate + 인기 메뉴 RPC 조인
-- `getApprovedStoreBySlug`: .eq('slug', $1) + approval_status / is_visible (앱에서 검증)
-- `get_store_popular_product_stats`: store_orders → store_order_items

-- slug equality (partial — 공개 API 경로만)
create index if not exists stores_public_slug_lookup_idx
  on public.stores (slug)
  where approval_status = 'approved' and is_visible = true;

comment on index stores_public_slug_lookup_idx is
  'GET /api/stores/[slug]/summary|menus — approved·visible slug gate';

-- 주문→라인 조인 (RPC: so.id = soi.order_id, store_id 필터는 orders 쪽 인덱스)
create index if not exists idx_store_order_items_order_id_product
  on public.store_order_items (order_id, product_id);

comment on index idx_store_order_items_order_id_product is
  'get_store_popular_product_stats join store_orders.id = order_id';
