-- Backfill product_chats.community_messenger_room_id when NULL.
-- Matches app contract: ensureCommunityMessengerDirectRoom uses direct_key
--   trade_pc:{product_chats.id} or trade_item:{chat_rooms.id}
-- See lib/community-messenger/service.ts (ensureCommunityMessengerDirectRoom).

-- 1) Primary: CM 방이 trade_pc 원장 키로 이미 존재하는 경우
update public.product_chats pc
set community_messenger_room_id = r.id
from public.community_messenger_rooms r
where pc.community_messenger_room_id is null
  and r.room_type = 'direct'
  and r.direct_key = ('trade_pc:' || pc.id::text);

-- 2) Secondary: item_trade chat_rooms 에만 CM id 가 박혀 있던 레거시
--    (동일 post/seller/buyer 조합 — 앱은 chat_rooms 고유 인덱스로 1행 유도)
update public.product_chats pc
set community_messenger_room_id = cr.community_messenger_room_id
from public.chat_rooms cr
where pc.community_messenger_room_id is null
  and cr.room_type = 'item_trade'
  and cr.item_id = pc.post_id
  and cr.seller_id = pc.seller_id
  and cr.buyer_id = pc.buyer_id
  and cr.community_messenger_room_id is not null;

-- 3) trade_item:{chat_rooms.id} 키만 있고 (1)(2) 로 안 잡힌 경우
--    (chat_rooms.community_messenger_room_id 가 비어 있어도 CM 행이 있으면 연결)
update public.product_chats pc
set community_messenger_room_id = r.id
from public.chat_rooms cr
inner join public.community_messenger_rooms r
  on r.room_type = 'direct'
  and r.direct_key = ('trade_item:' || cr.id::text)
where pc.community_messenger_room_id is null
  and cr.room_type = 'item_trade'
  and cr.item_id = pc.post_id
  and cr.seller_id = pc.seller_id
  and cr.buyer_id = pc.buyer_id;

-- Post-check (run manually if needed):
-- select count(*) from public.product_chats where community_messenger_room_id is null;
