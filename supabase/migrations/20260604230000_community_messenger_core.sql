create table if not exists public.community_friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'blocked')),
  note text not null default '',
  created_at timestamptz not null default now(),
  responded_at timestamptz null,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists community_friend_requests_requester_idx
  on public.community_friend_requests (requester_id, status, created_at desc);

create index if not exists community_friend_requests_addressee_idx
  on public.community_friend_requests (addressee_id, status, created_at desc);

create table if not exists public.community_friend_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, target_user_id),
  check (user_id <> target_user_id)
);

create index if not exists community_friend_favorites_user_idx
  on public.community_friend_favorites (user_id, created_at desc);

create table if not exists public.community_messenger_rooms (
  id uuid primary key default gen_random_uuid(),
  room_type text not null check (room_type in ('direct', 'group')),
  title text not null default '',
  avatar_url text null,
  created_by uuid null references public.profiles(id) on delete set null,
  direct_key text null,
  last_message text not null default '',
  last_message_at timestamptz not null default now(),
  last_message_type text not null default 'system' check (last_message_type in ('text', 'image', 'system', 'call_stub')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (direct_key),
  check (
    (room_type = 'direct' and direct_key is not null)
    or (room_type = 'group')
  )
);

create index if not exists community_messenger_rooms_type_last_idx
  on public.community_messenger_rooms (room_type, last_message_at desc);

create table if not exists public.community_messenger_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_messenger_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  unread_count integer not null default 0,
  is_muted boolean not null default false,
  is_pinned boolean not null default false,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz null,
  last_read_message_id uuid null,
  unique (room_id, user_id)
);

create index if not exists community_messenger_participants_user_idx
  on public.community_messenger_participants (user_id, room_id);

create table if not exists public.community_messenger_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_messenger_rooms(id) on delete cascade,
  sender_id uuid null references public.profiles(id) on delete set null,
  message_type text not null check (message_type in ('text', 'image', 'system', 'call_stub')),
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists community_messenger_messages_room_idx
  on public.community_messenger_messages (room_id, created_at asc);

create table if not exists public.community_messenger_call_logs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid null references public.community_messenger_rooms(id) on delete set null,
  caller_user_id uuid not null references public.profiles(id) on delete cascade,
  peer_user_id uuid null references public.profiles(id) on delete set null,
  call_kind text not null check (call_kind in ('voice', 'video')),
  status text not null check (status in ('dialing', 'incoming', 'missed', 'cancelled', 'rejected', 'ended')),
  duration_seconds integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists community_messenger_call_logs_caller_idx
  on public.community_messenger_call_logs (caller_user_id, started_at desc);

create index if not exists community_messenger_call_logs_peer_idx
  on public.community_messenger_call_logs (peer_user_id, started_at desc);

alter table public.community_friend_requests enable row level security;
alter table public.community_friend_favorites enable row level security;
alter table public.community_messenger_rooms enable row level security;
alter table public.community_messenger_participants enable row level security;
alter table public.community_messenger_messages enable row level security;
alter table public.community_messenger_call_logs enable row level security;

drop policy if exists community_friend_requests_select_policy on public.community_friend_requests;
create policy community_friend_requests_select_policy
  on public.community_friend_requests
  for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists community_friend_requests_insert_policy on public.community_friend_requests;
create policy community_friend_requests_insert_policy
  on public.community_friend_requests
  for insert
  with check (auth.uid() = requester_id);

drop policy if exists community_friend_requests_update_policy on public.community_friend_requests;
create policy community_friend_requests_update_policy
  on public.community_friend_requests
  for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists community_friend_favorites_own_policy on public.community_friend_favorites;
create policy community_friend_favorites_own_policy
  on public.community_friend_favorites
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists community_messenger_participants_select_self_policy on public.community_messenger_participants;
create policy community_messenger_participants_select_self_policy
  on public.community_messenger_participants
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.community_messenger_participants mine
      where mine.room_id = community_messenger_participants.room_id
        and mine.user_id = auth.uid()
    )
  );

drop policy if exists community_messenger_participants_mutate_member_policy on public.community_messenger_participants;
create policy community_messenger_participants_mutate_member_policy
  on public.community_messenger_participants
  for all
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.community_messenger_participants mine
      where mine.room_id = community_messenger_participants.room_id
        and mine.user_id = auth.uid()
        and mine.role in ('owner', 'admin')
    )
  )
  with check (
    auth.uid() = user_id
    or exists (
      select 1
      from public.community_messenger_participants mine
      where mine.room_id = community_messenger_participants.room_id
        and mine.user_id = auth.uid()
        and mine.role in ('owner', 'admin')
    )
  );

drop policy if exists community_messenger_rooms_member_policy on public.community_messenger_rooms;
create policy community_messenger_rooms_member_policy
  on public.community_messenger_rooms
  for all
  using (
    exists (
      select 1
      from public.community_messenger_participants p
      where p.room_id = community_messenger_rooms.id
        and p.user_id = auth.uid()
    )
  )
  with check (auth.uid() = created_by);

drop policy if exists community_messenger_messages_member_policy on public.community_messenger_messages;
create policy community_messenger_messages_member_policy
  on public.community_messenger_messages
  for all
  using (
    exists (
      select 1
      from public.community_messenger_participants p
      where p.room_id = community_messenger_messages.room_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.community_messenger_participants p
      where p.room_id = community_messenger_messages.room_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists community_messenger_call_logs_member_policy on public.community_messenger_call_logs;
create policy community_messenger_call_logs_member_policy
  on public.community_messenger_call_logs
  for all
  using (auth.uid() = caller_user_id or auth.uid() = peer_user_id)
  with check (auth.uid() = caller_user_id or auth.uid() = peer_user_id);
