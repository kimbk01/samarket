alter table public.community_messenger_rooms
  add column if not exists room_status text not null default 'active'
    check (room_status in ('active', 'blocked', 'archived'));

alter table public.community_messenger_rooms
  add column if not exists is_readonly boolean not null default false;

alter table public.community_messenger_rooms
  add column if not exists admin_note text not null default '';

alter table public.community_messenger_rooms
  add column if not exists moderated_by uuid null references public.profiles(id) on delete set null;

alter table public.community_messenger_rooms
  add column if not exists moderated_at timestamptz null;

alter table public.community_friend_requests
  add column if not exists admin_note text not null default '';

alter table public.community_friend_requests
  add column if not exists handled_by_admin_id uuid null references public.profiles(id) on delete set null;

alter table public.community_friend_requests
  add column if not exists handled_at timestamptz null;

alter table public.community_messenger_messages
  add column if not exists is_hidden_by_admin boolean not null default false;

create index if not exists community_messenger_rooms_status_idx
  on public.community_messenger_rooms (room_status, last_message_at desc);

create index if not exists community_friend_requests_status_idx
  on public.community_friend_requests (status, created_at desc);
