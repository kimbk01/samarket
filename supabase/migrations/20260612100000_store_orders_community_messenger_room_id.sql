/*
  Optional FK: store_orders -> community_messenger_rooms for server-side link / backfill.
  App does not require this column (order_id bridge works without it).
*/

alter table public.store_orders
  add column if not exists community_messenger_room_id uuid null
    references public.community_messenger_rooms (id) on delete set null;

comment on column public.store_orders.community_messenger_room_id is
  'Optional: community_messenger room id for buyer/store 1:1 linked to this order.';

create index if not exists store_orders_community_messenger_room_id_idx
  on public.store_orders (community_messenger_room_id)
  where community_messenger_room_id is not null;
