-- =============================================================================
-- [A] Supabase SQL Editor / migration / db push
--     Use this block only (no CONCURRENTLY). Run all at once. No error 25001.
-- =============================================================================

create index if not exists stores_browse_main_idx
  on public.stores (store_category_id, store_topic_id)
  where approval_status = 'approved' and is_visible = true;

create index if not exists stores_browse_orphan_idx
  on public.stores (approval_status, is_visible)
  where store_category_id is null
    and approval_status = 'approved'
    and is_visible = true;

create index if not exists store_categories_slug_active_idx
  on public.store_categories (slug)
  where is_active = true;

create index if not exists store_topics_category_slug_active_idx
  on public.store_topics (store_category_id, slug)
  where is_active = true;

create index if not exists store_products_browse_idx
  on public.store_products (store_id, product_status, is_featured desc, sort_order);

-- Same as: supabase/migrations/20260516180000_stores_browse_list_perf.sql

-- =============================================================================
-- [B] Production zero-downtime only: run ONE statement at a time (not as a batch).
--     CREATE INDEX CONCURRENTLY cannot run inside a transaction (error 25001).
-- =============================================================================

-- create index concurrently if not exists stores_browse_main_idx
--   on public.stores (store_category_id, store_topic_id)
--   where approval_status = 'approved' and is_visible = true;

-- create index concurrently if not exists stores_browse_orphan_idx
--   on public.stores (approval_status, is_visible)
--   where store_category_id is null
--     and approval_status = 'approved'
--     and is_visible = true;

-- create index concurrently if not exists store_categories_slug_active_idx
--   on public.store_categories (slug)
--   where is_active = true;

-- create index concurrently if not exists store_topics_category_slug_active_idx
--   on public.store_topics (store_category_id, slug)
--   where is_active = true;

-- create index concurrently if not exists store_products_browse_idx
--   on public.store_products (store_id, product_status, is_featured desc, sort_order);
