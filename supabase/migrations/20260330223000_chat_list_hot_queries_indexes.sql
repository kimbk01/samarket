-- 채팅 목록·거래 채팅 조회 핫패스: product_chats OR(seller_id,buyer_id) + 정렬
-- chat_room_participants: 본인 참여 방 조회
-- store_orders: 구매자 주문 목록
create index if not exists idx_product_chats_seller_last_at
  on public.product_chats (seller_id, last_message_at desc nulls last);

create index if not exists idx_product_chats_buyer_last_at
  on public.product_chats (buyer_id, last_message_at desc nulls last);

create index if not exists idx_chat_room_participants_user_hidden_room
  on public.chat_room_participants (user_id, hidden)
  where hidden = false;

create index if not exists idx_store_orders_buyer_created
  on public.store_orders (buyer_user_id, created_at desc);
