-- 배달 운영 알림·에스컬레이션 룰 엔진 (v1)
-- - scan_store_order_sla_warnings() 비수정. 별도 cron 으로 동기화.
-- - 주문 상태 전이·Realtime·채팅 unread 변경 없음.

-- ─── Rules ───────────────────────────────────────────────────────────────
create table if not exists public.delivery_operation_alert_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  rule_name text not null,
  target_type text not null check (target_type in ('order', 'delivery', 'settlement')),
  threshold_minutes integer not null check (threshold_minutes > 0),
  warning_level text not null check (warning_level in ('info', 'warning', 'critical')),
  repeat_minutes integer not null default 60 check (repeat_minutes > 0),
  is_active boolean not null default true,
  escalation_level integer not null default 1 check (escalation_level >= 1),
  notify_admin boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_operation_alert_rules_active_idx
  on public.delivery_operation_alert_rules (is_active)
  where is_active;

drop trigger if exists trg_delivery_operation_alert_rules_updated_at on public.delivery_operation_alert_rules;
create trigger trg_delivery_operation_alert_rules_updated_at
before update on public.delivery_operation_alert_rules
for each row execute function public.set_updated_at();

-- ─── Events ────────────────────────────────────────────────────────────────
create table if not exists public.delivery_operation_alert_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.delivery_operation_alert_rules(id) on delete cascade,
  order_id uuid references public.store_orders(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  severity text not null,
  event_status text not null default 'open'
    check (event_status in ('open', 'acknowledged', 'resolved', 'muted')),
  first_triggered_at timestamptz not null default now(),
  last_triggered_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index if not exists delivery_operation_alert_events_status_last_idx
  on public.delivery_operation_alert_events (event_status, last_triggered_at desc);

create index if not exists delivery_operation_alert_events_order_idx
  on public.delivery_operation_alert_events (order_id);

create unique index if not exists delivery_operation_alert_events_open_rule_order_uidx
  on public.delivery_operation_alert_events (rule_id, order_id)
  where event_status = 'open';

-- ─── Seed defaults (idempotent) ───────────────────────────────────────────
insert into public.delivery_operation_alert_rules
  (rule_key, rule_name, target_type, threshold_minutes, warning_level, repeat_minutes, is_active, escalation_level, notify_admin)
values
  ('pending_overdue', '주문 접수 대기 초과', 'order', 5, 'warning', 30, true, 1, true),
  ('eta_overdue', '준비 ETA 초과', 'order', 10, 'warning', 20, true, 2, true),
  ('waiting_rider_overdue', '미배차 대기 초과', 'delivery', 10, 'warning', 15, true, 2, true),
  ('delivering_overdue', '배달 진행 장기', 'order', 45, 'critical', 30, true, 3, true),
  ('refund_requested_overdue', '환불 요청 미처리', 'order', 30, 'warning', 60, true, 2, true),
  ('held_settlement_overdue', '정산 held 장기', 'settlement', 1440, 'critical', 360, true, 3, true)
on conflict (rule_key) do nothing;

-- ─── RLS (관리자 UI는 서비스 롤 API 경유; 인증 직접 조회 시 보호) ─────────
alter table public.delivery_operation_alert_rules enable row level security;
alter table public.delivery_operation_alert_events enable row level security;

drop policy if exists delivery_operation_alert_rules_admin_all on public.delivery_operation_alert_rules;
create policy delivery_operation_alert_rules_admin_all
  on public.delivery_operation_alert_rules
  for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

drop policy if exists delivery_operation_alert_events_admin_all on public.delivery_operation_alert_events;
create policy delivery_operation_alert_events_admin_all
  on public.delivery_operation_alert_events
  for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- ─── Sync: 삽입·재알림 간격·자동 해소 ───────────────────────────────────────
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

  -- 3) 신규 open 이벤트 (중복 open 금지: 부분 유니크 + NOT EXISTS)
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

  -- 4) 재알림 간격: open 만 last_triggered_at 갱신 (조건 지속 시)
  for r in select * from public.delivery_operation_alert_rules where is_active loop
    if r.rule_key = 'pending_overdue' then
      update public.delivery_operation_alert_events e
      set last_triggered_at = v_now
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
      set last_triggered_at = v_now
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
      set last_triggered_at = v_now
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
      set last_triggered_at = v_now
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
      set last_triggered_at = v_now
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
      set last_triggered_at = v_now
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
end;
$$;

revoke all on function public.sync_delivery_operation_alert_events() from public;
grant execute on function public.sync_delivery_operation_alert_events() to service_role;

-- pg_cron: SLA 스캔과 분리된 잡 (함수 본문 비수정)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'sync_delivery_operation_alert_events';

    perform cron.schedule(
      'sync_delivery_operation_alert_events',
      '*/2 * * * *',
      $cron$select public.sync_delivery_operation_alert_events();$cron$
    );
    raise notice 'delivery_alerts: cron.schedule registered (*/2 * * * *)';
  else
    raise notice 'delivery_alerts: pg_cron not found — schedule skipped';
  end if;
exception
  when undefined_table then
    raise notice 'delivery_alerts: cron tables not available — schedule skipped';
  when undefined_function then
    raise notice 'delivery_alerts: cron.schedule not available — schedule skipped';
end $$;
