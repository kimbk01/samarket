-- 로그인 실패·취소 서버 기록 — 서버 교환 전에 끝난 실패(Apple 창 안 503 등)가 서버에 0건이던 공백을 메운다.
-- 설계: docs/audit/auth-login-failure-server-record-design-2026-11-16.md (Owner 「구현·DB 적용 승인」 2026-11-16)
-- 쓰기 = app/api/telemetry/auth-failure (service_role) 만.
-- 개인정보 없음: 사용자 ID·이메일·토큰·오류 설명 원문·IP·User-Agent 미저장 (계약 lib/telemetry/auth-failure-telemetry-contract.ts 화이트리스트).
-- 보존 30일: 수집 API 가 인스턴스당 1시간에 1회 30일 지난 행을 지운다.

create table if not exists public.auth_login_failures (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  auth_flow_id text not null unique,
  result text not null check (result in ('fail', 'cancel')),
  provider text not null,
  platform text not null,
  flow_kind text,
  error_code text,
  reason text,
  last_stage text,
  elapsed_ms integer not null,
  native_error_code integer,
  app_version text,
  app_build text,
  web_sha text,
  deployment_id text,
  server_sha text
);

create index if not exists auth_login_failures_created_at_idx on public.auth_login_failures (created_at);
create index if not exists auth_login_failures_provider_created_idx on public.auth_login_failures (provider, created_at desc);

-- 서버(service_role) 전용
alter table public.auth_login_failures enable row level security;
alter table public.auth_login_failures force row level security;
revoke all on table public.auth_login_failures from anon, authenticated;
grant all on table public.auth_login_failures to service_role;

comment on table public.auth_login_failures is
  '로그인 실패·취소 기록(서버 교환 전 포함) — 개인정보 없음, 30일 보존. 전량은 Vercel 로그 [dibay-auth-failure].';
