-- 레거시 거래 채팅(product_chats) 나가기 — 문의중 자동 집계에서 해당 스레드 제외
alter table public.product_chats
  add column if not exists seller_left_at timestamptz,
  add column if not exists buyer_left_at timestamptz;

comment on column public.product_chats.seller_left_at is
  '판매자가 레거시 채팅방에서 나간 시각 — 양방향 문의중 집계 시 제외';
comment on column public.product_chats.buyer_left_at is
  '구매자가 레거시 채팅방에서 나간 시각 — 양방향 문의중 집계 시 제외';
