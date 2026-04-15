-- 통화 세션 감사 이벤트 + 종료 사유 + 관리자 통화 정책(링 타임아웃·볼륨·바쁨/알림 억제)

create table if not exists public.community_messenger_call_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.community_messenger_call_sessions(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'invited',
      'ringing',
      'accepted',
      'declined',
      'canceled',
      'missed',
      'connected',
      'ended',
      'timeout'
    )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists community_messenger_call_events_session_idx
  on public.community_messenger_call_events (session_id, created_at desc);

alter table public.community_messenger_call_events enable row level security;

drop policy if exists community_messenger_call_events_select_policy on public.community_messenger_call_events;
create policy community_messenger_call_events_select_policy
  on public.community_messenger_call_events
  for select
  using (
    exists (
      select 1
      from public.community_messenger_call_sessions s
      where s.id = community_messenger_call_events.session_id
        and (
          auth.uid() = s.initiator_user_id
          or (s.recipient_user_id is not null and auth.uid() = s.recipient_user_id)
          or exists (
            select 1
            from public.community_messenger_call_session_participants p
            where p.session_id = s.id
              and p.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists community_messenger_call_events_insert_policy on public.community_messenger_call_events;
create policy community_messenger_call_events_insert_policy
  on public.community_messenger_call_events
  for insert
  with check (
    auth.uid() = actor_user_id
    and exists (
      select 1
      from public.community_messenger_call_sessions s
      where s.id = community_messenger_call_events.session_id
        and (
          auth.uid() = s.initiator_user_id
          or (s.recipient_user_id is not null and auth.uid() = s.recipient_user_id)
          or exists (
            select 1
            from public.community_messenger_call_session_participants p
            where p.session_id = s.id
              and p.user_id = auth.uid()
          )
        )
    )
  );

alter table public.community_messenger_call_sessions
  add column if not exists ended_reason text null;

comment on column public.community_messenger_call_sessions.ended_reason is '종료·거절·취소·부재 등 사유 코드(클라·분석용, 예: declined, canceled, missed, ended)';

alter table public.admin_messenger_call_sound_settings
  add column if not exists incoming_ring_timeout_seconds integer not null default 45
    check (incoming_ring_timeout_seconds >= 10 and incoming_ring_timeout_seconds <= 600);

alter table public.admin_messenger_call_sound_settings
  add column if not exists incoming_ringtone_volume numeric not null default 0.72
    check (incoming_ringtone_volume >= 0 and incoming_ringtone_volume <= 1);

alter table public.admin_messenger_call_sound_settings
  add column if not exists busy_auto_reject_enabled boolean not null default false;

alter table public.admin_messenger_call_sound_settings
  add column if not exists repeated_call_cooldown_seconds integer not null default 0
    check (repeated_call_cooldown_seconds >= 0 and repeated_call_cooldown_seconds <= 3600);

alter table public.admin_messenger_call_sound_settings
  add column if not exists suppress_incoming_local_notifications boolean not null default false;

comment on column public.admin_messenger_call_sound_settings.busy_auto_reject_enabled is '수신자가 이미 active 1:1 통화 중이면 새 ringing 수신 목록 비움(서버)';
comment on column public.admin_messenger_call_sound_settings.repeated_call_cooldown_seconds is '동일 발신-수신 쌍 재통화 최소 간격(0=비활성, 향후 서버 필터용)';
comment on column public.admin_messenger_call_sound_settings.suppress_incoming_local_notifications is '수신 통화: 로컬 Notification + Web Push 발송 생략';
