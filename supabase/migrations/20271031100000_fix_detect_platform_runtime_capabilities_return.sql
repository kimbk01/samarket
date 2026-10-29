-- 런타임 상태 감지 함수 반환 오류 수정 (재감사 2026-10-30 · 운영 화면 /admin/runtime-health 「불러오지 못했습니다」)
--
-- 원인: detect_platform_runtime_capabilities 가 행 타입을 `return (select * from …)` 로 돌려준다.
--       여러 열 서브쿼리를 한 값으로 쓰는 문법이라 PostgreSQL 이 42601 「subquery must return only one column」을 낸다.
--       운영 DB 함수 정의(md5 76bc5da2439ef87158a6a42aed689d02)에서 두 RETURN 모두 이 형태임을 확인했다.
-- 수정: 같은 행을 변수에 읽어(`select * into v_row …`) 돌려준다. 감지 로직·TTL·갱신 내용은 그대로.
-- 범위: 이 함수 본문 하나. 시그니처·반환형·SECURITY DEFINER·search_path 동일 (CREATE OR REPLACE 라 기존 권한 유지).
-- 롤백: 20260522130000_platform_runtime_capabilities_and_settings.sql 의 같은 함수 정의로 CREATE OR REPLACE.
-- 운영 적용: Owner 별도 승인 후 (개발 프로세스 2번).

CREATE OR REPLACE FUNCTION public.detect_platform_runtime_capabilities(p_force boolean DEFAULT false)
 RETURNS platform_runtime_capabilities
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_checked_at timestamptz;
  v_pg_version text := null;
  v_pg_version_num int := null;
  v_supports_pg_cron boolean := false;
  v_supports_pub_cols boolean := false;
  v_supports_adv_rpc boolean := false;
  v_supports_advisory boolean := false;
  v_supports_rt_opt boolean := false;
  v_row public.platform_runtime_capabilities;
begin
  select checked_at into v_checked_at
  from public.platform_runtime_capabilities
  where singleton = 1;

  -- TTL 10분 (강제 옵션 없으면 과도한 detect loop 방지)
  if not p_force and v_checked_at is not null and now() - v_checked_at < interval '10 minutes' then
    select * into v_row from public.platform_runtime_capabilities where singleton = 1;
    return v_row;
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

  select * into v_row from public.platform_runtime_capabilities where singleton = 1;
  return v_row;
end;
$function$;
