-- HS3-RETRY: item_trade direct_keys 경로에서 chat_rooms + product_chats(pc 후보)를 단일 DB 라운드로 묶어
-- 클라이언트 왕복 2회를 1회로 줄인다. JS DISTINCT ON 규칙과 동일하게 triple당 첫 행을 고른다.

create or replace function public.home_sync_direct_keys_item_trade_rows(p_room_ids uuid[])
returns table (
  room_id uuid,
  item_id uuid,
  seller_id uuid,
  buyer_id uuid,
  pc_id uuid,
  pc_post_id uuid,
  pc_seller_id uuid,
  pc_buyer_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with cr as (
    select id, item_id, seller_id, buyer_id
    from public.chat_rooms
    where room_type = 'item_trade'
      and id = any(coalesce(p_room_ids, '{}'::uuid[]))
  ),
  pc_dedup as (
    select distinct on (pc.post_id, pc.seller_id, pc.buyer_id)
      pc.id,
      pc.post_id,
      pc.seller_id,
      pc.buyer_id
    from public.product_chats pc
    where pc.post_id in (select distinct cr.item_id from cr)
    order by pc.post_id asc, pc.seller_id asc, pc.buyer_id asc, pc.id asc
  )
  select
    cr.id as room_id,
    cr.item_id,
    cr.seller_id,
    cr.buyer_id,
    p.id as pc_id,
    p.post_id as pc_post_id,
    p.seller_id as pc_seller_id,
    p.buyer_id as pc_buyer_id
  from cr
  left join pc_dedup p
    on p.post_id = cr.item_id
   and p.seller_id = cr.seller_id
   and p.buyer_id = cr.buyer_id;
$$;

comment on function public.home_sync_direct_keys_item_trade_rows(uuid[]) is
  'home-sync critical: item_trade chat_rooms IN + product_chats 후보를 단일 SQL로 반환 (HS3-RETRY bundle).';

grant execute on function public.home_sync_direct_keys_item_trade_rows(uuid[]) to authenticated;
grant execute on function public.home_sync_direct_keys_item_trade_rows(uuid[]) to service_role;
