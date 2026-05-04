-- 거래 메신저 방 ↔ 거래글 연결 점검 (Supabase SQL Editor 붙여넣기용)
-- 주의: community_messenger_rooms 에는 trade_post_id / post_id / context_meta 컬럼이 없다.
--       거래글 id 는 product_chats.post_id 및 rooms.summary(JSON) contextMeta.postId 등으로 연결된다.

-- 1) 실제 컬럼 목록
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'community_messenger_rooms'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'product_chats'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'posts'
order by ordinal_position;

-- 2) CM 방 + product_chats 연결 (room id → post_id)
select
  r.id as room_id,
  r.room_type,
  r.direct_key,
  left(r.summary, 400) as summary_prefix,
  pc.id as product_chat_id,
  pc.post_id,
  pc.community_messenger_room_id
from public.community_messenger_rooms r
left join public.product_chats pc
  on pc.community_messenger_room_id = r.id
where r.room_type = 'direct'
order by r.last_message_at desc nulls last
limit 25;

-- 3) product_chats 만 최근 25건
select
  id,
  post_id,
  seller_id,
  buyer_id,
  community_messenger_room_id
from public.product_chats
order by id desc
limit 25;
