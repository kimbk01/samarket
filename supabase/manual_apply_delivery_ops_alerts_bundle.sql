-- MANUAL BUNDLE: delivery ops dashboard RPC + alert engine v1-v3
-- Apply once. Keep outside migrations/ so db push does not double-apply.

-- 배달 운영 통계 대시보드 (단일 RPC → 관리자 API 1회 왕복)
-- 읽기 전용. 주문 상태 머신·정산 로직·Realtime 구성 변경 없음.

create or replace function public.admin_delivery_operations_dashboard(
  p_today_start timestamptz,
  p_today_end_ex timestamptz,
  p_range_start timestamptz,
  p_range_end_ex timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', to_jsonb(now()),
    'kpis', jsonb_build_object(
      'orders_today',
        (select count(*)::bigint from public.store_orders so
          where so.created_at >= p_today_start and so.created_at < p_today_end_ex),
      'orders_in_progress',
        (select count(*)::bigint from public.store_orders so
          where so.order_status not in ('completed','cancelled','refunded')),
      'sla_attention_orders',
        (select count(*)::bigint from public.store_orders so
          where so.order_status not in ('completed','cancelled','refunded')
            and (
              coalesce(so.needs_admin_attention, false)
              or (so.sla_warning_level is not null and btrim(so.sla_warning_level) <> '')
            )),
      'unassigned_delivery_orders',
        (select count(*)::bigint
          from public.store_order_deliveries sod
          join public.store_orders so on so.id = sod.order_id
          where sod.delivery_status = 'waiting_rider'
            and so.order_status not in ('completed','cancelled','refunded')),
      'platform_revenue_today',
        coalesce(
          (select sum(coalesce(ss.platform_fee_amount,0)+coalesce(ss.fixed_fee_amount,0)+coalesce(ss.delivery_income_amount,0))::bigint
             from public.store_settlements ss
            where ss.created_at >= p_today_start and ss.created_at < p_today_end_ex),
          0::bigint
        ),
      'refund_amount_today',
        coalesce(
          (select sum(round(coalesce(so.payment_amount,0)))::bigint
             from public.store_orders so
            where so.refunded_at is not null
              and so.refunded_at >= p_today_start and so.refunded_at < p_today_end_ex),
          0::bigint
        ),
      'settlement_pending_amount_today',
        coalesce(
          (select sum(round(coalesce(ss.net_settlement_amount, ss.settlement_amount, 0)))::bigint
             from public.store_settlements ss
            where ss.settlement_status in ('scheduled','processing')
              and ss.created_at >= p_today_start and ss.created_at < p_today_end_ex),
          0::bigint
        ),
      'held_settlements_count',
        (select count(*)::bigint from public.store_settlements ss where ss.settlement_status = 'held'),
      'online_riders',
        coalesce(
          (select count(*)::bigint from public.delivery_riders dr where coalesce(dr.is_online, false)),
          0::bigint
        )
    ),
    'queues', jsonb_build_object(
      'sla_attention',
        coalesce((select jsonb_agg(z.row_json order by z.ord)
          from (
            select row_number() over (order by so.sla_warning_at desc nulls last, so.updated_at desc) as ord,
                   jsonb_build_object(
                     'order_id', so.id,
                     'order_no', so.order_no,
                     'store_id', so.store_id,
                     'store_name', coalesce(st.store_name, ''),
                     'order_status', so.order_status,
                     'sla_warning_level', so.sla_warning_level,
                     'sla_warning_reason', so.sla_warning_reason,
                     'needs_admin_attention', so.needs_admin_attention
                   ) as row_json
              from public.store_orders so
              left join public.stores st on st.id = so.store_id
             where so.order_status not in ('completed','cancelled','refunded')
               and (
                 coalesce(so.needs_admin_attention, false)
                 or (so.sla_warning_level is not null and btrim(so.sla_warning_level) <> '')
               )
             limit 40
          ) z),'[]'::jsonb),
      'eta_overdue',
        coalesce((select jsonb_agg(z.row_json order by z.ord)
          from (
            select row_number() over (order by so.updated_at desc) as ord,
                   jsonb_build_object(
                     'order_id', so.id,
                     'order_no', so.order_no,
                     'store_name', coalesce(st.store_name, ''),
                     'order_status', so.order_status,
                     'estimated_ready_at', so.estimated_ready_at,
                     'sla_warning_reason', so.sla_warning_reason
                   ) as row_json
              from public.store_orders so
              left join public.stores st on st.id = so.store_id
             where so.sla_warning_reason = 'eta_overdue'
               and so.order_status not in ('completed','cancelled','refunded')
             limit 35
          ) z),'[]'::jsonb),
      'unassigned',
        coalesce((select jsonb_agg(z.row_json order by z.ord)
          from (
            select row_number() over (order by sod.updated_at asc) as ord,
                   jsonb_build_object(
                     'order_id', so.id,
                     'order_no', so.order_no,
                     'store_name', coalesce(st.store_name, ''),
                     'delivery_status', sod.delivery_status,
                     'order_status', so.order_status
                   ) as row_json
              from public.store_order_deliveries sod
              join public.store_orders so on so.id = sod.order_id
              left join public.stores st on st.id = so.store_id
             where sod.delivery_status = 'waiting_rider'
               and so.order_status not in ('completed','cancelled','refunded')
             limit 35
          ) z),'[]'::jsonb),
      'long_delivering',
        coalesce((select jsonb_agg(z.row_json order by z.ord)
          from (
            select row_number() over (order by so.updated_at asc) as ord,
                   jsonb_build_object(
                     'order_id', so.id,
                     'order_no', so.order_no,
                     'store_name', coalesce(st.store_name, ''),
                     'updated_at', so.updated_at
                   ) as row_json
              from public.store_orders so
              left join public.stores st on st.id = so.store_id
             where so.order_status = 'delivering'
               and so.updated_at < now() - interval '45 minutes'
             limit 35
          ) z),'[]'::jsonb),
      'held_settlements',
        coalesce((select jsonb_agg(z.row_json order by z.ord)
          from (
            select row_number() over (order by ss.created_at desc) as ord,
                   jsonb_build_object(
                     'settlement_id', ss.id,
                     'order_id', ss.order_id,
                     'store_name', coalesce(st.store_name, ''),
                     'net_amount', coalesce(ss.net_settlement_amount, ss.settlement_amount, 0),
                     'hold_reason', ss.hold_reason
                   ) as row_json
              from public.store_settlements ss
              left join public.stores st on st.id = ss.store_id
             where ss.settlement_status = 'held'
             limit 30
          ) z),'[]'::jsonb),
      'refund_requested',
        coalesce((select jsonb_agg(z.row_json order by z.ord)
          from (
            select row_number() over (order by so.updated_at desc) as ord,
                   jsonb_build_object(
                     'order_id', so.id,
                     'order_no', so.order_no,
                     'store_name', coalesce(st.store_name, ''),
                     'payment_amount', so.payment_amount,
                     'updated_at', so.updated_at
                   ) as row_json
              from public.store_orders so
              left join public.stores st on st.id = so.store_id
             where so.order_status = 'refund_requested'
             limit 40
          ) z),'[]'::jsonb),
      'urgent_flagged',
        coalesce((select jsonb_agg(z.row_json order by z.ord)
          from (
            select row_number() over (order by so.updated_at desc) as ord,
                   jsonb_build_object(
                     'order_id', so.id,
                     'order_no', so.order_no,
                     'store_name', coalesce(st.store_name, ''),
                     'admin_flagged', so.admin_flagged,
                     'needs_admin_attention', so.needs_admin_attention,
                     'order_status', so.order_status
                   ) as row_json
              from public.store_orders so
              left join public.stores st on st.id = so.store_id
             where coalesce(so.admin_flagged, false)
               and so.order_status not in ('completed','cancelled','refunded')
             limit 35
          ) z),'[]'::jsonb)
    ),
    'charts', jsonb_build_object(
      'orders_by_day',
        coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'count', d.cnt) order by d.day)
          from (
            select (date_trunc('day', so.created_at at time zone 'UTC'))::date as day,
                   count(*)::bigint as cnt
              from public.store_orders so
             where so.created_at >= p_range_start and so.created_at < p_range_end_ex
             group by 1
          ) d),'[]'::jsonb),
      'orders_by_hour_utc',
        coalesce((select jsonb_agg(jsonb_build_object('hour', h.h, 'count', h.cnt) order by h.h)
          from (
            select extract(hour from so.created_at at time zone 'UTC')::int as h,
                   count(*)::bigint as cnt
              from public.store_orders so
             where so.created_at >= p_range_start and so.created_at < p_range_end_ex
             group by 1
          ) h),'[]'::jsonb),
      'refunds_by_day',
        coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'amount', d.amt) order by d.day)
          from (
            select (date_trunc('day', so.refunded_at at time zone 'UTC'))::date as day,
                   sum(round(coalesce(so.payment_amount,0)))::bigint as amt
              from public.store_orders so
             where so.refunded_at is not null
               and so.refunded_at >= p_range_start and so.refunded_at < p_range_end_ex
             group by 1
          ) d),'[]'::jsonb),
      'platform_revenue_by_day',
        coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'amount', d.amt) order by d.day)
          from (
            select (date_trunc('day', ss.created_at at time zone 'UTC'))::date as day,
                   sum(coalesce(ss.platform_fee_amount,0)+coalesce(ss.fixed_fee_amount,0)+coalesce(ss.delivery_income_amount,0))::bigint as amt
              from public.store_settlements ss
             where ss.created_at >= p_range_start and ss.created_at < p_range_end_ex
             group by 1
          ) d),'[]'::jsonb),
      'top_stores',
        coalesce((select jsonb_agg(jsonb_build_object(
                   'store_id', x.store_id,
                   'store_name', x.store_name,
                   'orders', x.orders_cnt,
                   'completed', x.completed_cnt,
                   'cancelled_or_refunded', x.bad_cnt,
                   'gross', x.gross_sum,
                   'platform_fees', x.fee_sum,
                   'sla_flags', x.sla_cnt,
                   'refund_orders', x.refund_ord_cnt
                 ) ORDER BY x.orders_cnt DESC)
          from (
            select ob.store_id,
                   ob.store_name,
                   ob.orders_cnt,
                   ob.completed_cnt,
                   ob.bad_cnt,
                   ob.gross_sum,
                   coalesce(fe.fee_sum, 0)::bigint as fee_sum,
                   ob.sla_cnt,
                   ob.refund_ord_cnt
              from (
                select so.store_id,
                       max(coalesce(st.store_name, '')) as store_name,
                       count(*)::bigint as orders_cnt,
                       count(*) filter (where so.order_status = 'completed')::bigint as completed_cnt,
                       count(*) filter (where so.order_status in ('cancelled','refunded'))::bigint as bad_cnt,
                       sum(round(coalesce(so.payment_amount,0)))::bigint as gross_sum,
                       count(*) filter (where so.sla_warning_reason is not null)::bigint as sla_cnt,
                       count(*) filter (where so.order_status = 'refund_requested' or so.refunded_at is not null)::bigint as refund_ord_cnt
                  from public.store_orders so
                  left join public.stores st on st.id = so.store_id
                 where so.created_at >= p_range_start and so.created_at < p_range_end_ex
                 group by so.store_id
              ) ob
              left join (
                select so.store_id,
                       coalesce(sum(
                         coalesce(ss.platform_fee_amount,0)+coalesce(ss.fixed_fee_amount,0)+coalesce(ss.delivery_income_amount,0)
                       ),0)::bigint as fee_sum
                  from public.store_settlements ss
                  join public.store_orders so on so.id = ss.order_id
                 where so.created_at >= p_range_start and so.created_at < p_range_end_ex
                 group by so.store_id
              ) fe on fe.store_id = ob.store_id
             order by ob.orders_cnt desc
             limit 12
          ) x),'[]'::jsonb),
      'top_regions',
        coalesce((select jsonb_agg(jsonb_build_object(
                   'region_key', r.region_key,
                   'orders', r.orders_cnt,
                   'gross', r.gross_sum,
                   'sla_flags', r.sla_cnt
                 ) order by r.orders_cnt desc)
          from (
            select coalesce(nullif(btrim(st.city),''), nullif(btrim(st.region),''), nullif(btrim(st.district),''), '기타') as region_key,
                   count(*)::bigint as orders_cnt,
                   sum(round(coalesce(so.payment_amount,0)))::bigint as gross_sum,
                   count(*) filter (where so.sla_warning_reason is not null)::bigint as sla_cnt
              from public.store_orders so
              join public.stores st on st.id = so.store_id
             where so.created_at >= p_range_start and so.created_at < p_range_end_ex
             group by 1
             order by orders_cnt desc
             limit 12
          ) r),'[]'::jsonb)
    ),
    'riders', coalesce((select jsonb_agg(jsonb_build_object(
           'rider_id', q.rider_id,
           'completed_deliveries', q.done_cnt,
           'avg_delivery_minutes', q.avg_min,
           'failed_or_terminal_orders', q.fail_cnt,
           'sla_flags', q.sla_cnt
         ) order by q.done_cnt desc nulls last)
      from (
        select sod.rider_id,
               count(*) filter (where sod.delivered_at is not null)::bigint as done_cnt,
               avg(extract(epoch from (sod.delivered_at - sod.picked_up_at)) / 60.0)
                 filter (where sod.picked_up_at is not null and sod.delivered_at is not null) as avg_min,
               count(*) filter (where exists (
                   select 1 from public.store_orders sx
                    where sx.id = sod.order_id
                      and sx.order_status in ('cancelled','refunded')
                 ))::bigint as fail_cnt,
               count(*) filter (
                 where exists (
                   select 1 from public.store_orders sy
                    where sy.id = sod.order_id
                      and sy.sla_warning_reason is not null
                 )
               )::bigint as sla_cnt
          from public.store_order_deliveries sod
         where sod.updated_at >= p_range_start and sod.updated_at < p_range_end_ex
           and sod.rider_id is not null
         group by sod.rider_id
         order by done_cnt desc nulls last
         limit 20
      ) q),'[]'::jsonb)
  );
