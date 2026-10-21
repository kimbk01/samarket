-- X-4 (문서 K, 2026-10-21 PHT) — 운영 누락분만 최소 보완. 운영 적용 완료(apply 도구), 버전 기록 일치.
-- 원본: 20260516120000_delivery_operations_recovery_center.sql / 20260826180000_free_coupon_v32_authority_lifecycle.sql
-- 차이: DROP POLICY·pg_cron 블록 제외(운영에 pg_cron 없음), 실행 권한 service_role 전용(anon·authenticated 회수),
--       복구 로그 정책 SELECT 전용 + 클라이언트 쓰기 회수(1-D 직접 쓰기 차단 원칙). 데이터 변경 0.

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

revoke all on function public.admin_delivery_operation_recovery_execute(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_delivery_operation_recovery_execute(text, uuid) to service_role;
