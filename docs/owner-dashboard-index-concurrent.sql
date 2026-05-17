-- =============================================================================
-- ERROR 25001 방지 안내
-- =============================================================================
-- CREATE INDEX CONCURRENTLY 는 트랜잭션 블록 안에서 실행할 수 없습니다.
-- Supabase SQL Editor 에서 이 파일 전체를 붙여넣고 Run 하면 실패합니다.
--
-- 선택지 A (권장, SQL Editor 한 번에 실행 가능):
--   → docs/owner-dashboard-index-proposal.sql 사용
--   → CONCURRENTLY 없음, IF NOT EXISTS 만 사용
--
-- 선택지 B (대용량 PROD, 다운타임 최소):
--   → 아래 문장을 **한 줄씩** 별도 쿼리로 실행 (매번 Run 1회)
--   → 또는 psql / Supabase CLI: autocommit 모드에서 1문장씩
--
-- 선택지 C:
--   → supabase db push (migration 20260517100000_owner_dashboard_api_indexes.sql)
-- =============================================================================

-- ---------- RUN #1 only (then wait until finished) ----------
-- create index concurrently if not exists idx_store_orders_store_created_desc
--   on public.store_orders (store_id, created_at desc);

-- ---------- RUN #2 only ----------
-- create index concurrently if not exists idx_store_orders_store_status_pending
--   on public.store_orders (store_id, order_status)
--   where order_status = 'pending';

-- ---------- RUN #3 only ----------
-- create index concurrently if not exists idx_store_orders_store_pending_local_delivery
--   on public.store_orders (store_id, fulfillment_type, order_status)
--   where order_status = 'pending' and fulfillment_type = 'local_delivery';

-- ---------- RUN #4 only ----------
-- create index concurrently if not exists idx_store_orders_store_refund_requested
--   on public.store_orders (store_id, order_status)
--   where order_status = 'refund_requested';

-- ---------- RUN #5 only ----------
-- create index concurrently if not exists idx_store_order_items_order_id
--   on public.store_order_items (order_id);

-- ---------- RUN #6 only (if store_inquiries exists) ----------
-- create index concurrently if not exists idx_store_inquiries_store_created_desc
--   on public.store_inquiries (store_id, created_at desc);

-- ---------- RUN #7 only (if store_inquiries exists) ----------
-- create index concurrently if not exists idx_store_inquiries_store_status_open
--   on public.store_inquiries (store_id, status)
--   where status = 'open';

-- ---------- RUN #8 only (if notifications exists) ----------
-- create index concurrently if not exists idx_notifications_user_unread_created
--   on public.notifications (user_id, created_at desc)
--   where is_read = false;
