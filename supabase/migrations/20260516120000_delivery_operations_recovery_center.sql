-- Step 16: 운영 복구·장애 대응 센터 (헬스 하트비트·복구 RPC·로그)
-- - 주문 상태 머신 전이·알림 중복·Realtime·채팅 unread 변경 없음
-- - pg_cron 명령에 하트비트 기록만 추가 (sync/runner 본문 미변경)

-- ─── 하트비트 (크론·수동 실행 마지막 성공 시각) ─────────────────────────────
create table if not exists public.delivery_operation_job_heartbeats (
  job_key text primary key,
  last_run_at timestamptz not null default now(),
  last_ok boolean not null default true,
  detail jsonb not null default '{}'::jsonb
);

comment on table public.delivery_operation_job_heartbeats is
  '배달 운영 배치(sla_scan·alert_sync·auto_action_runner) 마지막 성공 시각';

alter table public.delivery_operation_job_heartbeats enable row level security;

drop policy if exists delivery_operation_job_heartbeats_admin_select
  on public.delivery_operation_job_heartbeats;
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

revoke all on function public.touch_delivery_operation_job_heartbeat(text, boolean, jsonb) from public;
grant execute on function public.touch_delivery_operation_job_heartbeat(text, boolean, jsonb) to service_role;

-- ─── 복구 로그 ───────────────────────────────────────────────────────────────
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

drop policy if exists delivery_operation_recovery_logs_admin_all
  on public.delivery_operation_recovery_logs;
create policy delivery_operation_recovery_logs_admin_all
  on public.delivery_operation_recovery_logs
  for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- ─── 헬스 번들 RPC ───────────────────────────────────────────────────────────
create or replace function public.admin_delivery_operations_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  -- 기준(분/건): 코드 상수 — 필요 시 여기만 조정
  c_cron_stale_seconds integer := 300;
  c_failed_actions_warn integer := 20;
  c_pending_appr_warn integer := 100;
  c_stuck_delivering interval := interval '2 hours';
  c_stuck_waiting interval := interval '30 minutes';
  c_pending_appr_stale interval := interval '15 minutes';
  c_held_settlement interval := interval '3 days';

  v_sla_age bigint;
  v_alert_age bigint;
  v_runner_age bigint;

  v_pending_appr bigint;
  v_pending_appr_stale bigint;
  v_failed_open bigint;
  v_failed_recent timestamptz;
  v_stuck_del bigint;
  v_stuck_wr bigint;
  v_held_old bigint;
  v_held_total bigint;
  v_kill boolean := false;

  v_issues jsonb := '[]'::jsonb;
  v_banners jsonb := '[]'::jsonb;
  v_level text := 'ok';
