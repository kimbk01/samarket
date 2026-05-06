-- 배달 운영 알림: 담당자 배정·처리 메모·에스컬레이션 (v2)
-- - scan_store_order_sla_warnings / open 중복 유니크 불변
-- - sync_delivery_operation_alert_events 본문 교체 (동일 시그니처)

-- ─── Rules 컬럼 ────────────────────────────────────────────────────────────
alter table public.delivery_operation_alert_rules
  add column if not exists escalate_after_minutes integer;

alter table public.delivery_operation_alert_rules
  add column if not exists max_escalation_level integer;

update public.delivery_operation_alert_rules
   set escalate_after_minutes = coalesce(escalate_after_minutes, 30),
       max_escalation_level = coalesce(max_escalation_level, 3)
 where escalate_after_minutes is null
    or max_escalation_level is null;

alter table public.delivery_operation_alert_rules
  alter column escalate_after_minutes set default 30;

alter table public.delivery_operation_alert_rules
  alter column max_escalation_level set default 3;

alter table public.delivery_operation_alert_rules
  alter column escalate_after_minutes set not null;

alter table public.delivery_operation_alert_rules
  alter column max_escalation_level set not null;

alter table public.delivery_operation_alert_rules
  drop constraint if exists delivery_operation_alert_rules_escalate_after_chk;
alter table public.delivery_operation_alert_rules
  add constraint delivery_operation_alert_rules_escalate_after_chk
    check (escalate_after_minutes > 0);

alter table public.delivery_operation_alert_rules
  drop constraint if exists delivery_operation_alert_rules_max_esc_chk;
alter table public.delivery_operation_alert_rules
  add constraint delivery_operation_alert_rules_max_esc_chk
    check (max_escalation_level >= 1);

-- ─── Events 컬럼 ───────────────────────────────────────────────────────────
alter table public.delivery_operation_alert_events
  add column if not exists assigned_admin_id uuid references public.profiles(id) on delete set null;

alter table public.delivery_operation_alert_events
  add column if not exists assigned_at timestamptz;

alter table public.delivery_operation_alert_events
  add column if not exists assignment_note text;

alter table public.delivery_operation_alert_events
  add column if not exists escalation_count integer not null default 0;

alter table public.delivery_operation_alert_events
  add column if not exists escalated_at timestamptz;

alter table public.delivery_operation_alert_events
  add column if not exists handling_note text;

alter table public.delivery_operation_alert_events
  add column if not exists acknowledge_note text;

alter table public.delivery_operation_alert_events
  add column if not exists resolve_note text;

alter table public.delivery_operation_alert_events
  add column if not exists mute_note text;

alter table public.delivery_operation_alert_events
  add column if not exists repeat_fire_count integer not null default 0;

create index if not exists delivery_operation_alert_events_assigned_idx
  on public.delivery_operation_alert_events (assigned_admin_id, event_status, last_triggered_at desc);

create index if not exists delivery_operation_alert_events_escalation_idx
  on public.delivery_operation_alert_events (event_status, escalation_count, escalated_at desc);

