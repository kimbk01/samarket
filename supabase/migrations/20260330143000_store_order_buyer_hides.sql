-- 구매자 주문 내역 "내 목록에서만 삭제" 용도
-- 원본 store_orders 는 유지되어 매장/관리자 화면에는 영향이 없다.
create table if not exists public.store_order_buyer_hides (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  buyer_user_id uuid not null references public.test_users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, buyer_user_id)
);

create index if not exists idx_store_order_buyer_hides_buyer
  on public.store_order_buyer_hides (buyer_user_id, hidden_at desc);

create index if not exists idx_store_order_buyer_hides_order
  on public.store_order_buyer_hides (order_id);

