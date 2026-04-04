create table if not exists public.community_messenger_call_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_messenger_rooms(id) on delete cascade,
  initiator_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  call_kind text not null check (call_kind in ('voice', 'video')),
  status text not null check (status in ('ringing', 'active', 'ended', 'rejected', 'missed', 'cancelled')),
  started_at timestamptz not null default now(),
  answered_at timestamptz null,
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (initiator_user_id <> recipient_user_id)
);

create index if not exists community_messenger_call_sessions_room_idx
  on public.community_messenger_call_sessions (room_id, created_at desc);

create index if not exists community_messenger_call_sessions_recipient_idx
  on public.community_messenger_call_sessions (recipient_user_id, status, created_at desc);

create index if not exists community_messenger_call_sessions_initiator_idx
  on public.community_messenger_call_sessions (initiator_user_id, status, created_at desc);

create table if not exists public.community_messenger_call_signals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.community_messenger_call_sessions(id) on delete cascade,
  room_id uuid not null references public.community_messenger_rooms(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer', 'answer', 'ice-candidate', 'hangup')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);

create index if not exists community_messenger_call_signals_session_idx
  on public.community_messenger_call_signals (session_id, created_at asc);

create index if not exists community_messenger_call_signals_to_user_idx
  on public.community_messenger_call_signals (to_user_id, created_at desc);

alter table public.community_messenger_call_logs
  add column if not exists session_id uuid null references public.community_messenger_call_sessions(id) on delete set null;

create unique index if not exists community_messenger_call_logs_session_uidx
  on public.community_messenger_call_logs (session_id)
  where session_id is not null;

alter table public.community_messenger_call_sessions enable row level security;
alter table public.community_messenger_call_signals enable row level security;

drop policy if exists community_messenger_call_sessions_member_policy on public.community_messenger_call_sessions;
create policy community_messenger_call_sessions_member_policy
  on public.community_messenger_call_sessions
  for all
  using (auth.uid() = initiator_user_id or auth.uid() = recipient_user_id)
  with check (auth.uid() = initiator_user_id or auth.uid() = recipient_user_id);

drop policy if exists community_messenger_call_signals_member_policy on public.community_messenger_call_signals;
create policy community_messenger_call_signals_member_policy
  on public.community_messenger_call_signals
  for select
  using (
    auth.uid() = from_user_id
    or auth.uid() = to_user_id
    or exists (
      select 1
      from public.community_messenger_call_sessions s
      where s.id = community_messenger_call_signals.session_id
        and (s.initiator_user_id = auth.uid() or s.recipient_user_id = auth.uid())
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
      from public.community_messenger_call_sessions s
      where s.id = community_messenger_call_signals.session_id
        and s.room_id = community_messenger_call_signals.room_id
        and auth.uid() in (s.initiator_user_id, s.recipient_user_id)
        and to_user_id in (s.initiator_user_id, s.recipient_user_id)
    )
  );
