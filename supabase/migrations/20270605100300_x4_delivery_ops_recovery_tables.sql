-- X-4 (문서 K, 2026-10-21 PHT) — 운영 누락분만 최소 보완. 운영 적용 완료(apply 도구), 버전 기록 일치.
-- 원본: 20260516120000_delivery_operations_recovery_center.sql / 20260826180000_free_coupon_v32_authority_lifecycle.sql
-- 차이: DROP POLICY·pg_cron 블록 제외(운영에 pg_cron 없음), 실행 권한 service_role 전용(anon·authenticated 회수),
--       복구 로그 정책 SELECT 전용 + 클라이언트 쓰기 회수(1-D 직접 쓰기 차단 원칙). 데이터 변경 0.

create table if not exists public.delivery_operation_job_heartbeats (
  job_key text primary key,
  last_run_at timestamptz not null default now(),
  last_ok boolean not null default true,
  detail jsonb not null default '{}'::jsonb
);

comment on table public.delivery_operation_job_heartbeats is
  '배달 운영 배치(sla_scan·alert_sync·auto_action_runner) 마지막 성공 시각';

alter table public.delivery_operation_job_heartbeats enable row level security;

create policy delivery_operation_job_heartbeats_admin_select
  on public.delivery_operation_job_heartbeats
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

create or replace function public.touch_delivery_operation_job_heartbeat(
  p_job_key text,
  p_ok boolean default true,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.delivery_operation_job_heartbeats as h (
    job_key,
    last_run_at,
    last_ok,
    detail
  )
  values (
    nullif(trim(p_job_key), ''),
    now(),
    coalesce(p_ok, true),
    coalesce(nullif(p_detail, '{}'::jsonb), '{}'::jsonb)
  )
  on conflict (job_key) do update
    set last_run_at = excluded.last_run_at,
        last_ok = excluded.last_ok,
        detail = excluded.detail;
end;
$$;

revoke all on function public.touch_delivery_operation_job_heartbeat(text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.touch_delivery_operation_job_heartbeat(text, boolean, jsonb) to service_role;

create table if not exists public.delivery_operation_recovery_logs (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  actor_admin_id uuid references public.profiles(id) on delete set null,
  result text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists delivery_operation_recovery_logs_created_idx
  on public.delivery_operation_recovery_logs (created_at desc);

create index if not exists delivery_operation_recovery_logs_action_created_idx
  on public.delivery_operation_recovery_logs (action_type, created_at desc);

comment on table public.delivery_operation_recovery_logs is
  '관리자 운영 복구 액션 실행 이력';

alter table public.delivery_operation_recovery_logs enable row level security;

create policy delivery_operation_recovery_logs_admin_select
  on public.delivery_operation_recovery_logs
  for select
  to authenticated
  using (public.is_platform_admin(auth.uid()));

revoke insert, update, delete, truncate on public.delivery_operation_job_heartbeats from anon, authenticated;
revoke insert, update, delete, truncate on public.delivery_operation_recovery_logs from anon, authenticated;
