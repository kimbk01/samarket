alter table public.community_messenger_rooms
  add column if not exists identity_policy text not null default 'real_name';

update public.community_messenger_rooms
set identity_policy = case
  when room_type = 'open_group' then 'alias_allowed'
  else 'real_name'
end
where identity_policy is null or btrim(identity_policy) = '';

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_join_policy_check;

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_password_consistency_check;

alter table public.community_messenger_rooms
  drop constraint if exists community_messenger_rooms_identity_policy_check;

alter table public.community_messenger_rooms
  add constraint community_messenger_rooms_join_policy_check
    check (join_policy in ('invite_only', 'password', 'free')),
  add constraint community_messenger_rooms_identity_policy_check
    check (identity_policy in ('real_name', 'alias_allowed')),
  add constraint community_messenger_rooms_password_consistency_check
    check (
      (room_type = 'open_group' and visibility = 'public' and join_policy = 'password' and password_hash is not null)
      or (room_type = 'open_group' and visibility = 'public' and join_policy = 'free' and password_hash is null)
      or (room_type = 'private_group' and visibility = 'private' and join_policy = 'invite_only' and password_hash is null)
      or (room_type = 'direct' and visibility = 'private' and join_policy = 'invite_only' and password_hash is null)
    );

create table if not exists public.community_messenger_room_profiles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_messenger_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  identity_mode text not null default 'real_name',
  display_name text not null default '',
  bio text not null default '',
  avatar_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id),
  constraint community_messenger_room_profiles_identity_mode_check
    check (identity_mode in ('real_name', 'alias'))
);

create index if not exists community_messenger_room_profiles_room_idx
  on public.community_messenger_room_profiles (room_id, user_id);

alter table public.community_messenger_room_profiles enable row level security;

drop policy if exists community_messenger_room_profiles_member_policy on public.community_messenger_room_profiles;
create policy community_messenger_room_profiles_member_policy
  on public.community_messenger_room_profiles
  for all
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.community_messenger_participants p
      where p.room_id = community_messenger_room_profiles.room_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    or exists (
      select 1
      from public.community_messenger_participants p
      where p.room_id = community_messenger_room_profiles.room_id
        and p.user_id = auth.uid()
        and p.role in ('owner', 'admin')
    )
  );
