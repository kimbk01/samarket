create table if not exists public.community_messenger_message_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz null,
  blocked_by_user_id uuid null references public.profiles(id) on delete set null,
  last_request_room_id uuid null references public.community_messenger_rooms(id) on delete set null,
  request_message_id uuid null references public.community_messenger_messages(id) on delete set null,
  check (requester_user_id <> recipient_user_id)
);

create unique index if not exists community_messenger_message_requests_pair_idx
  on public.community_messenger_message_requests (
    least(requester_user_id, recipient_user_id),
    greatest(requester_user_id, recipient_user_id)
  );

create index if not exists community_messenger_message_requests_requester_idx
  on public.community_messenger_message_requests (requester_user_id, status, created_at desc);

create index if not exists community_messenger_message_requests_recipient_idx
  on public.community_messenger_message_requests (recipient_user_id, status, created_at desc);

create index if not exists community_messenger_message_requests_room_idx
  on public.community_messenger_message_requests (last_request_room_id);

alter table public.community_messenger_rooms
  add column if not exists relation_status text not null default 'accepted'
    check (relation_status in ('pending', 'accepted', 'declined', 'blocked')),
  add column if not exists accepted_at timestamptz null,
  add column if not exists declined_at timestamptz null,
  add column if not exists blocked_at timestamptz null;

create index if not exists community_messenger_rooms_relation_status_idx
  on public.community_messenger_rooms (relation_status, last_message_at desc);

alter table public.community_messenger_participants
  add column if not exists declined_hidden_at timestamptz null;

create index if not exists community_messenger_participants_declined_hidden_idx
  on public.community_messenger_participants (user_id, declined_hidden_at)
  where declined_hidden_at is not null;

alter table public.community_messenger_message_requests enable row level security;

drop policy if exists community_messenger_message_requests_select_policy on public.community_messenger_message_requests;
create policy community_messenger_message_requests_select_policy
  on public.community_messenger_message_requests
  for select
  using (auth.uid() = requester_user_id or auth.uid() = recipient_user_id);

drop policy if exists community_messenger_message_requests_insert_policy on public.community_messenger_message_requests;
create policy community_messenger_message_requests_insert_policy
  on public.community_messenger_message_requests
  for insert
  with check (auth.uid() = requester_user_id);

drop policy if exists community_messenger_message_requests_update_policy on public.community_messenger_message_requests;
create policy community_messenger_message_requests_update_policy
  on public.community_messenger_message_requests
  for update
  using (auth.uid() = requester_user_id or auth.uid() = recipient_user_id)
  with check (auth.uid() = requester_user_id or auth.uid() = recipient_user_id);
