-- 거래 1:1 채팅 presence / 마지막 접속 (온라인·자리비움은 클라+Realtime 계산, DB에는 last_seen·설정만)
alter table public.profiles
  add column if not exists trade_presence_last_seen_at timestamptz;

alter table public.profiles
  add column if not exists trade_presence_show_online boolean not null default true;

alter table public.profiles
  add column if not exists trade_presence_hide_last_seen boolean not null default false;

alter table public.profiles
  add column if not exists trade_presence_audience text not null default 'friends';

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'profiles' and c.conname = 'trade_presence_audience_chk'
  ) then
    alter table public.profiles
      add constraint trade_presence_audience_chk
      check (trade_presence_audience in ('everyone', 'friends', 'nobody'));
  end if;
end $$;

comment on column public.profiles.trade_presence_last_seen_at is '거래 채팅용 마지막 접속(heartbeat 종료·탭 이탈 등 서버 기록)';
comment on column public.profiles.trade_presence_show_online is '온라인/자리비움 점 표시 허용';
comment on column public.profiles.trade_presence_hide_last_seen is 'ON이면 본인도 타인 last seen 미표시(상호)';
comment on column public.profiles.trade_presence_audience is 'everyone | friends | nobody — 거래 상대에게 presence 공개 범위';
