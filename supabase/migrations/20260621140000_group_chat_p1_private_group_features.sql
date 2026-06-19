-- Group Chat P1 — private_group profile, pin, invite link, mentions, read count cache, notification types.

alter table public.community_messenger_rooms
  add column if not exists pinned_message_id uuid null
    references public.community_messenger_messages (id) on delete set null,
  add column if not exists invite_token text null,
  add column if not exists invite_link_enabled boolean not null default true;

create unique index if not exists community_messenger_rooms_invite_token_uidx
  on public.community_messenger_rooms (invite_token)
  where invite_token is not null;

create index if not exists community_messenger_rooms_pinned_message_idx
  on public.community_messenger_rooms (pinned_message_id)
  where pinned_message_id is not null;

alter table public.community_messenger_messages
  add column if not exists mention_user_ids uuid[] not null default '{}'::uuid[];

create index if not exists community_messenger_messages_room_media_idx
  on public.community_messenger_messages (room_id, created_at desc)
  where message_type in ('image', 'file') and deleted_at is null;

comment on column public.community_messenger_rooms.pinned_message_id is
  'P1: single pinned group message (Telegram/Kakao pin).';
comment on column public.community_messenger_rooms.invite_token is
  'P1: shareable invite token for /group/{token} join.';
comment on column public.community_messenger_messages.mention_user_ids is
  'P1: structured @mention recipient user ids for group push routing.';

-- Read count cache — incremental, avoids full participant scan on hot path.
create table if not exists public.community_messenger_message_read_counts (
  room_id uuid not null references public.community_messenger_rooms (id) on delete cascade,
  message_id uuid not null references public.community_messenger_messages (id) on delete cascade,
  read_count integer not null default 0 check (read_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (room_id, message_id)
);

create index if not exists community_messenger_message_read_counts_room_idx
  on public.community_messenger_message_read_counts (room_id, updated_at desc);

alter table public.community_messenger_message_read_counts enable row level security;
drop policy if exists community_messenger_message_read_counts_deny_all
  on public.community_messenger_message_read_counts;
create policy community_messenger_message_read_counts_deny_all
  on public.community_messenger_message_read_counts
  for all using (false) with check (false);

-- Expand notification_events types (pin_message, mention_message).
alter table public.notification_events
  drop constraint if exists notification_events_type_check;

alter table public.notification_events
  add constraint notification_events_type_check check (
    type in (
      'chat_message',
      'group_message',
      'mention_message',
      'pin_message',
      'trade_message',
      'store_order_message',
      'missed_call',
      'incoming_call'
    )
  );

-- Batch read counts for a room (≤100 members target <50ms).
create or replace function public.community_messenger_group_message_read_counts(
  p_room_id uuid,
  p_message_ids uuid[]
)
returns table (message_id uuid, read_count integer)
language sql
stable
security definer
set search_path = public
as $$
  with ids as (
    select unnest(coalesce(p_message_ids, array[]::uuid[])) as mid
  ),
  cached as (
    select c.message_id, c.read_count
    from public.community_messenger_message_read_counts c
    join ids on ids.mid = c.message_id
    where c.room_id = p_room_id
  ),
  computed as (
    select
      m.id as message_id,
      (
        select count(*)::int
        from public.community_messenger_participants p
        join public.community_messenger_messages lr on lr.id = p.last_read_message_id
        where p.room_id = p_room_id
          and p.left_at is null
          and p.blocked_hidden_at is null
          and p.user_id is distinct from m.sender_id
          and (
            lr.created_at > m.created_at
            or (lr.created_at = m.created_at and lr.id >= m.id)
          )
      ) as read_count
    from public.community_messenger_messages m
    join ids on ids.mid = m.id
    where m.room_id = p_room_id
      and m.id not in (select message_id from cached)
  )
  select * from cached
  union all
  select * from computed;
$$;

revoke all on function public.community_messenger_group_message_read_counts(uuid, uuid[]) from public;
grant execute on function public.community_messenger_group_message_read_counts(uuid, uuid[]) to service_role;