begin
  select coalesce(s.delivery_auto_actions_enabled, false)
    into v_kill
    from public.delivery_auto_actions_runtime_settings s
   where s.singleton = 1;

  v_sla_age := coalesce(
    (
      select extract(epoch from (v_now - h.last_run_at))::bigint
        from public.delivery_operation_job_heartbeats h
       where h.job_key = 'sla_scan'
    ),
    86400000::bigint
  );

  v_alert_age := coalesce(
    (
      select extract(epoch from (v_now - h.last_run_at))::bigint
        from public.delivery_operation_job_heartbeats h
       where h.job_key = 'alert_sync'
    ),
    86400000::bigint
  );

  v_runner_age := coalesce(
    (
      select extract(epoch from (v_now - h.last_run_at))::bigint
        from public.delivery_operation_job_heartbeats h
       where h.job_key = 'auto_action_runner'
    ),
    86400000::bigint
  );

  select count(*)::bigint into v_pending_appr
    from public.delivery_operation_alert_actions a
   where a.action_status = 'pending_approval';

  select count(*)::bigint into v_pending_appr_stale
    from public.delivery_operation_alert_actions a
   where a.action_status = 'pending_approval'
     and a.executed_at < v_now - c_pending_appr_stale;

  select count(*)::bigint into v_failed_open
    from public.delivery_operation_alert_actions a
   where a.action_status = 'failed';

  select max(a.executed_at) into v_failed_recent
    from public.delivery_operation_alert_actions a
   where a.action_status = 'failed';

  select count(*)::bigint into v_stuck_del
    from public.store_orders so
   where so.order_status = 'delivering'
     and so.updated_at < v_now - c_stuck_delivering;

  select count(*)::bigint into v_stuck_wr
    from public.store_order_deliveries sod
    join public.store_orders so on so.id = sod.order_id
   where sod.delivery_status = 'waiting_rider'
     and so.order_status not in ('completed','cancelled','refunded')
     and sod.updated_at < v_now - c_stuck_waiting;

  select count(*)::bigint into v_held_old
    from public.store_settlements ss
   where ss.settlement_status = 'held'
     and ss.created_at < v_now - c_held_settlement;

  select count(*)::bigint into v_held_total
    from public.store_settlements ss
   where ss.settlement_status = 'held';

  if not coalesce(v_kill, false) then
    v_banners := v_banners || jsonb_build_array('auto_actions_disabled');
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'auto_actions_kill_switch_off',
      'severity', 'warning'
    ));
    if v_level = 'ok' then v_level := 'warning'; end if;
  end if;

  if greatest(v_sla_age, v_alert_age, v_runner_age) >= c_cron_stale_seconds then
    v_banners := v_banners || jsonb_build_array('cron_heartbeat_stale');
    if v_sla_age >= c_cron_stale_seconds then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'sla_cron_stale',
        'severity', 'danger',
        'age_seconds', v_sla_age
      ));
    end if;
    if v_alert_age >= c_cron_stale_seconds then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'alert_sync_stale',
        'severity', 'danger',
        'age_seconds', v_alert_age
      ));
    end if;
    if v_runner_age >= c_cron_stale_seconds then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'auto_action_runner_stale',
        'severity', 'danger',
        'age_seconds', v_runner_age
      ));
    end if;
    v_level := 'danger';
  end if;

  if coalesce(v_failed_open, 0) >= c_failed_actions_warn then
    v_banners := v_banners || jsonb_build_array('failed_auto_action_backlog');
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'failed_actions_high',
      'severity', 'warning',
      'count', v_failed_open
    ));
    if v_level <> 'danger' then v_level := 'warning'; end if;
  end if;

  if coalesce(v_pending_appr, 0) >= c_pending_appr_warn then
    v_banners := v_banners || jsonb_build_array('pending_approval_backlog_high');
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'pending_approval_high',
      'severity', 'warning',
      'count', v_pending_appr
    ));
    if v_level <> 'danger' then v_level := 'warning'; end if;
  end if;

  if coalesce(v_pending_appr_stale, 0) >= 1 then
    v_banners := v_banners || jsonb_build_array('stale_pending_approval');
  end if;

  if coalesce(v_stuck_wr, 0) >= 1 or coalesce(v_stuck_del, 0) >= 1 then
    v_banners := v_banners || jsonb_build_array('stuck_orders_detected');
  end if;

  if coalesce(v_held_old, 0) >= 1 then
    v_banners := v_banners || jsonb_build_array('held_settlement_stale');
  end if;

  return jsonb_build_object(
    'generated_at', to_jsonb(v_now),
    'thresholds', jsonb_build_object(
      'cron_stale_seconds', c_cron_stale_seconds,
      'failed_actions_warning', c_failed_actions_warn,
      'pending_approval_warning', c_pending_appr_warn,
      'stuck_delivering_interval_minutes', 120,
      'stuck_waiting_rider_interval_minutes', 30,
      'pending_approval_stale_minutes', 15,
      'held_settlement_stale_days', 3
    ),
    'heartbeats', jsonb_build_object(
      'sla_scan', (
        select jsonb_build_object(
          'last_run_at', h.last_run_at,
          'last_ok', h.last_ok,
          'age_seconds', coalesce(extract(epoch from (v_now - h.last_run_at))::bigint, null)
        )
          from public.delivery_operation_job_heartbeats h
         where h.job_key = 'sla_scan'
      ),
      'alert_sync', (
        select jsonb_build_object(
          'last_run_at', h.last_run_at,
          'last_ok', h.last_ok,
          'age_seconds', coalesce(extract(epoch from (v_now - h.last_run_at))::bigint, null)
        )
          from public.delivery_operation_job_heartbeats h
         where h.job_key = 'alert_sync'
      ),
      'auto_action_runner', (
        select jsonb_build_object(
          'last_run_at', h.last_run_at,
          'last_ok', h.last_ok,
          'age_seconds', coalesce(extract(epoch from (v_now - h.last_run_at))::bigint, null)
        )
          from public.delivery_operation_job_heartbeats h
         where h.job_key = 'auto_action_runner'
      )
    ),
    'counts', jsonb_build_object(
      'pending_approval_actions', coalesce(v_pending_appr, 0),
      'pending_approval_stale_15m', coalesce(v_pending_appr_stale, 0),
      'failed_actions_open', coalesce(v_failed_open, 0),
      'recent_failed_action_at', to_jsonb(v_failed_recent),
      'stuck_delivering_2h', coalesce(v_stuck_del, 0),
      'stuck_waiting_rider_30m', coalesce(v_stuck_wr, 0),
      'held_settlement_older_than_3d', coalesce(v_held_old, 0),
      'held_settlement_total', coalesce(v_held_total, 0),
      'auto_actions_kill_switch_on', coalesce(v_kill, false),
      'heartbeat_age_seconds', jsonb_build_object(
        'sla_scan', v_sla_age,
        'alert_sync', v_alert_age,
        'auto_action_runner', v_runner_age
      )
    ),
    'verdict', jsonb_build_object(
      'overall', v_level,
      'issues', v_issues
    ),
    'banners', v_banners
  );
