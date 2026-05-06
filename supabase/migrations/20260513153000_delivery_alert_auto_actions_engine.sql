-- 배달 운영 알림 자동 액션 엔진 (Step 13)
-- - 주문 상태(order_status) 전이 머신 변경 없음 (컬럼 플래그·정산·배차 행만 조정)
-- - open (rule_id, order_id) 부분 유니크 불변
-- - unread/badge/chat·Realtime publication 변경 없음

-- ─── Rules: 자동 액션 설정 ───────────────────────────────────────────────────
alter table public.delivery_operation_alert_rules
  add column if not exists auto_action_type text;

alter table public.delivery_operation_alert_rules
  add column if not exists auto_action_enabled boolean not null default false;

alter table public.delivery_operation_alert_rules
  add column if not exists auto_action_delay_minutes integer;

alter table public.delivery_operation_alert_rules
  add column if not exists auto_action_min_escalation_count integer not null default 0;

alter table public.delivery_operation_alert_events
  add column if not exists last_auto_action_tick_at timestamptz;

alter table public.delivery_operation_alert_rules
  drop constraint if exists delivery_alert_rules_auto_action_type_chk;
alter table public.delivery_operation_alert_rules
  add constraint delivery_alert_rules_auto_action_type_chk
    check (
      auto_action_type is null
      or trim(auto_action_type) = ''
      or auto_action_type in (
        'auto_hold_settlement',
        'auto_flag_order',
        'auto_reassign_rider',
        'auto_escalate',
        'auto_assign_admin',
        'auto_mark_attention',
        'auto_mute'
      )
    );

alter table public.delivery_operation_alert_rules
  drop constraint if exists delivery_alert_rules_auto_escalation_min_chk;
alter table public.delivery_operation_alert_rules
  add constraint delivery_alert_rules_auto_escalation_min_chk
    check (auto_action_min_escalation_count >= 0);

alter table public.delivery_operation_alert_rules
  drop constraint if exists delivery_alert_rules_auto_when_enabled_chk;
alter table public.delivery_operation_alert_rules
  add constraint delivery_alert_rules_auto_when_enabled_chk
    check (
      not auto_action_enabled
      or (
        auto_action_type is not null
        and length(trim(auto_action_type)) > 0
        and auto_action_delay_minutes is not null
        and auto_action_delay_minutes >= 1
      )
    );

comment on column public.delivery_operation_alert_rules.auto_action_type is
  'auto_hold_settlement | auto_flag_order | auto_reassign_rider | auto_escalate | auto_assign_admin | auto_mark_attention | auto_mute';

-- ─── Round-robin 시퀀스 (관리자 자동 배정) ────────────────────────────────────
create table if not exists public.delivery_alert_auto_assign_rr (
  singleton smallint primary key default 1 check (singleton = 1),
  seq bigint not null default 0
);

insert into public.delivery_alert_auto_assign_rr (singleton, seq)
values (1, 0)
on conflict (singleton) do nothing;

alter table public.delivery_alert_auto_assign_rr enable row level security;

-- ─── 액션 실행 로그 ───────────────────────────────────────────────────────────
create table if not exists public.delivery_operation_alert_actions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.delivery_operation_alert_events(id) on delete cascade,
  action_type text not null,
  action_status text not null check (action_status in ('success', 'failed', 'skipped')),
  executed_at timestamptz not null default now(),
  executed_by_system boolean not null default true,
  result_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists delivery_operation_alert_actions_event_exec_idx
  on public.delivery_operation_alert_actions (event_id, executed_at desc);

create unique index if not exists delivery_operation_alert_actions_event_type_success_uidx
  on public.delivery_operation_alert_actions (event_id, action_type)
  where action_status = 'success';

alter table public.delivery_operation_alert_actions enable row level security;

drop policy if exists delivery_operation_alert_actions_admin_all on public.delivery_operation_alert_actions;
create policy delivery_operation_alert_actions_admin_all
  on public.delivery_operation_alert_actions
  for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- ─── 감사 로그: auto_action 행 직접 삽입 ───────────────────────────────────────
