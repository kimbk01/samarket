alter table public.community_messenger_call_sessions
  alter column recipient_user_id drop not null;

alter table public.community_messenger_call_sessions
  add column if not exists session_mode text not null default 'direct'
  check (session_mode in ('direct', 'group'));

alter table public.community_messenger_call_sessions
  add column if not exists max_participants integer not null default 4;

create table if not exists public.community_messenger_call_session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.community_messenger_call_sessions(id) on delete cascade,
  room_id uuid not null references public.community_messenger_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  participation_status text not null default 'invited'
    check (participation_status in ('invited', 'joined', 'left', 'rejected')),
  joined_at timestamptz null,
  left_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists community_messenger_call_session_participants_session_idx
  on public.community_messenger_call_session_participants (session_id, participation_status, created_at asc);

create index if not exists community_messenger_call_session_participants_user_idx
  on public.community_messenger_call_session_participants (user_id, participation_status, created_at desc);

update public.community_messenger_call_sessions
set session_mode = 'direct'
where session_mode is distinct from 'direct';

insert into public.community_messenger_call_session_participants (
  session_id,
  room_id,
  user_id,
  participation_status,
  joined_at,
  left_at,
  created_at
)
select
  s.id,
  s.room_id,
  s.initiator_user_id,
  case when s.status = 'active' then 'joined' else 'invited' end,
  case when s.status = 'active' then s.answered_at else null end,
  case when s.status in ('ended', 'rejected', 'missed', 'cancelled') then s.ended_at else null end,
  s.created_at
from public.community_messenger_call_sessions s
where not exists (
  select 1
  from public.community_messenger_call_session_participants p
  where p.session_id = s.id
    and p.user_id = s.initiator_user_id
);

insert into public.community_messenger_call_session_participants (
  session_id,
  room_id,
  user_id,
  participation_status,
  joined_at,
  left_at,
  created_at
)
select
  s.id,
  s.room_id,
  s.recipient_user_id,
  case
    when s.status = 'active' then 'joined'
    when s.status = 'rejected' then 'rejected'
    when s.status in ('ended', 'missed', 'cancelled') then 'left'
    else 'invited'
  end,
  case when s.status = 'active' then s.answered_at else null end,
  case when s.status in ('ended', 'rejected', 'missed', 'cancelled') then s.ended_at else null end,
  s.created_at
from public.community_messenger_call_sessions s
where s.recipient_user_id is not null
  and not exists (
    select 1
    from public.community_messenger_call_session_participants p
    where p.session_id = s.id
      and p.user_id = s.recipient_user_id
  );

alter table public.community_messenger_call_session_participants enable row level security;

drop policy if exists community_messenger_call_session_participants_member_policy on public.community_messenger_call_session_participants;
create policy community_messenger_call_session_participants_member_policy
  on public.community_messenger_call_session_participants
  for all
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.community_messenger_call_sessions s
      where s.id = community_messenger_call_session_participants.session_id
        and s.initiator_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.community_messenger_call_session_participants mine
      where mine.session_id = community_messenger_call_session_participants.session_id
        and mine.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    or exists (
      select 1
      from public.community_messenger_call_sessions s
      where s.id = community_messenger_call_session_participants.session_id
        and s.initiator_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.community_messenger_call_session_participants mine
      where mine.session_id = community_messenger_call_session_participants.session_id
        and mine.user_id = auth.uid()
    )
  );

drop policy if exists community_messenger_call_sessions_member_policy on public.community_messenger_call_sessions;
create policy community_messenger_call_sessions_member_policy
  on public.community_messenger_call_sessions
  for all
  using (
    auth.uid() = initiator_user_id
    or auth.uid() = recipient_user_id
    or exists (
      select 1
      from public.community_messenger_call_session_participants p
      where p.session_id = community_messenger_call_sessions.id
        and p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = initiator_user_id
    or auth.uid() = recipient_user_id
    or exists (
      select 1
      from public.community_messenger_call_session_participants p
      where p.session_id = community_messenger_call_sessions.id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists community_messenger_call_signals_member_policy on public.community_messenger_call_signals;
create policy community_messenger_call_signals_member_policy
  on public.community_messenger_call_signals
  for select
  using (
    auth.uid() = from_user_id
    or auth.uid() = to_user_id
    or exists (
      select 1
      from public.community_messenger_call_session_participants p
      where p.session_id = community_messenger_call_signals.session_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists community_messenger_call_signals_insert_policy on public.community_messenger_call_signals;
create policy community_messenger_call_signals_insert_policy
  on public.community_messenger_call_signals
  for insert
  with check (
    auth.uid() = from_user_id
    and exists (
      select 1
      from public.community_messenger_call_session_participants p
      where p.session_id = community_messenger_call_signals.session_id
        and p.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.community_messenger_call_session_participants p
      where p.session_id = community_messenger_call_signals.session_id
        and p.user_id = to_user_id
    )
  );
