create table if not exists public.community_messenger_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  addressee_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked', 'removed')),
  blocked_by_user_id uuid null references public.profiles(id) on delete set null,
  blocked_at timestamptz null,
  unblocked_at timestamptz null,
  readd_blocked_until timestamptz null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz null,
  removed_at timestamptz null,
  updated_at timestamptz not null default now(),
  check (requester_user_id <> addressee_user_id)
);

create unique index if not exists community_messenger_friendships_pair_idx
  on public.community_messenger_friendships (
    least(requester_user_id, addressee_user_id),
    greatest(requester_user_id, addressee_user_id)
  );

create index if not exists community_messenger_friendships_requester_idx
  on public.community_messenger_friendships (requester_user_id, status, created_at desc);

create index if not exists community_messenger_friendships_addressee_idx
  on public.community_messenger_friendships (addressee_user_id, status, created_at desc);

create index if not exists community_messenger_friendships_blocked_by_idx
  on public.community_messenger_friendships (blocked_by_user_id, blocked_at desc)
  where status = 'blocked';

alter table public.community_messenger_friendships enable row level security;

drop policy if exists community_messenger_friendships_select_policy on public.community_messenger_friendships;
create policy community_messenger_friendships_select_policy
  on public.community_messenger_friendships
  for select
  using (auth.uid() = requester_user_id or auth.uid() = addressee_user_id);

drop policy if exists community_messenger_friendships_insert_policy on public.community_messenger_friendships;
create policy community_messenger_friendships_insert_policy
  on public.community_messenger_friendships
  for insert
  with check (auth.uid() = requester_user_id);

drop policy if exists community_messenger_friendships_update_policy on public.community_messenger_friendships;
create policy community_messenger_friendships_update_policy
  on public.community_messenger_friendships
  for update
  using (auth.uid() = requester_user_id or auth.uid() = addressee_user_id or auth.uid() = blocked_by_user_id)
  with check (auth.uid() = requester_user_id or auth.uid() = addressee_user_id or auth.uid() = blocked_by_user_id);
