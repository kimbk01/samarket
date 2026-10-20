-- R7 잔여 (delivery_a) — 실시간 상황판 큐 서버 페이지네이션
-- 목적: /admin/ops-console 큐가 `admin_delivery_operations_dashboard` 의 큐별 limit(30~40) 결과를 브라우저에서
--       합치고(120건 상한) 그룹마다 40건만 그리며, 요약 API 가 보강 조회를 `.limit(600)` 으로 자르던 경로를 없앤다.
--       여러 출처(SLA·ETA 초과·미배정·장시간 배달·보류 정산·환불 요청·긴급 표시)를 DB 에서 주문 단위로 한 번에 합치고,
--       우선순위 점수·포커스 필터·그룹 정렬·페이지·정확한 total 을 DB 에서 계산한다.
--       기존 대시보드 RPC(KPI·차트)는 그대로 둔다.
-- 대상 화면: /admin/ops-console (API GET /api/admin/ops-console/queue)
-- 권한: SECURITY DEFINER · search_path=public · EXECUTE 는 service_role 만 (PUBLIC·anon·authenticated 회수).
-- 우선순위 점수 = components/admin/ops-console/AdminOpsConsolePage.tsx `priorityForOpsRow` 와 같은 규칙
--   (화면은 같은 행 값으로 사유 문구·등급만 다시 그린다).
-- 정렬(결정적):
--   그룹 없음: 점수 desc, 에스컬레이션 desc, updated_at desc, order_id asc
--   그룹 있음: 그룹 최고 점수 desc, 그룹 키 asc, 이후 위와 같음
-- 반환: { generated_at, total, limit, offset, rows[], tab_counts{}, queue_counts{} }
--   rows[] 에 group_key · group_total · group_top_score 포함 (페이지에 걸친 그룹도 전체 건수를 보여 준다).
-- 롤백:
--   drop function if exists public.admin_ops_console_queue_page(text, text, text, uuid, integer, integer);
--   drop index if exists public.delivery_operation_alert_events_order_open_last_idx;

create index if not exists delivery_operation_alert_events_order_open_last_idx
  on public.delivery_operation_alert_events (order_id, last_triggered_at desc, id desc)
  where event_status in ('open', 'acknowledged');

