-- GET /api/stores/browse list indexes (filters + featured product mini fetch)
-- Supabase migration: no CONCURRENTLY (transaction block). For prod see docs/stores-browse-index-concurrent.sql [B].
--
-- Existing: store_categories_slug_uniq, store_topics_category_sort_idx,
--           idx_store_products_store_status_sort

-- browse main: approved + visible + category (+ topic)
create index if not exists stores_browse_main_idx
  on public.stores (store_category_id, store_topic_id)
  where approval_status = 'approved' and is_visible = true;

-- browse orphan: store_category_id is null + business_type ILIKE fallback
create index if not exists stores_browse_orphan_idx
  on public.stores (approval_status, is_visible)
  where store_category_id is null
    and approval_status = 'approved'
    and is_visible = true;

-- taxonomy slug lookup (partial; unique index already on slug)
create index if not exists store_categories_slug_active_idx
  on public.store_categories (slug)
  where is_active = true;

-- topic by category + slug
create index if not exists store_topics_category_slug_active_idx
  on public.store_topics (store_category_id, slug)
  where is_active = true;

-- featured products per store (is_featured first, then sort_order)
create index if not exists store_products_browse_idx
  on public.store_products (store_id, product_status, is_featured desc, sort_order);
