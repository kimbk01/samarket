-- C8 진입 계측 — 실패·해제 없음·새로고침 회복 이벤트만 보존 (전량은 Vercel 로그 1줄, Pro 로그 보존 1일)
-- 설계: docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4 C8 (「로그 + 실패만 표」 권장안)
-- Owner 「오너의 결정 부분의 권장 부분을 따른다」 2026-11-08 · 쓰기 = app/api/telemetry/entry (service_role) 만.
-- 개인정보 없음: 사용자 ID·토큰·IP·User-Agent·URL 미저장 (계약 lib/telemetry/entry-telemetry-contract.ts 화이트리스트).
-- 보존 30일: 수집 API 가 인스턴스당 1시간에 1회 30일 지난 행을 지운다.

create table if not exists public.app_entry_failures (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  run text not null,
  seq smallint not null,
  kind text not null check (kind in ('cold', 'resume')),
  ev text not null check (ev in ('released', 'failure', 'no_release', 'resume', 'update_reload')),
  platform text not null check (platform in ('android', 'ios', 'web')),
  app_version text,
  app_build text,
  web_sha text,
  entry_kind text,
  restore_hint text,
  release_reason text,
  failure text,
  recovery text not null default 'none',
  prev_failure text,
  reloads integer not null default 0,
  age_ms integer not null,
  hidden_ms integer,
  visible boolean not null default false,
  stages jsonb not null default '{}'::jsonb,
  deployment_id text,
  server_sha text,
  unique (run, seq)
);

create index if not exists app_entry_failures_created_at_idx on public.app_entry_failures (created_at);
create index if not exists app_entry_failures_platform_created_idx on public.app_entry_failures (platform, created_at desc);

-- 서버(service_role) 전용
alter table public.app_entry_failures enable row level security;
alter table public.app_entry_failures force row level security;
revoke all on table public.app_entry_failures from anon, authenticated;
grant all on table public.app_entry_failures to service_role;

comment on table public.app_entry_failures is
  'C8 앱 진입·복귀 계측 — 시작 실패·해제 없음·새로고침 회복 이벤트(개인정보 없음). 30일 보존. 전량은 Vercel 로그 [dibay-entry].';