create or replace function public.admin_ops_console_queue_page(
  p_tab text default 'risk',
  p_focus text default 'all',
  p_group text default 'store',
  p_viewer uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      case when p_tab in ('risk', 'sla', 'riders', 'settlements', 'incidents') then p_tab else 'risk' end as tab,
      case when p_focus in ('all', 'critical', 'sla', 'rider_issues', 'settlements', 'refund', 'attention', 'mine')
           then p_focus else 'all' end as focus,
      case when p_group in ('none', 'store', 'rider', 'region') then p_group else 'store' end as grp,
      least(100, greatest(1, coalesce(p_limit, 20))) as lim,
      least(100000, greatest(0, coalesce(p_offset, 0))) as off
  ),
  cand as (
    select so.id as order_id
      from public.store_orders so
     where (so.order_status not in ('completed', 'cancelled', 'refunded')
            and (coalesce(so.needs_admin_attention, false)
                 or nullif(btrim(coalesce(so.sla_warning_level, '')), '') is not null
                 or so.sla_warning_reason = 'eta_overdue'
                 or coalesce(so.admin_flagged, false)))
        or (so.order_status = 'delivering' and so.updated_at < now() - interval '45 minutes')
        or so.order_status = 'refund_requested'
    union
    select sod.order_id
      from public.store_order_deliveries sod
      join public.store_orders so on so.id = sod.order_id
     where sod.delivery_status = 'waiting_rider'
       and so.order_status not in ('completed', 'cancelled', 'refunded')
    union
    select ss.order_id
      from public.store_settlements ss
     where ss.settlement_status = 'held'
  ),
  enriched as (
    select
      c.order_id,
      so.order_no,
      so.order_status,
      coalesce(so.needs_admin_attention, false) as needs_admin_attention,
      coalesce(so.admin_flagged, false) as admin_flagged,
      nullif(btrim(coalesce(so.sla_warning_level, '')), '') as sla_warning_level,
      nullif(btrim(coalesce(so.sla_warning_reason, '')), '') as sla_warning_reason,
      so.estimated_ready_at,
      so.payment_amount,
      coalesce(so.store_id, sod.store_id, ss.store_id) as store_id,
      st.store_name,
      st.region,
      st.city,
      sod.rider_id,
      sod.delivery_status,
      sod.assigned_at,
      sod.picked_up_at,
      sod.rider_accepted_at,
      sod.delivered_at,
      coalesce(sod.updated_at, so.updated_at) as updated_at,
      ss.id as settlement_id,
      ss.settlement_status,
      ss.hold_reason,
      coalesce(ss.net_settlement_amount::bigint, ss.settlement_amount, 0) as net_amount,
      ev.id as event_id,
      ev.event_status,
      coalesce(ev.escalation_count, 0) as escalation_count,
      coalesce(ev.repeat_fire_count, 0) as repeat_fire_count,
      ev.assigned_admin_id,
      coalesce(nullif(btrim(pf.nickname), ''), left(sod.rider_id::text, 8)) as rider_name,
      -- 큐 소속 (대시보드 RPC 큐 조건과 같음)
      (so.order_status not in ('completed', 'cancelled', 'refunded')
        and (coalesce(so.needs_admin_attention, false)
             or nullif(btrim(coalesce(so.sla_warning_level, '')), '') is not null)) as q_sla_attention,
      (so.sla_warning_reason = 'eta_overdue'
        and so.order_status not in ('completed', 'cancelled', 'refunded')) as q_eta_overdue,
      (sod.delivery_status = 'waiting_rider'
        and so.order_status not in ('completed', 'cancelled', 'refunded')) as q_unassigned,
      (so.order_status = 'delivering' and so.updated_at < now() - interval '45 minutes') as q_long_delivering,
      (ss.settlement_status = 'held') as q_held_settlements,
      (so.order_status = 'refund_requested') as q_refund_requested,
      (coalesce(so.admin_flagged, false)
        and so.order_status not in ('completed', 'cancelled', 'refunded')) as q_urgent_flagged,
      -- 배달 중 경과 분 (화면 minutesSince 와 같음: 음수면 0)
      case
        when sod.delivered_at is null and sod.delivery_status = 'delivering'
             and coalesce(sod.picked_up_at, sod.rider_accepted_at, sod.assigned_at, coalesce(sod.updated_at, so.updated_at)) is not null
        then greatest(0, floor(extract(epoch from (
               now() - coalesce(sod.picked_up_at, sod.rider_accepted_at, sod.assigned_at, coalesce(sod.updated_at, so.updated_at))
             )) / 60.0))
        else null
      end as delivering_minutes
    from cand c
    left join public.store_orders so on so.id = c.order_id
    left join public.store_order_deliveries sod on sod.order_id = c.order_id
    left join public.store_settlements ss on ss.order_id = c.order_id
    left join public.stores st on st.id = coalesce(so.store_id, sod.store_id, ss.store_id)
    left join public.delivery_riders dr on dr.id = sod.rider_id
    left join public.profiles pf on pf.id = dr.user_id
    left join lateral (
      select e.id, e.event_status, e.escalation_count, e.repeat_fire_count, e.assigned_admin_id
        from public.delivery_operation_alert_events e
       where e.order_id = c.order_id
         and e.event_status in ('open', 'acknowledged')
       order by e.last_triggered_at desc, e.id desc
       limit 1
    ) ev on true
  ),
  scored as (
    select x.*,
      (case
         when x.comp = 0 then 30
         else x.comp
       end) as priority_score
    from (
      select en.*,
        (case when lower(coalesce(en.sla_warning_level, '')) = 'critical' then 600
              when en.sla_warning_level is not null then 260 else 0 end)
        + (case when en.order_status = 'refund_requested' then 380 else 0 end)
        + (case when en.delivery_status = 'waiting_rider' or en.rider_id is null then 420 else 0 end)
        + (case when en.delivering_minutes >= 180 then 520
                when en.delivering_minutes >= 120 then 420
                when en.delivering_minutes >= 60 then 220 else 0 end)
        + (case when en.escalation_count >= 3 then 220 when en.escalation_count >= 1 then 90 else 0 end)
        + (case when en.repeat_fire_count >= 2 then 120 else 0 end)
        + (case when en.settlement_id is not null and en.settlement_status = 'held' then 200 else 0 end)
        + (case when en.needs_admin_attention then 140 else 0 end) as comp
      from enriched en
    ) x
  ),
  in_tab as (
    select s.*
      from scored s, params pr
     where case pr.tab
             when 'risk' then (s.q_urgent_flagged or s.q_sla_attention or s.q_eta_overdue or s.q_long_delivering or s.q_unassigned)
             when 'sla' then (s.q_sla_attention or s.q_eta_overdue)
             when 'riders' then (s.q_unassigned or s.q_long_delivering)
             when 'settlements' then (s.q_held_settlements or s.q_refund_requested)
             else s.q_sla_attention
           end
  ),
  filtered as (
    select t.*,
      case pr.grp
        when 'store' then coalesce(t.store_id::text, 'unknown_store')
        when 'rider' then coalesce(t.rider_id::text, 'unknown_rider')
        when 'region' then coalesce(t.region, '') || '|' || coalesce(t.city, '')
        else 'all'
      end as group_key
      from in_tab t, params pr
     where case pr.focus
             when 'all' then true
             when 'critical' then t.priority_score >= 600
             when 'sla' then t.sla_warning_level is not null
             when 'rider_issues' then (t.delivery_status in ('waiting_rider', 'delivering') or t.rider_id is null)
             when 'settlements' then (t.settlement_id is not null or t.settlement_status = 'held')
             when 'refund' then t.order_status = 'refund_requested'
             when 'attention' then t.needs_admin_attention
             else (p_viewer is not null and t.assigned_admin_id = p_viewer)
           end
  ),
  grouped as (
    select f.*,
      count(*) over (partition by f.group_key) as group_total,
      max(f.priority_score) over (partition by f.group_key) as group_top_score
      from filtered f
  ),
  page as (
    select g.*,
      row_number() over (
        order by
          case when (select grp from params) = 'none' then 0 else -g.group_top_score end,
          case when (select grp from params) = 'none' then '' else g.group_key end,
          g.priority_score desc,
          g.escalation_count desc,
          g.updated_at desc nulls last,
          g.order_id asc
      ) as ord
      from grouped g
  )
  select jsonb_build_object(
    'generated_at', to_jsonb(now()),
    'total', (select count(*)::bigint from filtered),
    'limit', (select lim from params),
    'offset', (select off from params),
    'rows', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'order_id', p.order_id,
                 'order_no', p.order_no,
                 'order_status', p.order_status,
                 'store_id', p.store_id,
                 'store_name', coalesce(nullif(btrim(coalesce(p.store_name, '')), ''), left(p.store_id::text, 8)),
                 'region', p.region,
                 'city', p.city,
                 'rider_id', p.rider_id,
                 'rider_name', case when p.rider_id is null then null else p.rider_name end,
                 'delivery_status', p.delivery_status,
                 'delivery_id', p.order_id,
                 'assigned_at', p.assigned_at,
                 'picked_up_at', p.picked_up_at,
                 'rider_accepted_at', p.rider_accepted_at,
                 'delivered_at', p.delivered_at,
                 'updated_at', p.updated_at,
                 'needs_admin_attention', p.needs_admin_attention,
                 'admin_flagged', p.admin_flagged,
                 'sla_warning_level', p.sla_warning_level,
                 'sla_warning_reason', p.sla_warning_reason,
                 'estimated_ready_at', p.estimated_ready_at,
                 'payment_amount', p.payment_amount,
                 'settlement_id', p.settlement_id,
                 'settlement_status', p.settlement_status,
                 'hold_reason', p.hold_reason,
                 'net_amount', p.net_amount,
                 'event_id', p.event_id,
                 'event_status', p.event_status,
                 'escalation_count', p.escalation_count,
                 'repeat_fire_count', p.repeat_fire_count,
                 'assigned_admin_id', p.assigned_admin_id,
                 'priority_score', p.priority_score,
                 'group_key', p.group_key,
                 'group_total', p.group_total,
                 'group_top_score', p.group_top_score
               )
               order by p.ord
             )
        from page p
       where p.ord > (select off from params)
         and p.ord <= (select off + lim from params)
    ), '[]'::jsonb),
    'tab_counts', (
      select jsonb_build_object(
        'risk', count(*) filter (where s.q_urgent_flagged or s.q_sla_attention or s.q_eta_overdue or s.q_long_delivering or s.q_unassigned),
        'sla', count(*) filter (where s.q_sla_attention or s.q_eta_overdue),
        'riders', count(*) filter (where s.q_unassigned or s.q_long_delivering),
        'settlements', count(*) filter (where s.q_held_settlements or s.q_refund_requested),
        'incidents', count(*) filter (where s.q_sla_attention)
      )
      from enriched s
    ),
    'queue_counts', (
      select jsonb_build_object(
        'sla_attention', count(*) filter (where s.q_sla_attention),
        'eta_overdue', count(*) filter (where s.q_eta_overdue),
        'unassigned', count(*) filter (where s.q_unassigned),
        'long_delivering', count(*) filter (where s.q_long_delivering),
        'held_settlements', count(*) filter (where s.q_held_settlements),
        'refund_requested', count(*) filter (where s.q_refund_requested),
        'urgent_flagged', count(*) filter (where s.q_urgent_flagged)
      )
      from enriched s
    )
  );
$$;

revoke all on function public.admin_ops_console_queue_page(text, text, text, uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.admin_ops_console_queue_page(text, text, text, uuid, integer, integer)
  to service_role;
