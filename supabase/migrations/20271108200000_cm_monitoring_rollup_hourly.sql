-- =============================================================================
-- U1 메신저 모니터링 집계 보존 (Owner 「U1 승인」 2026-11-08)
-- 설계: docs/audit/supabase-request-surge-design-supplement-2026-11-08.md §7
--
-- 목적: 클라이언트 모니터링 이벤트를 서버 인스턴스 메모리가 아닌 DB 에 「시간 단위 집계」로 남긴다.
--  - 저장 단위: (시간, category, metric, outcome, platform) 별 발생 수·값 합·최댓값·버린 수
--  - 저장하지 않는 것: 사용자·방·세션 ID, 토큰, 메시지 본문, 자유 문자열 라벨
--  - 쓰기: 수집 API 요청 1회 = 이 함수 1회 (클라이언트가 탭당 5분 1회로 제한)
--  - 보존: 14일. 함수가 실행될 때 오래된 행을 최대 500행씩 지운다 (별도 cron 없음)
--  - 권한: service_role 만 실행·조회. anon/authenticated 접근 없음.
-- =============================================================================

begin;

create table if not exists public.cm_monitoring_rollup_hourly (
  bucket_hour timestamptz not null,
  category text not null check (category ~ '^[a-z0-9_.:-]{1,64}$'),
  metric text not null check (metric ~ '^[a-z0-9_.:-]{1,96}$'),
  outcome text not null default '' check (outcome in ('', 'ok', 'error')),
  platform text not null check (platform in ('web', 'ios', 'android', 'unknown')),
  event_count bigint not null default 0 check (event_count >= 0),
  value_count bigint not null default 0 check (value_count >= 0),
  value_sum double precision not null default 0,
  value_max double precision,
  dropped_count bigint not null default 0 check (dropped_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (bucket_hour, category, metric, outcome, platform)
);

comment on table public.cm_monitoring_rollup_hourly is
  'U1 메신저 클라이언트 모니터링 시간 단위 집계. ID·본문 미저장. 14일 보존(cm_monitoring_rollup_add 가 정리).';

alter table public.cm_monitoring_rollup_hourly enable row level security;
revoke all on table public.cm_monitoring_rollup_hourly from public, anon, authenticated;
grant select, insert, update, delete on table public.cm_monitoring_rollup_hourly to service_role;

create index if not exists cm_monitoring_rollup_hourly_bucket_idx
  on public.cm_monitoring_rollup_hourly (bucket_hour);

-- p_rows: [{ "category", "metric", "outcome", "event_count", "value_count", "value_sum", "value_max", "dropped_count" }]
create or replace function public.cm_monitoring_rollup_add(p_platform text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_platform text := case when p_platform in ('web', 'ios', 'android') then p_platform else 'unknown' end;
  v_bucket timestamptz := date_trunc('hour', now());
  v_row jsonb;
  v_category text;
  v_metric text;
  v_outcome text;
  v_event bigint;
  v_vcount bigint;
  v_vsum double precision;
  v_vmax double precision;
  v_dropped bigint;
  v_written integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) limit 128 loop
    v_category := lower(coalesce(v_row ->> 'category', ''));
    v_metric := lower(coalesce(v_row ->> 'metric', ''));
    v_outcome := coalesce(v_row ->> 'outcome', '');
    if v_category !~ '^[a-z0-9_.:-]{1,64}$' or v_metric !~ '^[a-z0-9_.:-]{1,96}$' then
      continue;
    end if;
    if v_outcome not in ('', 'ok', 'error') then
      v_outcome := '';
    end if;

    v_event := least(greatest(floor(coalesce((v_row ->> 'event_count')::numeric, 0))::bigint, 0), 1000000);
    v_vcount := least(greatest(floor(coalesce((v_row ->> 'value_count')::numeric, 0))::bigint, 0), 1000000);
    v_dropped := least(greatest(floor(coalesce((v_row ->> 'dropped_count')::numeric, 0))::bigint, 0), 1000000);
    v_vsum := coalesce((v_row ->> 'value_sum')::double precision, 0);
    v_vmax := (v_row ->> 'value_max')::double precision;
    if v_vsum = 'NaN'::double precision or v_vsum in ('Infinity'::double precision, '-Infinity'::double precision) then
      v_vsum := 0;
    end if;
    if v_vmax = 'NaN'::double precision or v_vmax in ('Infinity'::double precision, '-Infinity'::double precision) then
      v_vmax := null;
    end if;
    if v_event = 0 and v_dropped = 0 then
      continue;
    end if;

    insert into public.cm_monitoring_rollup_hourly as r (
      bucket_hour, category, metric, outcome, platform,
      event_count, value_count, value_sum, value_max, dropped_count, updated_at
    ) values (
      v_bucket, v_category, v_metric, v_outcome, v_platform,
      v_event, v_vcount, v_vsum, v_vmax, v_dropped, now()
    )
    on conflict (bucket_hour, category, metric, outcome, platform) do update set
      event_count = r.event_count + excluded.event_count,
      value_count = r.value_count + excluded.value_count,
      value_sum = r.value_sum + excluded.value_sum,
      value_max = case
        when r.value_max is null then excluded.value_max
        when excluded.value_max is null then r.value_max
        else greatest(r.value_max, excluded.value_max)
      end,
      dropped_count = r.dropped_count + excluded.dropped_count,
      updated_at = now();
    v_written := v_written + 1;
  end loop;

  -- 14일 보존 — 오래된 행을 최대 500행씩 정리
  delete from public.cm_monitoring_rollup_hourly
  where ctid in (
    select ctid from public.cm_monitoring_rollup_hourly
    where bucket_hour < now() - interval '14 days'
    limit 500
  );

  return v_written;
end;
$$;

revoke all on function public.cm_monitoring_rollup_add(text, jsonb) from public, anon, authenticated;
grant execute on function public.cm_monitoring_rollup_add(text, jsonb) to service_role;

comment on function public.cm_monitoring_rollup_add(text, jsonb) is
  'U1 메신저 모니터링 집계 1배치 누적(최대 128행) + 14일 지난 행 최대 500행 정리. service_role 전용.';

commit;