$$;

revoke all on function public.admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz) to service_role;


-- ========== NEXT (same order as migrations/) ==========

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


-- ========== NEXT (same order as migrations/) ==========

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


-- ========== NEXT (same order as migrations/) ==========

-- 배달 운영 알림 감사 로그 (append-only)
-- - open (rule_id, order_id) 부분 유니크 불변
-- - SLA 스캔 함수 미수정
-- - repeat 로그: repeat_fire_count 가 1 또는 10의 배수일 때만 기록 (크론 폭주 완화)

-- ─── 감사 테이블 ───────────────────────────────────────────────────────────
create table if not exists public.delivery_operation_alert_event_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.delivery_operation_alert_events(id) on delete cascade,
  action_type text not null,
  actor_admin_id uuid references public.profiles(id) on delete set null,
  previous_status text,
  next_status text,
  previous_assignee uuid references public.profiles(id) on delete set null,
  next_assignee uuid references public.profiles(id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists delivery_operation_alert_event_logs_event_created_idx
  on public.delivery_operation_alert_event_logs (event_id, created_at desc);

alter table public.delivery_operation_alert_event_logs enable row level security;

drop policy if exists delivery_operation_alert_event_logs_admin_all on public.delivery_operation_alert_event_logs;
create policy delivery_operation_alert_event_logs_admin_all
  on public.delivery_operation_alert_event_logs
  for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- API 가 요청자 UUID 를 한 번만 넘기면 행에는 저장하지 않음 (POOL 안전: 트랜잭션 로컬 설정)
alter table public.delivery_operation_alert_events
  add column if not exists mutation_actor_id uuid references public.profiles(id) on delete set null;

-- ─── BEFORE: 트랜잭션 로컬 actor + 컬럼 제거 ────────────────────────────────
create or replace function public.delivery_operation_alert_events_audit_actor_bu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mutation_actor_id is distinct from old.mutation_actor_id then
    perform set_config(
      'samarket.alert_audit_actor',
      coalesce(new.mutation_actor_id::text, ''),
      true
    );
  else
    perform set_config('samarket.alert_audit_actor', '', true);
  end if;
  new.mutation_actor_id := null;
  return new;
end;
$$;

drop trigger if exists trg_delivery_alert_audit_actor_bu on public.delivery_operation_alert_events;
create trigger trg_delivery_alert_audit_actor_bu
before update on public.delivery_operation_alert_events
for each row
execute function public.delivery_operation_alert_events_audit_actor_bu();

-- ─── AFTER INSERT: created ───────────────────────────────────────────────────
create or replace function public.delivery_operation_alert_events_audit_ai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.delivery_operation_alert_event_logs (
    event_id, action_type, actor_admin_id, previous_status, next_status,
    previous_assignee, next_assignee, note, metadata
  ) values (
    new.id,
    'created',
    null,
    null,
    new.event_status,
    null,
    null,
    null,
    jsonb_build_object(
      'severity', new.severity,
      'rule_id', new.rule_id,
      'order_id', new.order_id,
      'store_id', new.store_id
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_delivery_alert_audit_ai on public.delivery_operation_alert_events;
create trigger trg_delivery_alert_audit_ai
after insert on public.delivery_operation_alert_events
for each row
execute function public.delivery_operation_alert_events_audit_ai();

-- ─── AFTER UPDATE: 담당·메모·상태·에스컬·반복·자동해소 ──────────────────────
create or replace function public.delivery_operation_alert_events_audit_au()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_txt text;
begin
  begin
    v_txt := nullif(trim(current_setting('samarket.alert_audit_actor', true)), '');
    if v_txt is not null
       and v_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_actor := v_txt::uuid;
    end if;
  exception when others then
    v_actor := null;
  end;

  if old.assigned_admin_id is distinct from new.assigned_admin_id then
    if new.assigned_admin_id is null then
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'unassigned', v_actor, old.event_status, new.event_status,
        old.assigned_admin_id, null, null, '{}'::jsonb
      );
    else
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'assigned', v_actor, old.event_status, new.event_status,
        old.assigned_admin_id, new.assigned_admin_id, new.assignment_note, '{}'::jsonb
      );
    end if;
  end if;

  if old.handling_note is distinct from new.handling_note then
    insert into public.delivery_operation_alert_event_logs (
      event_id, action_type, actor_admin_id, previous_status, next_status,
      previous_assignee, next_assignee, note, metadata
    ) values (
      new.id, 'note_updated', coalesce(v_actor, new.acknowledged_by, new.resolved_by),
      old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
      new.handling_note,
      jsonb_build_object('field', 'handling_note')
    );
  end if;

  if new.escalation_count > old.escalation_count then
    insert into public.delivery_operation_alert_event_logs (
      event_id, action_type, actor_admin_id, previous_status, next_status,
      previous_assignee, next_assignee, note, metadata
    ) values (
      new.id, 'escalated', null,
      old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
      null,
      jsonb_build_object(
        'from_count', old.escalation_count,
        'to_count', new.escalation_count,
        'severity_before', old.severity,
        'severity_after', new.severity
      )
    );
  end if;

  if new.repeat_fire_count > old.repeat_fire_count
     and (new.repeat_fire_count = 1 or new.repeat_fire_count % 10 = 0) then
    insert into public.delivery_operation_alert_event_logs (
      event_id, action_type, actor_admin_id, previous_status, next_status,
      previous_assignee, next_assignee, note, metadata
    ) values (
      new.id, 'repeated', null,
      old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
      null,
      jsonb_build_object('repeat_fire_count', new.repeat_fire_count)
    );
  end if;

  if old.event_status is distinct from new.event_status then
    if new.event_status = 'resolved' and new.resolved_by is null then
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'auto_resolved', null,
        old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
        null,
        jsonb_build_object('source', 'sync')
      );
    elsif new.event_status = 'resolved' and new.resolved_by is not null then
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'resolved', coalesce(v_actor, new.resolved_by),
        old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
        new.resolve_note,
        '{}'::jsonb
      );
    elsif new.event_status = 'acknowledged' then
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'acknowledged', coalesce(v_actor, new.acknowledged_by),
        old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
        new.acknowledge_note,
        '{}'::jsonb
      );
    elsif new.event_status = 'muted' then
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'muted', coalesce(v_actor, new.acknowledged_by),
        old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
        new.mute_note,
        '{}'::jsonb
      );
    else
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'status_changed', coalesce(v_actor, new.resolved_by, new.acknowledged_by),
        old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
        null,
        '{}'::jsonb
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_delivery_alert_audit_au on public.delivery_operation_alert_events;
create trigger trg_delivery_alert_audit_au
after update on public.delivery_operation_alert_events
for each row
execute function public.delivery_operation_alert_events_audit_au();

revoke all on function public.delivery_operation_alert_events_audit_actor_bu() from public;
revoke all on function public.delivery_operation_alert_events_audit_ai() from public;
revoke all on function public.delivery_operation_alert_events_audit_au() from public;
