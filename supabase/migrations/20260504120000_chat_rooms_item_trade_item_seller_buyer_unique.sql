-- item_trade: 동일 상품·판매자·구매자당 chat_rooms 1행 (규칙 3, 중복 방 방지)
-- 기존 DB에 동일 키 중복이 있으면 이 인덱스 생성 전에 정리 필요
CREATE UNIQUE INDEX IF NOT EXISTS chat_rooms_item_trade_item_seller_buyer_unique
  ON public.chat_rooms (item_id, seller_id, buyer_id)
  WHERE room_type = 'item_trade';
