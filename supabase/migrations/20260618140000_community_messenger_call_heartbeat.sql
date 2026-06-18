-- P4 Active Call Session — peer heartbeat timestamps for stale active call cleanup

alter table public.community_messenger_call_sessions
  add column if not exists caller_last_heartbeat_at timestamptz,
  add column if not exists callee_last_heartbeat_at timestamptz,
  add column if not exists reconnecting_since timestamptz;

comment on column public.community_messenger_call_sessions.caller_last_heartbeat_at is
  'Initiator last client heartbeat while status=active (P4 active call SSOT)';
comment on column public.community_messenger_call_sessions.callee_last_heartbeat_at is
  'Recipient last client heartbeat while status=active (P4 active call SSOT)';
comment on column public.community_messenger_call_sessions.reconnecting_since is
  'When either peer entered reconnecting (optional observability)';

create index if not exists community_messenger_call_sessions_active_heartbeat_idx
  on public.community_messenger_call_sessions (status, caller_last_heartbeat_at, callee_last_heartbeat_at)
  where status = 'active';
