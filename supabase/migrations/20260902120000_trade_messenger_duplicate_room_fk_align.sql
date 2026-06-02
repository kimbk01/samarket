-- 거래 메신저: trade_pc + trade_item 이중 CM 방 — product_chats FK 를 trade_item(canonical) 쪽으로 정렬.
-- 메시지·participant 병합은 앱 ensure 수렴 + 운영 스크립트; 여기서는 목록·진입 FK 만 맞춘다.
-- @see docs/trade-chat-room-identity.md

update public.product_chats pc
set community_messenger_room_id = r_item.id
from public.chat_rooms cr
inner join public.community_messenger_rooms r_item
  on r_item.room_type = 'direct'
  and r_item.direct_key = ('trade_item:' || cr.id::text)
where cr.room_type = 'item_trade'
  and cr.item_id = pc.post_id
  and cr.seller_id = pc.seller_id
  and cr.buyer_id = pc.buyer_id
  and (
    pc.community_messenger_room_id is null
    or pc.community_messenger_room_id is distinct from r_item.id
  );

update public.chat_rooms cr
set community_messenger_room_id = r_item.id
from public.community_messenger_rooms r_item
where cr.room_type = 'item_trade'
  and r_item.room_type = 'direct'
  and r_item.direct_key = ('trade_item:' || cr.id::text)
  and (
    cr.community_messenger_room_id is null
    or cr.community_messenger_room_id is distinct from r_item.id
  );
