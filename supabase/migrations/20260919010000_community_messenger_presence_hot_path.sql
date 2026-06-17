-- presence hot-path: surface·room/call context·TTL + index
alter table public.community_messenger_presence_snapshots
  add column if not exists surface text,
  add column if not exists current_room_id uuid,
  add column if not exists current_call_id uuid,
  add column if not exists expires_at timestamptz;

comment on column public.community_messenger_presence_snapshots.surface is 'home | room | call | background';
comment on column public.community_messenger_presence_snapshots.current_room_id is 'heartbeat 시 활성 CM 방(선택)';
comment on column public.community_messenger_presence_snapshots.current_call_id is 'heartbeat 시 활성 통화 세션(선택)';
comment on column public.community_messenger_presence_snapshots.expires_at is '스냅샷 TTL — now()+60s';

create index if not exists community_messenger_presence_expires_at_idx
  on public.community_messenger_presence_snapshots (expires_at);

create index if not exists community_messenger_presence_updated_at_idx
  on public.community_messenger_presence_snapshots (updated_at desc);