-- ─── Sync (교체): 재알림 시 repeat_fire_count, 에스컬레이션, 자동 해소 ─────
create or replace function public.sync_delivery_operation_alert_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  r record;
begin
  -- 1) 터미널 주문 → 해당 주문 알림 해소 (muted 포함)
  update public.delivery_operation_alert_events e
  set
    event_status = 'resolved',
    resolved_at = v_now,
    resolved_by = null
  from public.store_orders so
  where e.order_id = so.id
    and e.event_status in ('open', 'acknowledged', 'muted')
    and e.resolved_at is null
    and so.order_status in ('completed', 'cancelled', 'refunded');

  -- 2) 룰별 조건 해소 (조건이 더 이상 아니면 resolved)
  update public.delivery_operation_alert_events e
  set event_status = 'resolved', resolved_at = v_now, resolved_by = null
  from public.delivery_operation_alert_rules ru
  join public.store_orders so on so.id = e.order_id
  where e.rule_id = ru.id
    and ru.rule_key = 'pending_overdue'
    and e.event_status in ('open', 'acknowledged', 'muted')
    and e.resolved_at is null
    and (
      so.order_status <> 'pending'
      or so.created_at >= v_now - (ru.threshold_minutes * interval '1 minute')
    );

  update public.delivery_operation_alert_events e
  set event_status = 'resolved', resolved_at = v_now, resolved_by = null
  from public.delivery_operation_alert_rules ru
  join public.store_orders so on so.id = e.order_id
  where e.rule_id = ru.id
    and ru.rule_key = 'eta_overdue'
    and e.event_status in ('open', 'acknowledged', 'muted')
    and e.resolved_at is null
    and (
      so.estimated_ready_at is null
      or so.estimated_ready_at + (ru.threshold_minutes * interval '1 minute') >= v_now
      or so.order_status not in ('accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived')
    );

  update public.delivery_operation_alert_events e
  set event_status = 'resolved', resolved_at = v_now, resolved_by = null
  from public.delivery_operation_alert_rules ru
  join public.store_orders so on so.id = e.order_id
  left join public.store_order_deliveries sod on sod.order_id = so.id
  where e.rule_id = ru.id
    and ru.rule_key = 'waiting_rider_overdue'
    and e.event_status in ('open', 'acknowledged', 'muted')
    and e.resolved_at is null
    and (
      coalesce(sod.delivery_status, '') <> 'waiting_rider'
      or coalesce(sod.updated_at, so.updated_at, so.created_at) >= v_now - (ru.threshold_minutes * interval '1 minute')
    );

  update public.delivery_operation_alert_events e
  set event_status = 'resolved', resolved_at = v_now, resolved_by = null
  from public.delivery_operation_alert_rules ru
  join public.store_orders so on so.id = e.order_id
  where e.rule_id = ru.id
    and ru.rule_key = 'delivering_overdue'
    and e.event_status in ('open', 'acknowledged', 'muted')
    and e.resolved_at is null
    and (
      so.order_status <> 'delivering'
      or so.updated_at >= v_now - (ru.threshold_minutes * interval '1 minute')
    );

  update public.delivery_operation_alert_events e
  set event_status = 'resolved', resolved_at = v_now, resolved_by = null
  from public.delivery_operation_alert_rules ru
  join public.store_orders so on so.id = e.order_id
  where e.rule_id = ru.id
    and ru.rule_key = 'refund_requested_overdue'
    and e.event_status in ('open', 'acknowledged', 'muted')
    and e.resolved_at is null
    and (
      so.order_status <> 'refund_requested'
      or so.updated_at >= v_now - (ru.threshold_minutes * interval '1 minute')
    );

  update public.delivery_operation_alert_events e
  set event_status = 'resolved', resolved_at = v_now, resolved_by = null
  from public.delivery_operation_alert_rules ru
  where e.rule_id = ru.id
    and ru.rule_key = 'held_settlement_overdue'
    and e.event_status in ('open', 'acknowledged', 'muted')
    and e.resolved_at is null
    and e.order_id is not null
    and not exists (
      select 1
        from public.store_settlements ss
       where ss.order_id = e.order_id
         and ss.settlement_status = 'held'
         and ss.created_at < v_now - (ru.threshold_minutes * interval '1 minute')
    );

  -- 3) 신규 open 이벤트
  for r in
    select *
      from public.delivery_operation_alert_rules
     where is_active
     order by rule_key
  loop
    if r.rule_key = 'pending_overdue' then
      insert into public.delivery_operation_alert_events
        (rule_id, order_id, store_id, severity, event_status, first_triggered_at, last_triggered_at)
      select
        r.id,
        so.id,
        so.store_id,
        r.warning_level,
        'open',
        v_now,
        v_now
      from public.store_orders so
      where so.order_status = 'pending'
        and so.created_at < v_now - (r.threshold_minutes * interval '1 minute')
        and so.order_status not in ('completed', 'cancelled', 'refunded')
        and (
          so.created_at > v_now - interval '14 days'
          or so.updated_at > v_now - interval '14 days'
        )
        and not exists (
          select 1 from public.delivery_operation_alert_events ex
           where ex.rule_id = r.id and ex.order_id = so.id and ex.event_status = 'open'
        );
    elsif r.rule_key = 'eta_overdue' then
      insert into public.delivery_operation_alert_events
        (rule_id, order_id, store_id, severity, event_status, first_triggered_at, last_triggered_at)
      select
        r.id,
        so.id,
        so.store_id,
        r.warning_level,
        'open',
        v_now,
        v_now
      from public.store_orders so
      where so.estimated_ready_at is not null
        and so.estimated_ready_at + (r.threshold_minutes * interval '1 minute') < v_now
        and so.order_status in ('accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived')
        and (
          so.created_at > v_now - interval '14 days'
          or so.updated_at > v_now - interval '14 days'
          or so.estimated_ready_at is not null
        )
        and not exists (
          select 1 from public.delivery_operation_alert_events ex
           where ex.rule_id = r.id and ex.order_id = so.id and ex.event_status = 'open'
        );
    elsif r.rule_key = 'waiting_rider_overdue' then
      insert into public.delivery_operation_alert_events
        (rule_id, order_id, store_id, severity, event_status, first_triggered_at, last_triggered_at)
      select
        r.id,
        so.id,
        so.store_id,
        r.warning_level,
        'open',
        v_now,
        v_now
      from public.store_orders so
      join public.store_order_deliveries sod on sod.order_id = so.id
      where sod.delivery_status = 'waiting_rider'
        and coalesce(sod.updated_at, so.updated_at, so.created_at) < v_now - (r.threshold_minutes * interval '1 minute')
        and so.order_status not in ('completed', 'cancelled', 'refunded')
        and (
          so.created_at > v_now - interval '14 days'
          or so.updated_at > v_now - interval '14 days'
        )
        and not exists (
          select 1 from public.delivery_operation_alert_events ex
           where ex.rule_id = r.id and ex.order_id = so.id and ex.event_status = 'open'
        );
    elsif r.rule_key = 'delivering_overdue' then
      insert into public.delivery_operation_alert_events
        (rule_id, order_id, store_id, severity, event_status, first_triggered_at, last_triggered_at)
      select
        r.id,
        so.id,
        so.store_id,
        r.warning_level,
        'open',
        v_now,
        v_now
      from public.store_orders so
      where so.order_status = 'delivering'
        and so.updated_at < v_now - (r.threshold_minutes * interval '1 minute')
        and (
          so.created_at > v_now - interval '14 days'
          or so.updated_at > v_now - interval '14 days'
        )
        and not exists (
          select 1 from public.delivery_operation_alert_events ex
           where ex.rule_id = r.id and ex.order_id = so.id and ex.event_status = 'open'
        );
    elsif r.rule_key = 'refund_requested_overdue' then
      insert into public.delivery_operation_alert_events
        (rule_id, order_id, store_id, severity, event_status, first_triggered_at, last_triggered_at)
      select
        r.id,
        so.id,
        so.store_id,
        r.warning_level,
        'open',
        v_now,
        v_now
      from public.store_orders so
      where so.order_status = 'refund_requested'
        and so.updated_at < v_now - (r.threshold_minutes * interval '1 minute')
        and (
          so.created_at > v_now - interval '14 days'
          or so.updated_at > v_now - interval '14 days'
        )
        and not exists (
          select 1 from public.delivery_operation_alert_events ex
           where ex.rule_id = r.id and ex.order_id = so.id and ex.event_status = 'open'
        );
    elsif r.rule_key = 'held_settlement_overdue' then
      insert into public.delivery_operation_alert_events
        (rule_id, order_id, store_id, severity, event_status, first_triggered_at, last_triggered_at)
      select
        r.id,
        ss.order_id,
        ss.store_id,
        r.warning_level,
        'open',
        v_now,
        v_now
      from public.store_settlements ss
      where ss.settlement_status = 'held'
        and ss.order_id is not null
        and ss.created_at < v_now - (r.threshold_minutes * interval '1 minute')
        and ss.created_at > v_now - interval '60 days'
        and not exists (
          select 1 from public.delivery_operation_alert_events ex
           where ex.rule_id = r.id and ex.order_id = ss.order_id and ex.event_status = 'open'
        );
    end if;
  end loop;

  -- 4) 재알림: open 만 last_triggered_at + repeat_fire_count 증가
  for r in select * from public.delivery_operation_alert_rules where is_active loop
    if r.rule_key = 'pending_overdue' then
      update public.delivery_operation_alert_events e
      set last_triggered_at = v_now,
          repeat_fire_count = coalesce(e.repeat_fire_count, 0) + 1
      from public.store_orders so
      where e.rule_id = r.id
        and e.order_id = so.id
        and e.event_status = 'open'
        and e.resolved_at is null
        and v_now >= e.last_triggered_at + (r.repeat_minutes * interval '1 minute')
        and so.order_status = 'pending'
        and so.created_at < v_now - (r.threshold_minutes * interval '1 minute');
    elsif r.rule_key = 'eta_overdue' then
      update public.delivery_operation_alert_events e
      set last_triggered_at = v_now,
          repeat_fire_count = coalesce(e.repeat_fire_count, 0) + 1
      from public.store_orders so
      where e.rule_id = r.id
        and e.order_id = so.id
        and e.event_status = 'open'
        and e.resolved_at is null
        and v_now >= e.last_triggered_at + (r.repeat_minutes * interval '1 minute')
        and so.estimated_ready_at is not null
        and so.estimated_ready_at + (r.threshold_minutes * interval '1 minute') < v_now
        and so.order_status in ('accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived');
    elsif r.rule_key = 'waiting_rider_overdue' then
      update public.delivery_operation_alert_events e
      set last_triggered_at = v_now,
          repeat_fire_count = coalesce(e.repeat_fire_count, 0) + 1
      from public.store_orders so
      join public.store_order_deliveries sod on sod.order_id = so.id
      where e.rule_id = r.id
        and e.order_id = so.id
        and e.event_status = 'open'
        and e.resolved_at is null
        and v_now >= e.last_triggered_at + (r.repeat_minutes * interval '1 minute')
        and sod.delivery_status = 'waiting_rider'
        and coalesce(sod.updated_at, so.updated_at, so.created_at) < v_now - (r.threshold_minutes * interval '1 minute');
    elsif r.rule_key = 'delivering_overdue' then
      update public.delivery_operation_alert_events e
      set last_triggered_at = v_now,
          repeat_fire_count = coalesce(e.repeat_fire_count, 0) + 1
      from public.store_orders so
      where e.rule_id = r.id
        and e.order_id = so.id
        and e.event_status = 'open'
        and e.resolved_at is null
        and v_now >= e.last_triggered_at + (r.repeat_minutes * interval '1 minute')
        and so.order_status = 'delivering'
        and so.updated_at < v_now - (r.threshold_minutes * interval '1 minute');
    elsif r.rule_key = 'refund_requested_overdue' then
      update public.delivery_operation_alert_events e
      set last_triggered_at = v_now,
          repeat_fire_count = coalesce(e.repeat_fire_count, 0) + 1
      from public.store_orders so
      where e.rule_id = r.id
        and e.order_id = so.id
        and e.event_status = 'open'
        and e.resolved_at is null
        and v_now >= e.last_triggered_at + (r.repeat_minutes * interval '1 minute')
        and so.order_status = 'refund_requested'
        and so.updated_at < v_now - (r.threshold_minutes * interval '1 minute');
    elsif r.rule_key = 'held_settlement_overdue' then
      update public.delivery_operation_alert_events e
      set last_triggered_at = v_now,
          repeat_fire_count = coalesce(e.repeat_fire_count, 0) + 1
      from public.store_settlements ss
      where e.rule_id = r.id
        and e.order_id = ss.order_id
        and e.event_status = 'open'
        and e.resolved_at is null
        and v_now >= e.last_triggered_at + (r.repeat_minutes * interval '1 minute')
        and ss.settlement_status = 'held'
        and ss.created_at < v_now - (r.threshold_minutes * interval '1 minute');
    end if;
  end loop;

  -- 5) 에스컬레이션: resolved/muted 제외, 룰 max 미만일 때만
  --    open(미확인): 앵커 first_triggered_at 또는 escalated_at
  --    acknowledged: 확인 후 처리 지연 — 앵커 acknowledged_at 또는 escalated_at (확인 시 리셋된 카운트 전제)
  update public.delivery_operation_alert_events e
  set
    escalation_count = e.escalation_count + 1,
    escalated_at = v_now,
    severity = case
      when e.severity = 'info' then 'warning'
      when e.severity = 'warning' then 'critical'
      else e.severity
    end
  from public.delivery_operation_alert_rules ru
  where e.rule_id = ru.id
    and ru.is_active
    and e.event_status = 'open'
    and e.acknowledged_at is null
    and e.escalation_count < ru.max_escalation_level
    and (
      (
        e.escalation_count = 0
        and v_now >= e.first_triggered_at + (ru.escalate_after_minutes * interval '1 minute')
      )
      or (
        e.escalation_count > 0
        and e.escalated_at is not null
        and v_now >= e.escalated_at + (ru.escalate_after_minutes * interval '1 minute')
      )
    );

  update public.delivery_operation_alert_events e
  set
    escalation_count = e.escalation_count + 1,
    escalated_at = v_now,
    severity = case
      when e.severity = 'info' then 'warning'
      when e.severity = 'warning' then 'critical'
      else e.severity
    end
  from public.delivery_operation_alert_rules ru
  where e.rule_id = ru.id
    and ru.is_active
    and e.event_status = 'acknowledged'
    and e.acknowledged_at is not null
    and e.escalation_count < ru.max_escalation_level
    and (
      (
        e.escalation_count = 0
        and v_now >= e.acknowledged_at + (ru.escalate_after_minutes * interval '1 minute')
      )
      or (
        e.escalation_count > 0
        and e.escalated_at is not null
        and v_now >= e.escalated_at + (ru.escalate_after_minutes * interval '1 minute')
      )
    );

end;
$$;
