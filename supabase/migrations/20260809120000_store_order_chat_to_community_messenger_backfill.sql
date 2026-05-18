-- 배달·매장 주문 채팅 full migrate:
-- order_chat_* 원장을 community_messenger_* 원장으로 재실행 가능하게 backfill 한다.
-- 실제 order_chat_* table drop 은 운영 검증 후 별도 승인으로 진행한다.

alter table public.store_orders
  add column if not exists community_messenger_room_id uuid null
    references public.community_messenger_rooms (id) on delete set null;

create index if not exists store_orders_community_messenger_room_id_idx
  on public.store_orders (community_messenger_room_id)
  where community_messenger_room_id is not null;

with source_rooms as (
  select
    ocr.order_id,
    ocr.order_no,
    ocr.store_id,
    ocr.store_name,
    ocr.buyer_user_id,
    ocr.owner_user_id,
    ocr.order_flow,
    ocr.last_message,
    ocr.last_message_at,
    ocr.created_at,
    ocr.updated_at,
    so.fulfillment_type,
    so.order_status,
    so.payment_amount,
    so.total_amount,
    coalesce(existing_new.id, existing_legacy.id, so.community_messenger_room_id) as existing_room_id
  from public.order_chat_rooms ocr
  join public.store_orders so on so.id = ocr.order_id
  left join public.community_messenger_rooms existing_new
    on existing_new.room_type = 'direct'
   and existing_new.direct_key = ('store_order:' || ocr.order_id::text)
  left join public.community_messenger_rooms existing_legacy
    on existing_legacy.room_type = 'direct'
   and existing_legacy.direct_key = ('trade_order:' || ocr.order_id::text)
),
inserted_rooms as (
  insert into public.community_messenger_rooms (
    room_type,
    room_status,
    is_readonly,
    created_by,
    direct_key,
    title,
    summary,
    last_message,
    last_message_type,
    last_message_at,
    created_at,
    updated_at
  )
  select
    'direct',
    'active',
    false,
    sr.owner_user_id,
    'store_order:' || sr.order_id::text,
    '',
    jsonb_strip_nulls(jsonb_build_object(
      'v', 1,
      'kind', 'delivery',
      'headline', concat(coalesce(nullif(sr.store_name, ''), '매장'), ' · 주문 ', nullif(sr.order_no, '')),
      'storeOrderId', sr.order_id::text,
      'orderNo', nullif(sr.order_no, ''),
      'storeId', sr.store_id::text,
      'fulfillmentType', nullif(sr.fulfillment_type, ''),
      'stepLabel', nullif(sr.order_status, ''),
      'priceLabel', case
        when coalesce(sr.payment_amount, sr.total_amount, 0) > 0
          then '₱' || to_char(coalesce(sr.payment_amount, sr.total_amount, 0), 'FM999,999,999,990')
        else null
      end
    ))::text,
    coalesce(sr.last_message, ''),
    'system',
    coalesce(sr.last_message_at, sr.created_at, now()),
    coalesce(sr.created_at, now()),
    coalesce(sr.updated_at, now())
  from source_rooms sr
  where sr.existing_room_id is null
  on conflict (direct_key) do nothing
  returning id, direct_key
),
resolved_rooms as (
  select
    sr.*,
    coalesce(sr.existing_room_id, ir.id, rn.id, rl.id) as room_id
  from source_rooms sr
  left join inserted_rooms ir on ir.direct_key = ('store_order:' || sr.order_id::text)
  left join public.community_messenger_rooms rn
    on rn.room_type = 'direct'
   and rn.direct_key = ('store_order:' || sr.order_id::text)
  left join public.community_messenger_rooms rl
    on rl.room_type = 'direct'
   and rl.direct_key = ('trade_order:' || sr.order_id::text)
),
participant_source as (
  select room_id, buyer_user_id as user_id, 'member'::text as role, 0 as unread_count, created_at from resolved_rooms
  where room_id is not null and buyer_user_id is not null
  union all
  select room_id, owner_user_id as user_id, 'owner'::text as role, 0 as unread_count, created_at from resolved_rooms
  where room_id is not null and owner_user_id is not null
),
inserted_participants as (
  insert into public.community_messenger_participants (
    room_id,
    user_id,
    role,
    unread_count,
    joined_at
  )
  select room_id, user_id, role, unread_count, coalesce(created_at, now())
  from participant_source
  on conflict (room_id, user_id) do update
    set role = case
      when excluded.role = 'owner' then 'owner'
      else public.community_messenger_participants.role
    end
  returning room_id
)
update public.store_orders so
set community_messenger_room_id = rr.room_id
from resolved_rooms rr
where so.id = rr.order_id
  and rr.room_id is not null
  and so.community_messenger_room_id is distinct from rr.room_id;

