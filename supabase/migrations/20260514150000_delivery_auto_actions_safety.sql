-- Step 14: 자동 액션 kill switch · 승인 모드 · 모니터링 지원
-- - 주문 상태 머신·알림 생성/중복 로직 변경 없음 (실행 경로만 분기)

-- ─── 전역 kill switch (기본 false = 크론에서 자동 실행 안 함) ───────────────
create table if not exists public.delivery_auto_actions_runtime_settings (
  singleton smallint primary key default 1 check (singleton = 1),
  delivery_auto_actions_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.delivery_auto_actions_runtime_settings (singleton, delivery_auto_actions_enabled)
values (1, false)
on conflict (singleton) do nothing;

drop trigger if exists trg_delivery_auto_actions_runtime_settings_updated_at
  on public.delivery_auto_actions_runtime_settings;
create trigger trg_delivery_auto_actions_runtime_settings_updated_at
before update on public.delivery_auto_actions_runtime_settings
for each row execute function public.set_updated_at();

alter table public.delivery_auto_actions_runtime_settings enable row level security;

drop policy if exists delivery_auto_actions_runtime_settings_admin_all
  on public.delivery_auto_actions_runtime_settings;
create policy delivery_auto_actions_runtime_settings_admin_all
  on public.delivery_auto_actions_runtime_settings
  for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- ─── 룰: 승인 필요 ───────────────────────────────────────────────────────────
alter table public.delivery_operation_alert_rules
  add column if not exists auto_action_requires_approval boolean not null default true;

update public.delivery_operation_alert_rules ru
   set auto_action_requires_approval = false
 where ru.auto_action_enabled = true
   and ru.auto_action_type is not null
   and length(trim(ru.auto_action_type)) > 0
   and trim(ru.auto_action_type) not in ('auto_hold_settlement', 'auto_reassign_rider', 'auto_mute');

-- ─── 액션 행: 승인·재시도 ─────────────────────────────────────────────────────
alter table public.delivery_operation_alert_actions
  add column if not exists approval_actor_id uuid references public.profiles(id) on delete set null;

alter table public.delivery_operation_alert_actions
  add column if not exists approval_note text;

alter table public.delivery_operation_alert_actions
  add column if not exists decided_at timestamptz;

alter table public.delivery_operation_alert_actions
  add column if not exists retry_count integer not null default 0;

alter table public.delivery_operation_alert_actions
  add column if not exists max_retries integer not null default 3;

alter table public.delivery_operation_alert_actions
  drop constraint if exists delivery_operation_alert_actions_action_status_check;

alter table public.delivery_operation_alert_actions
  add constraint delivery_operation_alert_actions_action_status_check
    check (
      action_status in (
        'success',
        'failed',
        'skipped',
        'pending_approval',
        'rejected'
      )
    );

create unique index if not exists delivery_operation_alert_actions_event_type_pending_uidx
  on public.delivery_operation_alert_actions (event_id, action_type)
  where action_status = 'pending_approval';

-- ─── 감사 로그 헬퍼 (승인자 선택) ─────────────────────────────────────────────
drop function if exists public.log_delivery_alert_auto_action(uuid, text, text, text, text, jsonb);

create or replace function public.log_delivery_alert_auto_action(
  p_event_id uuid,
  p_subtype text,
  p_prev_status text,
  p_next_status text,
  p_note text,
  p_metadata jsonb,
  p_actor uuid default null
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
    p_actor,
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

revoke all on function public.log_delivery_alert_auto_action(uuid, text, text, text, text, jsonb, uuid) from public;

-- ─── 단일 효과 적용 (성공/무시/실패 코드만 반환 — 행 INSERT 안 함) ───────────
create or replace function public.delivery_alert_apply_auto_action_effect(
  p_event_id uuid,
  p_order_id uuid,
  p_aa_type text,
  p_rule_key text,
  p_ru_max_esc integer,
  p_now timestamptz,
  p_admins uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
  v_n int;
  v_seq bigint;
  v_pick uuid;
  v_prev text := 'open';
  v_next text := 'open';
begin
  v_n := coalesce(array_length(p_admins, 1), 0);

  if p_aa_type = 'auto_hold_settlement' then
    if not exists (
      select 1 from public.store_orders so
       where so.id = p_order_id and so.order_status = 'refund_requested'
    ) then
      return jsonb_build_object('result', 'noop', 'result_message', 'not_refund_requested');
    end if;

    update public.store_settlements ss
       set settlement_status = 'held',
           hold_reason = coalesce(
             nullif(trim(ss.hold_reason), ''),
             '[auto_hold_settlement] refund_requested backlog (delivery alert)'
           )
     where ss.order_id = p_order_id
       and ss.settlement_status in ('scheduled', 'processing');

    update public.store_orders so
       set needs_admin_attention = true
     where so.id = p_order_id
       and coalesce(so.needs_admin_attention, false) is distinct from true;

    return jsonb_build_object(
      'result', 'success',
      'result_message', 'hold_settlement_or_attention',
      'prev_status', v_prev,
      'next_status', v_next,
      'rule_key', p_rule_key,
      'order_id', p_order_id
    );

  elsif p_aa_type = 'auto_flag_order' then
    update public.store_orders so
       set admin_flagged = true
     where so.id = p_order_id
       and coalesce(so.admin_flagged, false) is distinct from true;
    get diagnostics v_rows = row_count;
    if v_rows < 1 then
      return jsonb_build_object('result', 'noop', 'result_message', 'already_flagged');
    end if;
    return jsonb_build_object(
      'result', 'success',
      'result_message', 'admin_flagged',
      'prev_status', v_prev,
      'next_status', v_next,
      'order_id', p_order_id
    );

  elsif p_aa_type = 'auto_mark_attention' then
    update public.store_orders so
       set needs_admin_attention = true
     where so.id = p_order_id
       and coalesce(so.needs_admin_attention, false) is distinct from true;
    get diagnostics v_rows = row_count;
    if v_rows < 1 then
      return jsonb_build_object('result', 'noop', 'result_message', 'already_attention');
    end if;
    return jsonb_build_object(
      'result', 'success',
      'result_message', 'needs_admin_attention',
      'prev_status', v_prev,
      'next_status', v_next,
      'order_id', p_order_id
    );

  elsif p_aa_type = 'auto_reassign_rider' then
    update public.store_order_deliveries sod
       set rider_id = null,
           assigned_at = null,
           delivery_status = 'waiting_rider',
           admin_note = left(
             coalesce(sod.admin_note, '')
             || E'\n[auto_reassign_rider] '
             || to_char(p_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             2000
           )
     where sod.order_id = p_order_id
       and sod.delivery_status = 'waiting_rider'
       and sod.rider_id is not null;
    get diagnostics v_rows = row_count;
    if v_rows < 1 then
      return jsonb_build_object('result', 'noop', 'result_message', 'no_rider_to_clear');
    end if;
    update public.store_orders so
       set needs_admin_attention = true
     where so.id = p_order_id
       and coalesce(so.needs_admin_attention, false) is distinct from true;
    return jsonb_build_object(
      'result', 'success',
      'result_message', 'rider_unassigned',
      'prev_status', v_prev,
      'next_status', v_next,
      'order_id', p_order_id
    );

  elsif p_aa_type = 'auto_escalate' then
    update public.delivery_operation_alert_events e
       set escalation_count = e.escalation_count + 1,
           escalated_at = p_now,
           severity = case
             when e.severity = 'info' then 'warning'
             when e.severity = 'warning' then 'critical'
             else e.severity
           end
     where e.id = p_event_id
       and e.event_status = 'open'
       and e.escalation_count < p_ru_max_esc;
    get diagnostics v_rows = row_count;
    if v_rows < 1 then
      return jsonb_build_object('result', 'noop', 'result_message', 'escalate_skip');
    end if;
    return jsonb_build_object(
      'result', 'success',
      'result_message', 'escalation_increment',
      'prev_status', v_prev,
      'next_status', 'open'
    );

  elsif p_aa_type = 'auto_assign_admin' then
    if v_n < 1 then
      return jsonb_build_object('result', 'failed', 'result_message', 'no_platform_admin_profiles');
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

    v_pick := p_admins[(mod(v_seq::bigint, v_n::bigint) + 1)::int];

    update public.delivery_operation_alert_events e
       set assigned_admin_id = v_pick,
           assigned_at = p_now,
           assignment_note = left(
             coalesce(nullif(trim(e.assignment_note), ''), '') || E'\n[auto_assign_admin]',
             1500
           )
     where e.id = p_event_id
       and e.event_status = 'open'
       and e.assigned_admin_id is null;
    get diagnostics v_rows = row_count;
    if v_rows < 1 then
      return jsonb_build_object('result', 'noop', 'result_message', 'already_assigned');
    end if;
    return jsonb_build_object(
      'result', 'success',
      'result_message', 'assigned',
      'prev_status', v_prev,
      'next_status', 'open',
      'assigned_admin_id', v_pick
    );

  elsif p_aa_type = 'auto_mute' then
    v_next := 'muted';
    update public.delivery_operation_alert_events e
       set event_status = 'muted',
           mute_note = left(
             coalesce(nullif(trim(e.mute_note), ''), '') || E'\n[auto_mute]',
             1500
           )
     where e.id = p_event_id
       and e.event_status = 'open';
    get diagnostics v_rows = row_count;
    if v_rows < 1 then
      return jsonb_build_object('result', 'noop', 'result_message', 'mute_skip');
    end if;
    return jsonb_build_object(
      'result', 'success',
      'result_message', 'muted',
      'prev_status', v_prev,
      'next_status', v_next
    );

  end if;

  return jsonb_build_object('result', 'failed', 'result_message', 'unknown_auto_action_type');
end;
$$;

revoke all on function public.delivery_alert_apply_auto_action_effect(
  uuid, uuid, text, text, integer, timestamptz, uuid[]
) from public;

-- ─── 크론 러너 (kill switch · 승인 대기 큐 · 조건 동일) ───────────────────────
create or replace function public.run_delivery_operation_alert_auto_actions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_kill boolean := false;
  r record;
  v_admins uuid[];
  v_n int;
  v_out jsonb;
  v_ok boolean := false;
begin
  select coalesce(s.delivery_auto_actions_enabled, false)
    into v_kill
    from public.delivery_auto_actions_runtime_settings s
   where s.singleton = 1;

  if not coalesce(v_kill, false) then
    return;
  end if;

  select coalesce(array_agg(p.id order by p.id), array[]::uuid[])
    into v_admins
    from public.profiles p
   where p.role in ('admin', 'super_admin');

  v_n := coalesce(array_length(v_admins, 1), 0);

  for r in
    select
      e.id as event_id,
      e.order_id,
      e.event_status,
      e.escalation_count,
      e.first_triggered_at,
      e.assigned_admin_id,
      ru.rule_key,
      ru.auto_action_type as aa_type,
      ru.auto_action_delay_minutes as aa_delay,
      ru.auto_action_min_escalation_count as aa_min_esc,
      ru.max_escalation_level as ru_max_esc,
      ru.auto_action_requires_approval as req_appr
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
            and a.action_status in (
              'success',
              'pending_approval',
              'rejected',
              'failed'
            )
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
      select 1 from public.delivery_operation_alert_events x
       where x.id = r.event_id and x.event_status <> 'open'
    ) then
      continue;
    end if;

    if exists (
      select 1
        from public.delivery_operation_alert_actions a
       where a.event_id = r.event_id
         and a.action_type = r.aa_type
         and a.action_status in ('success','pending_approval','rejected','failed')
    ) then
      continue;
    end if;

    v_ok := false;

    if coalesce(r.req_appr, true) then
      insert into public.delivery_operation_alert_actions (
        event_id,
        action_type,
        action_status,
        executed_by_system,
        result_message,
        metadata
      ) values (
        r.event_id,
        r.aa_type,
        'pending_approval',
        true,
        'awaiting_approval',
        jsonb_build_object('rule_key', r.rule_key, 'order_id', r.order_id)
      );
      update public.delivery_operation_alert_events e
         set last_auto_action_tick_at = v_now
       where e.id = r.event_id;
      continue;
    end if;

    v_out := public.delivery_alert_apply_auto_action_effect(
      r.event_id,
      r.order_id,
      r.aa_type,
      r.rule_key,
      r.ru_max_esc,
      v_now,
      v_admins
    );

    if (v_out->>'result') = 'success' then
      insert into public.delivery_operation_alert_actions (
        event_id,
        action_type,
        action_status,
        executed_by_system,
        result_message,
        metadata
      ) values (
        r.event_id,
        r.aa_type,
        'success',
        true,
        coalesce(v_out->>'result_message', 'ok'),
        v_out
      );
      perform public.log_delivery_alert_auto_action(
        r.event_id,
        r.aa_type,
        coalesce(v_out->>'prev_status', 'open'),
        coalesce(v_out->>'next_status', 'open'),
        null,
        v_out,
        null
      );
      v_ok := true;
    elsif (v_out->>'result') = 'failed' then
      insert into public.delivery_operation_alert_actions (
        event_id,
        action_type,
        action_status,
        executed_by_system,
        result_message,
        metadata
      ) values (
        r.event_id,
        r.aa_type,
        'failed',
        true,
        coalesce(v_out->>'result_message', 'failed'),
        v_out
      );
      v_ok := true;
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

-- ─── 승인 ───────────────────────────────────────────────────────────────────
create or replace function public.approve_delivery_alert_auto_action(
  p_action_id uuid,
  p_actor uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kill boolean := false;
  v_row public.delivery_operation_alert_actions%rowtype;
  v_ev public.delivery_operation_alert_events%rowtype;
  v_ru public.delivery_operation_alert_rules%rowtype;
  v_admins uuid[];
  v_out jsonb;
begin
  select coalesce(s.delivery_auto_actions_enabled, false)
    into v_kill
    from public.delivery_auto_actions_runtime_settings s
   where s.singleton = 1;

  if not coalesce(v_kill, false) then
    return jsonb_build_object('error', 'kill_switch_off');
  end if;

  select * into v_row
    from public.delivery_operation_alert_actions
   where id = p_action_id
   for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_row.action_status is distinct from 'pending_approval' then
    return jsonb_build_object('error', 'not_pending', 'status', v_row.action_status);
  end if;

  select * into v_ev from public.delivery_operation_alert_events where id = v_row.event_id;
  if not found then
    return jsonb_build_object('error', 'event_missing');
  end if;

  if v_ev.event_status is distinct from 'open' then
    update public.delivery_operation_alert_actions a
       set action_status = 'rejected',
           result_message = 'event_not_open_on_approve',
           approval_actor_id = p_actor,
           approval_note = coalesce(nullif(trim(p_note), ''), null),
           decided_at = now(),
           executed_at = now(),
           executed_by_system = false
     where a.id = p_action_id;
    return jsonb_build_object('error', 'event_not_open');
  end if;

  select * into v_ru from public.delivery_operation_alert_rules where id = v_ev.rule_id;

  select coalesce(array_agg(p.id order by p.id), array[]::uuid[])
    into v_admins
    from public.profiles p
   where p.role in ('admin', 'super_admin');

  v_out := public.delivery_alert_apply_auto_action_effect(
    v_row.event_id,
    v_ev.order_id,
    v_row.action_type,
    v_ru.rule_key,
    v_ru.max_escalation_level,
    now(),
    v_admins
  );

  if (v_out->>'result') = 'success' then
    update public.delivery_operation_alert_actions a
       set action_status = 'success',
           executed_at = now(),
           executed_by_system = false,
           result_message = coalesce(v_out->>'result_message', 'ok'),
           metadata = coalesce(a.metadata, '{}'::jsonb) || v_out,
           approval_actor_id = p_actor,
           approval_note = coalesce(nullif(trim(p_note), ''), null),
           decided_at = now()
     where a.id = p_action_id;

    perform public.log_delivery_alert_auto_action(
      v_row.event_id,
      v_row.action_type,
      coalesce(v_out->>'prev_status', 'open'),
      coalesce(v_out->>'next_status', 'open'),
      null,
      v_out,
      p_actor
    );

    update public.delivery_operation_alert_events e
       set last_auto_action_tick_at = now()
     where e.id = v_row.event_id;

    return jsonb_build_object('ok', true);
  elsif (v_out->>'result') = 'noop' then
    update public.delivery_operation_alert_actions a
       set action_status = 'failed',
           executed_at = now(),
           executed_by_system = false,
           result_message = coalesce(v_out->>'result_message', 'noop_at_approve'),
           metadata = coalesce(a.metadata, '{}'::jsonb) || v_out,
           approval_actor_id = p_actor,
           approval_note = coalesce(nullif(trim(p_note), ''), null),
           decided_at = now()
     where a.id = p_action_id;
    return jsonb_build_object('ok', false, 'reason', 'noop');
  else
    update public.delivery_operation_alert_actions a
       set action_status = 'failed',
           executed_at = now(),
           executed_by_system = false,
           result_message = coalesce(v_out->>'result_message', 'effect_failed'),
           metadata = coalesce(a.metadata, '{}'::jsonb) || v_out,
           approval_actor_id = p_actor,
           approval_note = coalesce(nullif(trim(p_note), ''), null),
           decided_at = now()
     where a.id = p_action_id;
    return jsonb_build_object('ok', false, 'reason', coalesce(v_out->>'result_message', 'failed'));
  end if;
end;
$$;

revoke all on function public.approve_delivery_alert_auto_action(uuid, uuid, text) from public;
grant execute on function public.approve_delivery_alert_auto_action(uuid, uuid, text) to service_role;

-- ─── 거절 (kill switch 무관) ────────────────────────────────────────────────
create or replace function public.reject_delivery_alert_auto_action(
  p_action_id uuid,
  p_actor uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.delivery_operation_alert_actions%rowtype;
begin
  select * into v_row
    from public.delivery_operation_alert_actions
   where id = p_action_id
   for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_row.action_status is distinct from 'pending_approval' then
    return jsonb_build_object('error', 'not_pending', 'status', v_row.action_status);
  end if;

  update public.delivery_operation_alert_actions a
     set action_status = 'rejected',
         executed_at = now(),
         executed_by_system = false,
         result_message = 'rejected_by_admin',
         approval_actor_id = p_actor,
         approval_note = coalesce(nullif(trim(p_note), ''), null),
         decided_at = now()
   where a.id = p_action_id;

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
  ) values (
    v_row.event_id,
    'auto_action',
    p_actor,
    'open',
    'open',
    null,
    null,
    coalesce(nullif(trim(p_note), ''), 'rejected'),
    jsonb_build_object('auto_action_type', v_row.action_type, 'approval', 'rejected')
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.reject_delivery_alert_auto_action(uuid, uuid, text) from public;
grant execute on function public.reject_delivery_alert_auto_action(uuid, uuid, text) to service_role;

-- ─── 재시도 (실패 행) ─────────────────────────────────────────────────────────
create or replace function public.retry_delivery_alert_auto_action(
  p_action_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.delivery_operation_alert_actions%rowtype;
  v_ev public.delivery_operation_alert_events%rowtype;
  v_ru public.delivery_operation_alert_rules%rowtype;
  v_kill boolean := false;
  v_admins uuid[];
  v_out jsonb;
begin
  select * into v_row
    from public.delivery_operation_alert_actions
   where id = p_action_id
   for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  if v_row.action_status is distinct from 'failed' then
    return jsonb_build_object('error', 'not_failed', 'status', v_row.action_status);
  end if;

  if coalesce(v_row.retry_count, 0) >= coalesce(v_row.max_retries, 3) then
    return jsonb_build_object('error', 'max_retries');
  end if;

  select * into v_ev from public.delivery_operation_alert_events where id = v_row.event_id;
  select * into v_ru from public.delivery_operation_alert_rules where id = v_ev.rule_id;

  if coalesce(v_ru.auto_action_requires_approval, true) then
    update public.delivery_operation_alert_actions a
       set action_status = 'pending_approval',
           retry_count = coalesce(a.retry_count, 0) + 1,
           executed_at = now(),
           result_message = 'retry_queued_pending',
           approval_actor_id = p_actor,
           decided_at = null,
           approval_note = null
     where a.id = p_action_id;
    return jsonb_build_object('ok', true, 'queued', true);
  end if;

  select coalesce(s.delivery_auto_actions_enabled, false)
    into v_kill
    from public.delivery_auto_actions_runtime_settings s
   where s.singleton = 1;

  if not coalesce(v_kill, false) then
    return jsonb_build_object('error', 'kill_switch_off');
  end if;

  if v_ev.event_status is distinct from 'open' then
    return jsonb_build_object('error', 'event_not_open');
  end if;

  select coalesce(array_agg(p.id order by p.id), array[]::uuid[])
    into v_admins
    from public.profiles p
   where p.role in ('admin', 'super_admin');

  v_out := public.delivery_alert_apply_auto_action_effect(
    v_row.event_id,
    v_ev.order_id,
    v_row.action_type,
    v_ru.rule_key,
    v_ru.max_escalation_level,
    now(),
    v_admins
  );

  if (v_out->>'result') = 'success' then
    update public.delivery_operation_alert_actions a
       set action_status = 'success',
           executed_at = now(),
           executed_by_system = false,
           retry_count = coalesce(a.retry_count, 0) + 1,
           result_message = coalesce(v_out->>'result_message', 'ok'),
           metadata = coalesce(a.metadata, '{}'::jsonb) || v_out,
           approval_actor_id = p_actor,
           decided_at = now(),
           approval_note = 'retry_direct_ok'
     where a.id = p_action_id;

    perform public.log_delivery_alert_auto_action(
      v_row.event_id,
      v_row.action_type,
      coalesce(v_out->>'prev_status', 'open'),
      coalesce(v_out->>'next_status', 'open'),
      null,
      v_out,
      p_actor
    );

    update public.delivery_operation_alert_events e
       set last_auto_action_tick_at = now()
     where e.id = v_row.event_id;

    return jsonb_build_object('ok', true);
  elsif (v_out->>'result') = 'noop' then
    update public.delivery_operation_alert_actions a
       set retry_count = coalesce(a.retry_count, 0) + 1,
           result_message = coalesce(v_out->>'result_message', 'noop_on_retry'),
           metadata = coalesce(a.metadata, '{}'::jsonb) || v_out,
           approval_actor_id = p_actor,
           decided_at = now()
     where a.id = p_action_id;
    return jsonb_build_object('ok', false, 'reason', 'noop');
  else
    update public.delivery_operation_alert_actions a
       set retry_count = coalesce(a.retry_count, 0) + 1,
           result_message = coalesce(v_out->>'result_message', 'retry_failed'),
           metadata = coalesce(a.metadata, '{}'::jsonb) || v_out,
           approval_actor_id = p_actor,
           decided_at = now()
     where a.id = p_action_id;
    return jsonb_build_object('ok', false, 'reason', coalesce(v_out->>'result_message', 'failed'));
  end if;
end;
$$;

revoke all on function public.retry_delivery_alert_auto_action(uuid, uuid) from public;
grant execute on function public.retry_delivery_alert_auto_action(uuid, uuid) to service_role;
