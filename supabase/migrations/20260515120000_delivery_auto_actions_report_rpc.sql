-- Step 15: 자동 액션 운영 리포트 (읽기 전용 집계·목록 RPC)
-- 실행/알림 중복 로직 변경 없음

create index if not exists delivery_operation_alert_actions_status_executed_idx
  on public.delivery_operation_alert_actions (action_status, executed_at desc);

create index if not exists delivery_operation_alert_actions_executed_status_idx
  on public.delivery_operation_alert_actions (executed_at desc, action_status);

create or replace function public.admin_delivery_auto_actions_dashboard(
  p_status text default null,
  p_rule_id uuid default null,
  p_dangerous_only boolean default false,
  p_retry_only boolean default false,
  p_today_only boolean default false,
  p_limit integer default 120
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kill boolean := false;
  v_today_start timestamptz;
  v_lim int := least(200, greatest(10, coalesce(nullif(p_limit, 0), 120)));
  v_avg_wait numeric;
  v_today_success bigint := 0;
  v_today_failed bigint := 0;
  v_today_rejected bigint := 0;
  v_danger_misconfig boolean := false;
  v_pending_total bigint;
  v_pending_stale bigint;
  v_retry_needed bigint;
  v_cron_suspect boolean := false;
  j_actions jsonb;
  j_rules jsonb;
  j_rule_pick jsonb;
  j_banners jsonb := '[]'::jsonb;
begin
  v_today_start := ((now() at time zone 'utc')::date)::timestamp at time zone 'utc';

  select coalesce(s.delivery_auto_actions_enabled, false)
    into v_kill
    from public.delivery_auto_actions_runtime_settings s
   where s.singleton = 1;

  if not coalesce(v_kill, false) then
    j_banners := j_banners || jsonb_build_array('kill_switch_off');
  end if;

  select exists (
    select 1
      from public.delivery_operation_alert_rules r
     where trim(coalesce(r.auto_action_type, '')) in (
             'auto_hold_settlement',
             'auto_reassign_rider',
             'auto_mute'
           )
       and coalesce(r.auto_action_enabled, false)
       and coalesce(r.auto_action_requires_approval, true) = false
  )
    into v_danger_misconfig;

  if coalesce(v_danger_misconfig, false) then
    j_banners := j_banners || jsonb_build_array('dangerous_instant_execution_risk');
  end if;

  select count(*)::bigint into v_pending_total
    from public.delivery_operation_alert_actions a
   where a.action_status = 'pending_approval';

  select count(*)::bigint into v_pending_stale
    from public.delivery_operation_alert_actions a
   where a.action_status = 'pending_approval'
     and a.executed_at < now() - interval '30 minutes';

  if coalesce(v_pending_stale, 0) >= 1 then
    j_banners := j_banners || jsonb_build_array('stale_pending_approval');
  end if;

  select count(*)::bigint into v_retry_needed
    from public.delivery_operation_alert_actions a
   where a.action_status = 'failed'
     and coalesce(a.retry_count, 0) < coalesce(a.max_retries, 3);

  if coalesce(v_retry_needed, 0) >= 1 then
    j_banners := j_banners || jsonb_build_array('failed_actions_need_attention');
  end if;

  if coalesce(v_kill, false)
     and coalesce(v_pending_total, 0) >= 3
     and coalesce(v_pending_stale, 0) * 2 >= coalesce(v_pending_total, 0) then
    v_cron_suspect := true;
    j_banners := j_banners || jsonb_build_array('possible_operator_backlog');
  end if;

  select avg(
           extract(epoch from (a.decided_at - a.executed_at)) / 60.0
         )::numeric
    into v_avg_wait
    from public.delivery_operation_alert_actions a
   where a.decided_at is not null
     and a.executed_at is not null
     and a.action_status in ('success', 'rejected')
     and a.executed_at >= v_today_start;

  select
    count(*) filter (where action_status = 'success'),
    count(*) filter (where action_status = 'failed'),
    count(*) filter (where action_status = 'rejected')
    into v_today_success, v_today_failed, v_today_rejected
    from public.delivery_operation_alert_actions
   where executed_at >= v_today_start;

  if coalesce(v_today_failed, 0) >= 1 then
    j_banners := j_banners || jsonb_build_array('today_failed_present');
  end if;

  select coalesce(jsonb_agg(row_json order by ord), '[]'::jsonb)
    into j_rules
    from (
      with rule_avg_wait as (
        select
          ex.rule_id,
          round(
            avg(
              extract(epoch from (ax.decided_at - ax.executed_at)) / 60.0
            )::numeric,
            2
          ) as avg_min
          from public.delivery_operation_alert_actions ax
          join public.delivery_operation_alert_events ex on ex.id = ax.event_id
         where ax.decided_at is not null
           and ax.executed_at is not null
           and ax.action_status in ('success', 'rejected')
           and ax.executed_at >= v_today_start
         group by ex.rule_id
      )
      select
        row_number() over (order by r.rule_key) as ord,
        jsonb_build_object(
          'rule_id', r.id,
          'rule_key', r.rule_key,
          'rule_name', r.rule_name,
          'dangerous',
            trim(coalesce(r.auto_action_type, '')) in (
              'auto_hold_settlement',
              'auto_reassign_rider',
              'auto_mute'
            ),
          'actions_today',
            count(*) filter (
              where a.executed_at >= v_today_start
            ),
          'success_today',
            count(*) filter (
              where a.executed_at >= v_today_start and a.action_status = 'success'
            ),
          'failed_today',
            count(*) filter (
              where a.executed_at >= v_today_start and a.action_status = 'failed'
            ),
          'rejected_today',
            count(*) filter (
              where a.executed_at >= v_today_start and a.action_status = 'rejected'
            ),
          'pending_open',
            count(*) filter (
              where a.action_status = 'pending_approval'
            ),
          'avg_approval_wait_minutes_today', rw.avg_min,
          'avg_retry_today',
            round(
              avg(a.retry_count) filter (
                where a.executed_at >= v_today_start
              )::numeric,
              2
            )
        ) as row_json
        from public.delivery_operation_alert_rules r
        left join rule_avg_wait rw on rw.rule_id = r.id
        left join public.delivery_operation_alert_events e on e.rule_id = r.id
        left join public.delivery_operation_alert_actions a on a.event_id = e.id
       where coalesce(r.auto_action_enabled, false)
       group by r.id, r.rule_key, r.rule_name, r.auto_action_type, rw.avg_min
       order by r.rule_key
       limit 80
    ) z;

  select coalesce(jsonb_agg(row_json order by ord), '[]'::jsonb)
    into j_rule_pick
    from (
      select row_number() over (order by r.rule_key) as ord,
             jsonb_build_object(
               'id', r.id,
               'rule_key', r.rule_key,
               'rule_name', r.rule_name
             ) as row_json
        from public.delivery_operation_alert_rules r
       where coalesce(r.auto_action_enabled, false)
       order by r.rule_key
       limit 80
    ) q;

  select coalesce(jsonb_agg(row_json order by ord), '[]'::jsonb)
    into j_actions
    from (
      select row_number() over (order by a.executed_at desc) as ord,
             jsonb_build_object(
               'id', a.id,
               'event_id', a.event_id,
               'action_type', a.action_type,
               'action_status', a.action_status,
               'executed_at', a.executed_at,
               'executed_by_system', a.executed_by_system,
               'result_message', a.result_message,
               'metadata', coalesce(a.metadata, '{}'::jsonb),
               'retry_count', coalesce(a.retry_count, 0),
               'max_retries', coalesce(a.max_retries, 3),
               'approval_actor_id', a.approval_actor_id,
               'approval_note', a.approval_note,
               'decided_at', a.decided_at,
               'rule_id', r.id,
               'rule_key', r.rule_key,
               'rule_name', r.rule_name,
               'order_id', e.order_id,
               'order_no', coalesce(so.order_no::text, ''),
               'event_status', e.event_status,
               'dangerous_action',
                 a.action_type in (
                   'auto_hold_settlement',
                   'auto_reassign_rider',
                   'auto_mute'
                 ),
               'stale_pending',
                 (
                   a.action_status = 'pending_approval'
                   and a.executed_at < now() - interval '30 minutes'
                 ),
               'retry_eligible',
                 (
                   a.action_status = 'failed'
                   and coalesce(a.retry_count, 0) < coalesce(a.max_retries, 3)
                 )
             ) as row_json
        from public.delivery_operation_alert_actions a
        join public.delivery_operation_alert_events e on e.id = a.event_id
        join public.delivery_operation_alert_rules r on r.id = e.rule_id
        left join public.store_orders so on so.id = e.order_id
       where (p_status is null or btrim(p_status) = '' or a.action_status = p_status)
         and (not coalesce(p_dangerous_only, false)
              or a.action_type in (
                'auto_hold_settlement',
                'auto_reassign_rider',
                'auto_mute'
              ))
         and (not coalesce(p_retry_only, false)
              or (
                a.action_status = 'failed'
                and coalesce(a.retry_count, 0) < coalesce(a.max_retries, 3)
              ))
         and (not coalesce(p_today_only, false) or a.executed_at >= v_today_start)
         and (p_rule_id is null or r.id = p_rule_id)
       order by a.executed_at desc
       limit v_lim
    ) x;

  return jsonb_build_object(
    'generated_at', to_jsonb(now()),
    'today_start_utc', to_jsonb(v_today_start),
    'kill_switch_on', coalesce(v_kill, false),
    'dangerous_instant_misconfigured', coalesce(v_danger_misconfig, false),
    'cron_suspect_stale_ratio', coalesce(v_cron_suspect, false),
    'kpi', jsonb_build_object(
      'pending_total', coalesce(v_pending_total, 0),
      'pending_stale_30m', coalesce(v_pending_stale, 0),
      'today_success', coalesce(v_today_success, 0),
      'today_failed', coalesce(v_today_failed, 0),
      'today_rejected', coalesce(v_today_rejected, 0),
      'retry_needed', coalesce(v_retry_needed, 0),
      'dangerous_pending',
        (select count(*)::bigint from public.delivery_operation_alert_actions ax
          where ax.action_status = 'pending_approval'
            and ax.action_type in (
              'auto_hold_settlement',
              'auto_reassign_rider',
              'auto_mute'
            )),
      'avg_approval_wait_minutes_today',
        case
          when v_avg_wait is null then null
          else round(v_avg_wait::numeric, 2)
        end,
      'dangerous_actions_require_approval_policy',
        true
    ),
    'banners', j_banners,
    'rules', coalesce(j_rules, '[]'::jsonb),
    'rule_picklist', coalesce(j_rule_pick, '[]'::jsonb),
    'actions', coalesce(j_actions, '[]'::jsonb),
    'query', jsonb_build_object(
      'status', p_status,
      'rule_id', p_rule_id,
      'dangerous_only', coalesce(p_dangerous_only, false),
      'retry_only', coalesce(p_retry_only, false),
      'today_only', coalesce(p_today_only, false),
      'limit', v_lim
    )
  );
end;
$$;

revoke all on function public.admin_delivery_auto_actions_dashboard(
  text, uuid, boolean, boolean, boolean, integer
) from public;

grant execute on function public.admin_delivery_auto_actions_dashboard(
  text, uuid, boolean, boolean, boolean, integer
) to service_role;