with room_map as (
  select
    ocr.id as legacy_room_id,
    ocr.order_id,
    coalesce(so.community_messenger_room_id, rn.id, rl.id) as room_id
  from public.order_chat_rooms ocr
  join public.store_orders so on so.id = ocr.order_id
  left join public.community_messenger_rooms rn
    on rn.room_type = 'direct'
   and rn.direct_key = ('store_order:' || ocr.order_id::text)
  left join public.community_messenger_rooms rl
    on rl.room_type = 'direct'
   and rl.direct_key = ('trade_order:' || ocr.order_id::text)
),
inserted_messages as (
  insert into public.community_messenger_messages (
    room_id,
    sender_id,
    message_type,
    content,
    metadata,
    created_at
  )
  select
    rm.room_id,
    ocm.sender_id,
    case
      when ocm.message_type = 'image' then 'image'
      when ocm.message_type in ('system', 'admin_note') then 'system'
      else 'text'
    end,
    coalesce(nullif(ocm.content, ''), nullif(ocm.image_url, ''), ''),
    jsonb_strip_nulls(jsonb_build_object(
      'domain', 'store_order',
      'storeOrderId', ocm.order_id::text,
      'legacyOrderChatRoomId', ocm.room_id::text,
      'legacyOrderChatMessageId', ocm.id::text,
      'legacySenderType', ocm.sender_type,
      'legacyMessageType', ocm.message_type,
      'imageUrl', nullif(ocm.image_url, ''),
      'orderStatus', ocm.related_order_status
    )),
    coalesce(ocm.created_at, now())
  from public.order_chat_messages ocm
  join room_map rm on rm.legacy_room_id = ocm.room_id
  where rm.room_id is not null
    and not exists (
      select 1
      from public.community_messenger_messages cmm
      where cmm.room_id = rm.room_id
        and cmm.metadata ->> 'legacyOrderChatMessageId' = ocm.id::text
    )
  returning room_id
)
update public.community_messenger_rooms cmr
set
  last_message = latest.content,
  last_message_type = latest.message_type,
  last_message_at = latest.created_at,
  updated_at = now()
from (
  select distinct on (m.room_id)
    m.room_id,
    m.content,
    m.message_type,
    m.created_at
  from public.community_messenger_messages m
  where m.room_id in (select room_id from room_map where room_id is not null)
    and m.deleted_at is null
  order by m.room_id, m.created_at desc
) latest
where cmr.id = latest.room_id;

with read_source as (
  select
    so.community_messenger_room_id as room_id,
    p.user_id,
    p.unread_count,
    p.last_read_at,
    (
      select cmm.id
      from public.community_messenger_messages cmm
      where cmm.room_id = so.community_messenger_room_id
        and cmm.metadata ->> 'legacyOrderChatMessageId' = p.last_read_message_id::text
      limit 1
    ) as last_read_message_id
  from public.order_chat_participants p
  join public.order_chat_rooms ocr on ocr.id = p.room_id
  join public.store_orders so on so.id = ocr.order_id
  where so.community_messenger_room_id is not null
)
update public.community_messenger_participants cmp
set
  unread_count = greatest(0, coalesce(rs.unread_count, 0)),
  last_read_at = rs.last_read_at,
  last_read_message_id = rs.last_read_message_id
from read_source rs
where cmp.room_id = rs.room_id
  and cmp.user_id = rs.user_id;
