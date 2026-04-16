create table if not exists public.community_messenger_presence_snapshots (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_messenger_participants_room_user_read_cursor_idx
  on public.community_messenger_participants (room_id, user_id, last_read_message_id);

create index if not exists community_messenger_presence_last_seen_idx
  on public.community_messenger_presence_snapshots (last_seen_at desc);

alter table public.community_messenger_presence_snapshots enable row level security;

drop policy if exists community_messenger_presence_snapshots_select_policy
  on public.community_messenger_presence_snapshots;
create policy community_messenger_presence_snapshots_select_policy
  on public.community_messenger_presence_snapshots
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.community_messenger_participants mine
      join public.community_messenger_participants peer
        on peer.room_id = mine.room_id
      where mine.user_id = auth.uid()
        and peer.user_id = community_messenger_presence_snapshots.user_id
    )
  );

drop policy if exists community_messenger_presence_snapshots_upsert_self_policy
  on public.community_messenger_presence_snapshots;
create policy community_messenger_presence_snapshots_upsert_self_policy
  on public.community_messenger_presence_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
