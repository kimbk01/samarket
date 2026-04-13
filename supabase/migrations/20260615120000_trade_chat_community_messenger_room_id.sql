-- 거래 채팅 ↔ 메신저 1:1 방 단일 FK (store_orders.community_messenger_room_id 와 동일 패턴).
-- 런타임 브리지 대신 원장으로 조회·이동 경로를 고정한다.

alter table public.product_chats
  add column if not exists community_messenger_room_id uuid null
  references public.community_messenger_rooms (id) on delete set null;

alter table public.chat_rooms
  add column if not exists community_messenger_room_id uuid null
  references public.community_messenger_rooms (id) on delete set null;

comment on column public.product_chats.community_messenger_room_id is
  '거래(product_chats)에 대응하는 community_messenger_rooms.id — 메신저 방 URL·부트스트랩 단일 조회용';

comment on column public.chat_rooms.community_messenger_room_id is
  'item_trade 방에 대응하는 community_messenger_rooms.id — product_chats 와 동기';

create index if not exists product_chats_community_messenger_room_id_idx
  on public.product_chats (community_messenger_room_id)
  where community_messenger_room_id is not null;

create index if not exists chat_rooms_community_messenger_room_id_idx
  on public.chat_rooms (community_messenger_room_id)
  where community_messenger_room_id is not null;
