-- 글로벌 presence: ping·활동·가시성 (채팅방 입장과 분리)
alter table public.community_messenger_presence_snapshots
  add column if not exists last_ping_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists app_visibility text not null default 'unknown',
  add column if not exists presence_state_cached text;

comment on column public.community_messenger_presence_snapshots.last_ping_at is '마지막 클라 heartbeat 시각';
comment on column public.community_messenger_presence_snapshots.last_activity_at is '최근 사용자 활동(스로틀)';
comment on column public.community_messenger_presence_snapshots.app_visibility is 'foreground | background | unknown';
comment on column public.community_messenger_presence_snapshots.presence_state_cached is '서버 파생 캐시: online | away | offline';

update public.community_messenger_presence_snapshots
set
  last_ping_at = coalesce(last_ping_at, updated_at),
  last_activity_at = coalesce(last_activity_at, updated_at)
where last_ping_at is null or last_activity_at is null;
