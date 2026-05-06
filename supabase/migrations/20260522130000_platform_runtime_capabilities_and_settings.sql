-- Step 23: PostgreSQL capability runtime + ON/OFF 운영 설정
-- 목표: "지원 안 하면 죽는 구조" 금지 — 감지/저장/표시/ON-OFF를 DB에 둔다.

-- ─── 1) Capability (singleton) ───────────────────────────────────────────────
create table if not exists public.platform_runtime_capabilities (
  singleton smallint primary key default 1 check (singleton = 1),
  pg_version text,
  pg_version_num integer,
  supports_pg_cron boolean not null default false,
  supports_publication_column_filter boolean not null default false,
  supports_advanced_rpc boolean not null default false,
  supports_advisory_lock boolean not null default false,
  supports_realtime_optimization boolean not null default false,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_runtime_capabilities (singleton)
values (1)
on conflict (singleton) do nothing;

drop trigger if exists trg_platform_runtime_capabilities_updated_at
  on public.platform_runtime_capabilities;
create trigger trg_platform_runtime_capabilities_updated_at
before update on public.platform_runtime_capabilities
for each row execute function public.set_updated_at();

alter table public.platform_runtime_capabilities enable row level security;

drop policy if exists platform_runtime_capabilities_admin_all
  on public.platform_runtime_capabilities;
create policy platform_runtime_capabilities_admin_all
  on public.platform_runtime_capabilities
  for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- ─── 2) Runtime settings (singleton) ─────────────────────────────────────────
create table if not exists public.platform_runtime_settings (
  singleton smallint primary key default 1 check (singleton = 1),
  enable_pg_cron boolean not null default true,
  enable_realtime_optimization boolean not null default true,
  enable_auto_actions boolean not null default false,
  enable_alert_runner boolean not null default true,
  enable_recovery_runner boolean not null default true,
  enable_delivery_realtime_filtering boolean not null default true,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_runtime_settings (singleton)
values (1)
on conflict (singleton) do nothing;

drop trigger if exists trg_platform_runtime_settings_updated_at
  on public.platform_runtime_settings;
create trigger trg_platform_runtime_settings_updated_at
before update on public.platform_runtime_settings
for each row execute function public.set_updated_at();

alter table public.platform_runtime_settings enable row level security;

drop policy if exists platform_runtime_settings_admin_all
  on public.platform_runtime_settings;
create policy platform_runtime_settings_admin_all
  on public.platform_runtime_settings
  for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- ─── 3) Capability detect RPC ────────────────────────────────────────────────
-- - admin API에서 호출해도 "지원 안 하면 죽지 않게" 개별 감지는 예외 흡수
-- - 서버 시작 blocking 금지: API에서 TTL 기반으로만 호출(앱 코드)
drop function if exists public.detect_platform_runtime_capabilities(boolean);
create or replace function public.detect_platform_runtime_capabilities(p_force boolean default false)
returns public.platform_runtime_capabilities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checked_at timestamptz;
  v_pg_version text := null;
  v_pg_version_num int := null;
  v_supports_pg_cron boolean := false;
  v_supports_pub_cols boolean := false;
  v_supports_adv_rpc boolean := false;
  v_supports_advisory boolean := false;
  v_supports_rt_opt boolean := false;
begin
  select checked_at into v_checked_at
  from public.platform_runtime_capabilities
  where singleton = 1;

  -- TTL 10분 (강제 옵션 없으면 과도한 detect loop 방지)
  if not p_force and v_checked_at is not null and now() - v_checked_at < interval '10 minutes' then
    return (select * from public.platform_runtime_capabilities where singleton = 1);
  end if;

  begin
    v_pg_version := current_setting('server_version');
  exception when others then
    v_pg_version := null;
  end;

  begin
    v_pg_version_num := current_setting('server_version_num')::int;
  exception when others then
    v_pg_version_num := null;
  end;

  begin
    v_supports_pg_cron := exists (select 1 from pg_extension where extname = 'pg_cron');
  exception when others then
    v_supports_pg_cron := false;
  end;

  -- publication column list: PG15+
  v_supports_pub_cols := (v_pg_version_num is not null and v_pg_version_num >= 150000);

  -- advisory lock 함수 자체는 대부분 지원(운영 정책 판단용)
  begin
    perform pg_try_advisory_lock(2147483647);
    perform pg_advisory_unlock(2147483647);
    v_supports_advisory := true;
  exception when others then
    v_supports_advisory := false;
  end;

  -- advanced rpc: JSONB, LATERAL, window 등이 가능한지(대부분 PG13+). 보수적으로 PG14+.
  v_supports_adv_rpc := (v_pg_version_num is not null and v_pg_version_num >= 140000);

  -- realtime optimization: publication 컬럼 필터 등으로 최소 페이로드 구현 가능할 때만 true
  v_supports_rt_opt := v_supports_pub_cols;

  update public.platform_runtime_capabilities
  set
    pg_version = v_pg_version,
    pg_version_num = v_pg_version_num,
    supports_pg_cron = v_supports_pg_cron,
    supports_publication_column_filter = v_supports_pub_cols,
    supports_advanced_rpc = v_supports_adv_rpc,
    supports_advisory_lock = v_supports_advisory,
    supports_realtime_optimization = v_supports_rt_opt,
    checked_at = now()
  where singleton = 1;

  return (select * from public.platform_runtime_capabilities where singleton = 1);
end;
$$;

