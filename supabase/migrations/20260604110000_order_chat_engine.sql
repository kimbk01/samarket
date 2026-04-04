create table if not exists public.order_chat_rooms (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.store_orders(id) on delete cascade,
  order_no text not null default '',
  store_id uuid not null references public.stores(id) on delete cascade,
  store_name text not null default '',
  buyer_user_id uuid not null references public.profiles(id) on delete cascade,
  buyer_name text not null default '',
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  owner_name text not null default '',
  order_flow text not null default 'pickup' check (order_flow in ('delivery', 'pickup')),
  room_status text not null default 'active' check (room_status in ('active', 'closed', 'admin_review', 'blocked')),
  last_message text not null default '',
  last_message_at timestamptz not null default now(),
  unread_count_buyer integer not null default 0,
  unread_count_owner integer not null default 0,
  unread_count_admin integer not null default 0,
  last_chat_order_status text null check (
    last_chat_order_status in (
      'pending',
      'accepted',
      'preparing',
      'delivering',
      'ready_for_pickup',
      'arrived',
      'completed',
      'cancel_requested',
      'cancelled',
      'refund_requested',
      'refunded'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_chat_rooms_buyer_idx
  on public.order_chat_rooms (buyer_user_id, last_message_at desc);

create index if not exists order_chat_rooms_owner_idx
  on public.order_chat_rooms (owner_user_id, last_message_at desc);

create table if not exists public.order_chat_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.order_chat_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('buyer', 'owner')),
  unread_count integer not null default 0,
  last_read_message_id uuid null,
  last_read_at timestamptz null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists order_chat_participants_user_idx
  on public.order_chat_participants (user_id, role, is_active);

create table if not exists public.order_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.order_chat_rooms(id) on delete cascade,
  order_id uuid not null references public.store_orders(id) on delete cascade,
  sender_type text not null check (sender_type in ('buyer', 'owner', 'admin', 'system')),
  sender_id uuid null references public.profiles(id) on delete set null,
  sender_name text not null default '',
  message_type text not null check (message_type in ('text', 'image', 'system', 'admin_note')),
  content text not null default '',
  image_url text null,
  related_order_status text null check (
    related_order_status in (
      'pending',
      'accepted',
      'preparing',
      'delivering',
      'ready_for_pickup',
      'arrived',
      'completed',
      'cancel_requested',
      'cancelled',
      'refund_requested',
      'refunded'
    )
  ),
  is_read_by_buyer boolean not null default false,
  is_read_by_owner boolean not null default false,
  is_read_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists order_chat_messages_room_created_idx
  on public.order_chat_messages (room_id, created_at asc);

create index if not exists order_chat_messages_order_created_idx
  on public.order_chat_messages (order_id, created_at asc);

insert into public.order_chat_rooms (
  order_id,
  order_no,
  store_id,
  store_name,
  buyer_user_id,
  buyer_name,
  owner_user_id,
  owner_name,
  order_flow,
  room_status,
  last_message,
  last_message_at,
  unread_count_buyer,
  unread_count_owner,
  unread_count_admin,
  last_chat_order_status,
  created_at,
  updated_at
)
select
  so.id,
  coalesce(so.order_no, ''),
  so.store_id,
  coalesce(st.store_name, ''),
  so.buyer_user_id,
  coalesce(buyer.nickname, left(replace(so.buyer_user_id::text, '-', ''), 8)),
  st.owner_user_id,
  coalesce(st.store_name, ownerp.nickname, left(replace(st.owner_user_id::text, '-', ''), 8)),
  case when so.fulfillment_type = 'local_delivery' then 'delivery' else 'pickup' end,
  'active',
  coalesce(cr.last_message_preview, ''),
  coalesce(cr.last_message_at, so.created_at, now()),
  0,
  0,
  0,
  case
    when so.order_status in (
      'pending',
      'accepted',
      'preparing',
      'delivering',
      'ready_for_pickup',
      'arrived',
      'completed',
      'cancel_requested',
      'cancelled',
      'refund_requested',
      'refunded'
    ) then so.order_status
    else null
  end,
  coalesce(cr.created_at, so.created_at, now()),
  now()
from public.store_orders so
join public.stores st on st.id = so.store_id
left join public.profiles buyer on buyer.id = so.buyer_user_id
left join public.profiles ownerp on ownerp.id = st.owner_user_id
left join public.chat_rooms cr
  on cr.store_order_id = so.id
 and cr.room_type = 'store_order'
where not exists (
  select 1 from public.order_chat_rooms ocr where ocr.order_id = so.id
);

insert into public.order_chat_participants (room_id, user_id, role, unread_count, is_active, created_at, updated_at)
select room.id, room.buyer_user_id, 'buyer', room.unread_count_buyer, true, room.created_at, room.updated_at
from public.order_chat_rooms room
where not exists (
  select 1 from public.order_chat_participants p
  where p.room_id = room.id and p.user_id = room.buyer_user_id
)
union all
select room.id, room.owner_user_id, 'owner', room.unread_count_owner, true, room.created_at, room.updated_at
from public.order_chat_rooms room
where not exists (
  select 1 from public.order_chat_participants p
  where p.room_id = room.id and p.user_id = room.owner_user_id
);

insert into public.order_chat_messages (
  room_id,
  order_id,
  sender_type,
  sender_id,
  sender_name,
  message_type,
  content,
  image_url,
  related_order_status,
  is_read_by_buyer,
  is_read_by_owner,
  is_read_by_admin,
  created_at
)
select
  room.id,
  room.order_id,
  case
    when msg.message_type = 'system' or msg.sender_id is null then 'system'
    when msg.sender_id = room.buyer_user_id then 'buyer'
    when msg.sender_id = room.owner_user_id then 'owner'
    else 'admin'
  end,
  msg.sender_id,
  case
    when msg.sender_id = room.owner_user_id then room.owner_name
    when msg.sender_id = room.buyer_user_id then room.buyer_name
    else coalesce(msg.body, '')
  end,
  case when msg.message_type = 'system' then 'system' else 'text' end,
  coalesce(msg.body, ''),
  null,
  case
    when (msg.metadata ->> 'related_order_status') in (
      'pending',
      'accepted',
      'preparing',
      'delivering',
      'ready_for_pickup',
      'arrived',
      'completed',
      'cancel_requested',
      'cancelled',
      'refund_requested',
      'refunded'
    ) then msg.metadata ->> 'related_order_status'
    else null
  end,
  case
    when msg.sender_id = room.buyer_user_id then true
    when msg.sender_type = 'system' then false
    else false
  end,
  case
    when msg.sender_id = room.owner_user_id then true
    when msg.sender_type = 'system' then false
    else false
  end,
  false,
  msg.created_at
from public.chat_rooms cr
join public.order_chat_rooms room on room.order_id = cr.store_order_id
join public.chat_messages msg on msg.room_id = cr.id
where cr.room_type = 'store_order'
  and not exists (
    select 1
    from public.order_chat_messages ocm
    where ocm.room_id = room.id and ocm.created_at = msg.created_at and ocm.content = coalesce(msg.body, '')
  );
