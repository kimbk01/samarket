alter table public.community_messenger_rooms
  add column if not exists summary text not null default '',
  add column if not exists visibility text not null default 'private',
  add column if not exists join_policy text not null default 'invite_only',
  add column if not exists password_hash text null,
  add column if not exists owner_user_id uuid null references public.profiles(id) on delete set null,
  add column if not exists member_limit integer null default 200,
  add column if not exists is_discoverable boolean not null default false,
  add column if not exists allow_member_invite boolean not null default true;

update public.community_messenger_rooms
set room_type = 'private_group'
where room_type = 'group';

update public.community_messenger_rooms
set summary = coalesce(summary, ''),
    visibility = case when room_type = 'open_group' then 'public' else 'private' end,
    join_policy = case when room_type = 'open_group' then 'password' else 'invite_only' end,
    owner_user_id = coalesce(owner_user_id, created_by),
    member_limit = greatest(coalesce(member_limit, 200), 2),
    is_discoverable = case when room_type = 'open_group' then true else false end,
    allow_member_invite = case when room_type = 'direct' then false else coalesce(allow_member_invite, true) end;

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_room_type_check;

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_check;

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_visibility_check;

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_join_policy_check;

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_member_limit_check;

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_password_consistency_check;

alter table public.community_messenger_rooms
  add constraint community_messenger_rooms_room_type_check
    check (room_type in ('direct', 'private_group', 'open_group')),
  add constraint community_messenger_rooms_visibility_check
    check (visibility in ('private', 'public')),
  add constraint community_messenger_rooms_join_policy_check
    check (join_policy in ('invite_only', 'password')),
  add constraint community_messenger_rooms_member_limit_check
    check (member_limit is null or (member_limit >= 2 and member_limit <= 1000)),
  add constraint community_messenger_rooms_password_consistency_check
    check (
      (room_type = 'open_group' and visibility = 'public' and join_policy = 'password' and password_hash is not null)
      or (room_type = 'private_group' and visibility = 'private' and join_policy = 'invite_only' and password_hash is null)
      or (room_type = 'direct' and visibility = 'private' and join_policy = 'invite_only' and password_hash is null)
    ),
  add constraint community_messenger_rooms_direct_consistency_check
    check (
      (room_type = 'direct' and direct_key is not null)
      or (room_type in ('private_group', 'open_group') and direct_key is null)
    );

create index if not exists community_messenger_rooms_visibility_idx
  on public.community_messenger_rooms (visibility, is_discoverable, room_status, last_message_at desc);

create index if not exists community_messenger_rooms_owner_idx
  on public.community_messenger_rooms (owner_user_id, room_type, created_at desc);

create index if not exists community_messenger_rooms_join_idx
  on public.community_messenger_rooms (room_type, join_policy, is_discoverable, last_message_at desc);
