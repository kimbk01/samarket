-- X-4 (문서 K, 2026-10-21 PHT) — 운영 누락분만 최소 보완. 운영 적용 완료(apply 도구), 버전 기록 일치.
-- 원본: 20260516120000_delivery_operations_recovery_center.sql / 20260826180000_free_coupon_v32_authority_lifecycle.sql
-- 차이: DROP POLICY·pg_cron 블록 제외(운영에 pg_cron 없음), 실행 권한 service_role 전용(anon·authenticated 회수),
--       복구 로그 정책 SELECT 전용 + 클라이언트 쓰기 회수(1-D 직접 쓰기 차단 원칙). 데이터 변경 0.

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

revoke all on function public.admin_delivery_operations_health() from public, anon, authenticated;
grant execute on function public.admin_delivery_operations_health() to service_role;