create or replace function public.log_delivery_alert_auto_action(
  p_event_id uuid,
  p_subtype text,
  p_prev_status text,
  p_next_status text,
  p_note text,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.delivery_operation_alert_event_logs (
    event_id,
    action_type,
    actor_admin_id,
    previous_status,
    next_status,
    previous_assignee,
    next_assignee,
    note,
    metadata
  )
  values (
    p_event_id,
    'auto_action',
    null,
    p_prev_status,
    p_next_status,
    null,
    null,
    nullif(trim(p_note), ''),
    coalesce(nullif(p_metadata, '{}'::jsonb), '{}'::jsonb)
      || jsonb_build_object('auto_action_type', p_subtype)
  );
end;
$$;

revoke all on function public.log_delivery_alert_auto_action(uuid, text, text, text, text, jsonb) from public;

-- ─── 실행 엔진 ───────────────────────────────────────────────────────────────
create or replace function public.run_delivery_operation_alert_auto_actions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  r record;
  v_admins uuid[];
  v_n int;
  v_seq bigint;
  v_pick uuid;
  v_ok boolean := false;
  v_rows int;
  v_prev text;
  v_next text;
begin
  select coalesce(array_agg(p.id order by p.id), array[]::uuid[])
    into v_admins
    from public.profiles p
   where p.role in ('admin', 'super_admin');

  v_n := coalesce(array_length(v_admins, 1), 0);

  for r in
    select
      e.id as event_id,
      e.order_id,
      e.store_id,
      e.event_status,
      e.escalation_count,
      e.first_triggered_at,
      e.severity,
      e.assigned_admin_id,
      ru.rule_key,
      ru.auto_action_type as aa_type,
      ru.auto_action_delay_minutes as aa_delay,
      ru.auto_action_min_escalation_count as aa_min_esc,
      ru.max_escalation_level as ru_max_esc
      from public.delivery_operation_alert_events e
      join public.delivery_operation_alert_rules ru on ru.id = e.rule_id
     where e.event_status = 'open'
       and ru.is_active
       and ru.auto_action_enabled
       and ru.auto_action_type is not null
       and length(trim(ru.auto_action_type)) > 0
       and e.order_id is not null
       and v_now >= e.first_triggered_at + (ru.auto_action_delay_minutes * interval '1 minute')
       and e.escalation_count >= ru.auto_action_min_escalation_count
       and not exists (
         select 1
           from public.delivery_operation_alert_actions a
          where a.event_id = e.id
            and a.action_type = ru.auto_action_type
            and a.action_status = 'success'
       )
       and (
         e.last_auto_action_tick_at is null
         or v_now >= e.last_auto_action_tick_at + interval '2 minutes'
       )
       and not (
         ru.auto_action_type = 'auto_hold_settlement'
         and not exists (
           select 1 from public.store_orders so
            where so.id = e.order_id and so.order_status = 'refund_requested'
         )
       )
       and not (
         ru.auto_action_type = 'auto_flag_order'
         and exists (
           select 1 from public.store_orders so
            where so.id = e.order_id and coalesce(so.admin_flagged, false)
         )
       )
       and not (
         ru.auto_action_type = 'auto_mark_attention'
         and exists (
           select 1 from public.store_orders so
            where so.id = e.order_id and coalesce(so.needs_admin_attention, false)
         )
       )
       and not (
         ru.auto_action_type = 'auto_reassign_rider'
         and not exists (
           select 1 from public.store_order_deliveries sod
            where sod.order_id = e.order_id
              and sod.delivery_status = 'waiting_rider'
              and sod.rider_id is not null
         )
       )
       and not (
         ru.auto_action_type = 'auto_escalate'
         and e.escalation_count >= ru.max_escalation_level
       )
       and not (
         ru.auto_action_type = 'auto_assign_admin'
         and e.assigned_admin_id is not null
       )
     order by e.last_triggered_at asc
     limit 150
  loop
    perform pg_advisory_xact_lock(87281401, hashtext(r.event_id::text));

    if exists (
      select 1
        from public.delivery_operation_alert_actions a
       where a.event_id = r.event_id
         and a.action_type = r.aa_type
         and a.action_status = 'success'
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.delivery_operation_alert_events x
       where x.id = r.event_id and x.event_status <> 'open'
    ) then
      continue;
    end if;

    v_ok := false;
    v_prev := 'open';
    v_next := 'open';

    if r.aa_type = 'auto_hold_settlement' then
      if not exists (
        select 1 from public.store_orders so
         where so.id = r.order_id and so.order_status = 'refund_requested'
      ) then
        continue;
      end if;

      update public.store_settlements ss
         set settlement_status = 'held',
             hold_reason = coalesce(
               nullif(trim(ss.hold_reason), ''),
               '[auto_hold_settlement] refund_requested backlog (delivery alert)'
             )
       where ss.order_id = r.order_id
         and ss.settlement_status in ('scheduled', 'processing');

      update public.store_orders so
         set needs_admin_attention = true
       where so.id = r.order_id
         and coalesce(so.needs_admin_attention, false) is distinct from true;

      insert into public.delivery_operation_alert_actions (
        event_id, action_type, action_status, executed_by_system, result_message, metadata
      ) values (
        r.event_id,
        r.aa_type,
        'success',
        true,
        'hold_settlement_or_attention',
        jsonb_build_object('rule_key', r.rule_key, 'order_id', r.order_id)
      );

      perform public.log_delivery_alert_auto_action(
        r.event_id,
        r.aa_type,
        v_prev,
        v_next,
        'auto_hold_settlement',
        jsonb_build_object('rule_key', r.rule_key, 'order_id', r.order_id)
      );

      v_ok := true;

    elsif r.aa_type = 'auto_flag_order' then
      update public.store_orders so
         set admin_flagged = true
       where so.id = r.order_id
         and coalesce(so.admin_flagged, false) is distinct from true;
      get diagnostics v_rows = row_count;
      if v_rows < 1 then
        continue;
      end if;

      insert into public.delivery_operation_alert_actions (
        event_id, action_type, action_status, executed_by_system, result_message, metadata
      ) values (
        r.event_id,
        r.aa_type,
        'success',
        true,
        'admin_flagged',
        jsonb_build_object('order_id', r.order_id)
      );

      perform public.log_delivery_alert_auto_action(
        r.event_id,
        r.aa_type,
        v_prev,
        v_next,
        null,
        jsonb_build_object('order_id', r.order_id)
      );
      v_ok := true;

    elsif r.aa_type = 'auto_mark_attention' then
      update public.store_orders so
         set needs_admin_attention = true
       where so.id = r.order_id
         and coalesce(so.needs_admin_attention, false) is distinct from true;
      get diagnostics v_rows = row_count;
      if v_rows < 1 then
        continue;
      end if;

      insert into public.delivery_operation_alert_actions (
        event_id, action_type, action_status, executed_by_system, result_message, metadata
      ) values (
        r.event_id,
        r.aa_type,
        'success',
        true,
        'needs_admin_attention',
        jsonb_build_object('order_id', r.order_id)
      );

      perform public.log_delivery_alert_auto_action(
        r.event_id,
        r.aa_type,
        v_prev,
        v_next,
        null,
        jsonb_build_object('order_id', r.order_id)
      );
      v_ok := true;

    elsif r.aa_type = 'auto_reassign_rider' then
      update public.store_order_deliveries sod
         set rider_id = null,
             assigned_at = null,
             delivery_status = 'waiting_rider',
             admin_note = left(
               coalesce(sod.admin_note, '')
               || E'\n[auto_reassign_rider] '
               || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               2000
             )
       where sod.order_id = r.order_id
         and sod.delivery_status = 'waiting_rider'
         and sod.rider_id is not null;
      get diagnostics v_rows = row_count;

      if v_rows < 1 then
        continue;
      end if;

      update public.store_orders so
         set needs_admin_attention = true
       where so.id = r.order_id
         and coalesce(so.needs_admin_attention, false) is distinct from true;

      insert into public.delivery_operation_alert_actions (
        event_id, action_type, action_status, executed_by_system, result_message, metadata
      ) values (
        r.event_id,
        r.aa_type,
        'success',
        true,
        'rider_unassigned',
        jsonb_build_object('order_id', r.order_id)
      );

      perform public.log_delivery_alert_auto_action(
        r.event_id,
        r.aa_type,
        v_prev,
        v_next,
        null,
        jsonb_build_object('order_id', r.order_id)
      );
      v_ok := true;

    elsif r.aa_type = 'auto_escalate' then
      update public.delivery_operation_alert_events e
         set escalation_count = e.escalation_count + 1,
             escalated_at = v_now,
             severity = case
               when e.severity = 'info' then 'warning'
               when e.severity = 'warning' then 'critical'
               else e.severity
             end
       where e.id = r.event_id
         and e.event_status = 'open'
         and e.escalation_count < r.ru_max_esc;
      get diagnostics v_rows = row_count;

      if v_rows < 1 then
        continue;
      end if;

      insert into public.delivery_operation_alert_actions (
        event_id, action_type, action_status, executed_by_system, result_message, metadata
      ) values (
        r.event_id,
        r.aa_type,
        'success',
        true,
        'escalation_increment',
        '{}'::jsonb
      );

      perform public.log_delivery_alert_auto_action(
        r.event_id,
        r.aa_type,
        v_prev,
        'open',
        null,
        jsonb_build_object('hint', 'sync may also escalate on timer')
      );
      v_ok := true;

    elsif r.aa_type = 'auto_assign_admin' then
      if v_n < 1 then
        continue;
      end if;

      update public.delivery_alert_auto_assign_rr
         set seq = seq + 1
       where singleton = 1
       returning seq into v_seq;

      if v_seq is null then
        insert into public.delivery_alert_auto_assign_rr (singleton, seq)
        values (1, 0)
        on conflict (singleton) do nothing;
        update public.delivery_alert_auto_assign_rr
           set seq = seq + 1
         where singleton = 1
         returning seq into v_seq;
      end if;

      v_pick := v_admins[(mod(v_seq::bigint, v_n::bigint) + 1)::int];

      update public.delivery_operation_alert_events e
         set assigned_admin_id = v_pick,
             assigned_at = v_now,
             assignment_note = left(
               coalesce(nullif(trim(e.assignment_note), ''), '') || E'\n[auto_assign_admin]',
               1500
             )
       where e.id = r.event_id
         and e.event_status = 'open'
         and e.assigned_admin_id is null;
      get diagnostics v_rows = row_count;

      if v_rows < 1 then
        continue;
      end if;

      insert into public.delivery_operation_alert_actions (
        event_id, action_type, action_status, executed_by_system, result_message, metadata
      ) values (
        r.event_id,
        r.aa_type,
        'success',
        true,
        'assigned',
        jsonb_build_object('assigned_admin_id', v_pick)
      );

      perform public.log_delivery_alert_auto_action(
        r.event_id,
        r.aa_type,
        v_prev,
        'open',
        null,
        jsonb_build_object('assigned_admin_id', v_pick)
      );
      v_ok := true;

    elsif r.aa_type = 'auto_mute' then
      v_next := 'muted';
      update public.delivery_operation_alert_events e
         set event_status = 'muted',
             mute_note = left(
               coalesce(nullif(trim(e.mute_note), ''), '') || E'\n[auto_mute]',
               1500
             )
       where e.id = r.event_id
         and e.event_status = 'open';
      get diagnostics v_rows = row_count;

      if v_rows < 1 then
        continue;
      end if;

      insert into public.delivery_operation_alert_actions (
        event_id, action_type, action_status, executed_by_system, result_message, metadata
      ) values (
        r.event_id,
        r.aa_type,
        'success',
        true,
        'muted',
        '{}'::jsonb
      );

      perform public.log_delivery_alert_auto_action(
        r.event_id,
        r.aa_type,
        v_prev,
        v_next,
        null,
        '{}'::jsonb
      );
      v_ok := true;

    else
      insert into public.delivery_operation_alert_actions (
        event_id, action_type, action_status, executed_by_system, result_message, metadata
      ) values (
        r.event_id,
        coalesce(r.aa_type, 'unknown'),
        'failed',
        true,
        'unknown_auto_action_type',
        '{}'::jsonb
      );
    end if;

    if v_ok then
      update public.delivery_operation_alert_events e
         set last_auto_action_tick_at = v_now
       where e.id = r.event_id;
    end if;

  end loop;

end;
$$;

revoke all on function public.run_delivery_operation_alert_auto_actions() from public;
grant execute on function public.run_delivery_operation_alert_auto_actions() to service_role;

-- ─── pg_cron: 동기화 후 자동 액션 (폭주 완화는 룰·성공 유니크·tick 간격으로 처리)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'sync_delivery_operation_alert_events';

    perform cron.schedule(
      'sync_delivery_operation_alert_events',
      '*/2 * * * *',
      $cron$
        select public.sync_delivery_operation_alert_events();
        select public.run_delivery_operation_alert_auto_actions();
      $cron$
    );
    raise notice 'delivery_alerts: cron updated — sync + auto_actions';
  else
    raise notice 'delivery_alerts: pg_cron not found — cron unchanged';
  end if;
exception
  when undefined_table then
    raise notice 'delivery_alerts: cron tables not available — cron unchanged';
  when undefined_function then
    raise notice 'delivery_alerts: cron.schedule not available — cron unchanged';
end $$;