end;
$$;

revoke all on function public.admin_delivery_operations_health() from public;
grant execute on function public.admin_delivery_operations_health() to service_role;

-- ─── 복구 실행 RPC ───────────────────────────────────────────────────────────
create or replace function public.admin_delivery_operation_recovery_execute(
  p_action text,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(trim(coalesce(p_action, '')));
  v_ok boolean := false;
  v_detail jsonb := '{}'::jsonb;
  v_result text := 'noop';
  v_n int := 0;
  v_aid uuid;
  v_slot int;
begin
  if p_actor is null then
    return jsonb_build_object('ok', false, 'error', 'actor_required');
  end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = p_actor
       and p.role in ('admin', 'super_admin')
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_platform_admin');
  end if;

  if length(v_action) < 2 then
    return jsonb_build_object('ok', false, 'error', 'bad_action');
  end if;

  v_slot := (abs(hashtext(v_action)) % 28000) + 1;
  if not pg_try_advisory_xact_lock(87281426, v_slot) then
    return jsonb_build_object('ok', false, 'error', 'concurrent_recovery', 'action', v_action);
  end if;

  if v_action = 'sla_scan' then
    perform public.scan_store_order_sla_warnings();
    perform public.touch_delivery_operation_job_heartbeat('sla_scan', true, jsonb_build_object('source', 'manual'));
    v_ok := true;
    v_result := 'sla_scan_ok';

  elsif v_action = 'alert_sync' then
    perform public.sync_delivery_operation_alert_events();
    perform public.touch_delivery_operation_job_heartbeat('alert_sync', true, jsonb_build_object('source', 'manual'));
    v_ok := true;
    v_result := 'alert_sync_ok';

  elsif v_action = 'auto_action_runner' then
    perform public.run_delivery_operation_alert_auto_actions();
    perform public.touch_delivery_operation_job_heartbeat('auto_action_runner', true, jsonb_build_object('source', 'manual'));
    v_ok := true;
    v_result := 'auto_action_runner_ok';

  elsif v_action = 'alert_pipeline' then
    perform public.sync_delivery_operation_alert_events();
    perform public.touch_delivery_operation_job_heartbeat('alert_sync', true, jsonb_build_object('source', 'manual_pipeline'));
    perform public.run_delivery_operation_alert_auto_actions();
    perform public.touch_delivery_operation_job_heartbeat('auto_action_runner', true, jsonb_build_object('source', 'manual_pipeline'));
    v_ok := true;
    v_result := 'alert_pipeline_ok';

  elsif v_action = 'stale_alerts_resolve' then
    with targets as (
      select e.id
        from public.delivery_operation_alert_events e
        join public.store_orders so on so.id = e.order_id
       where e.event_status = 'open'
         and so.order_status in ('completed','cancelled','refunded')
       limit 220
    )
    update public.delivery_operation_alert_events e
       set event_status = 'resolved',
           resolved_at = now(),
           resolved_by = p_actor
      from targets t
     where e.id = t.id;
    get diagnostics v_n = row_count;
    v_ok := true;
    v_result := 'stale_alerts_resolve';
    v_detail := jsonb_build_object('resolved_rows', v_n);

  elsif v_action = 'waiting_rider_bump' then
    with targets as (
      select sod.order_id
        from public.store_order_deliveries sod
        join public.store_orders so on so.id = sod.order_id
       where sod.delivery_status = 'waiting_rider'
         and so.order_status not in ('completed','cancelled','refunded')
         and sod.updated_at < now() - interval '30 minutes'
       limit 120
    )
    update public.store_order_deliveries sod
       set updated_at = now()
      from targets t
     where sod.order_id = t.order_id;
    get diagnostics v_n = row_count;
    v_ok := true;
    v_result := 'waiting_rider_bump';
    v_detail := jsonb_build_object('touched_deliveries', v_n);

  elsif v_action = 'delivering_mark_attention' then
    with targets as (
      select so.id
        from public.store_orders so
       where so.order_status = 'delivering'
         and so.updated_at < now() - interval '2 hours'
       limit 120
    )
    update public.store_orders so
       set needs_admin_attention = true
      from targets t
     where so.id = t.id
       and coalesce(so.needs_admin_attention, false) = false;
    get diagnostics v_n = row_count;
    v_ok := true;
    v_result := 'delivering_mark_attention';
    v_detail := jsonb_build_object('flagged_orders', v_n);

  elsif v_action = 'bulk_retry_failed_auto_actions' then
    v_detail := jsonb_build_object('errors', '[]'::jsonb);
    for v_aid in
      select a.id
        from public.delivery_operation_alert_actions a
       where a.action_status = 'failed'
         and coalesce(a.retry_count, 0) < coalesce(a.max_retries, 3)
       order by a.executed_at asc
       limit 30
    loop
      begin
        perform public.retry_delivery_alert_auto_action(v_aid, p_actor);
        v_n := v_n + 1;
      exception
        when others then
          v_detail := jsonb_set(
            coalesce(v_detail, '{}'::jsonb),
            '{errors}',
            coalesce(v_detail->'errors', '[]'::jsonb)
              || jsonb_build_array(
                jsonb_build_object('action_id', v_aid, 'message', left(sqlerrm, 400))
              )
          );
      end;
    end loop;
    v_ok := true;
    v_result := 'bulk_retry_failed_auto_actions';
    v_detail := coalesce(v_detail, '{}'::jsonb) || jsonb_build_object('success_attempts', v_n);

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_action', 'action', v_action);
  end if;

  insert into public.delivery_operation_recovery_logs (
    action_type,
    actor_admin_id,
    result,
    metadata
  )
  values (
    v_action,
    p_actor,
    v_result,
    coalesce(v_detail, '{}'::jsonb)
      || jsonb_build_object('ok', v_ok)
  );

  return jsonb_build_object(
    'ok', v_ok,
    'result', v_result,
    'detail', coalesce(v_detail, '{}'::jsonb)
  );

exception
  when others then
    insert into public.delivery_operation_recovery_logs (
      action_type,
      actor_admin_id,
      result,
      metadata
    )
    values (
      v_action,
      p_actor,
      'error',
      jsonb_build_object(
        'message', left(sqlerrm, 800),
        'ok', false
      )
    );
    return jsonb_build_object(
      'ok', false,
      'result', 'error',
      'detail', jsonb_build_object('message', left(sqlerrm, 800))
    );
end;
$$;

revoke all on function public.admin_delivery_operation_recovery_execute(text, uuid) from public;
grant execute on function public.admin_delivery_operation_recovery_execute(text, uuid) to service_role;

-- ─── pg_cron: 하트비트만 추가 ────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'scan_store_order_sla_warnings';

    perform cron.schedule(
      'scan_store_order_sla_warnings',
      '*/2 * * * *',
      $cron$
        select public.scan_store_order_sla_warnings();
        select public.touch_delivery_operation_job_heartbeat('sla_scan', true);
      $cron$
    );

    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'sync_delivery_operation_alert_events';

    perform cron.schedule(
      'sync_delivery_operation_alert_events',
      '*/2 * * * *',
      $cron$
        select public.sync_delivery_operation_alert_events();
        select public.touch_delivery_operation_job_heartbeat('alert_sync', true);
        select public.run_delivery_operation_alert_auto_actions();
        select public.touch_delivery_operation_job_heartbeat('auto_action_runner', true);
      $cron$
    );

    raise notice 'delivery_recovery_center: cron jobs updated with heartbeats';
  else
    raise notice 'delivery_recovery_center: pg_cron not installed — heartbeat cron skipped';
  end if;
exception
  when undefined_table then
    raise notice 'delivery_recovery_center: cron tables unavailable — skipped';
  when undefined_function then
    raise notice 'delivery_recovery_center: cron.schedule unavailable — skipped';
end $$;
