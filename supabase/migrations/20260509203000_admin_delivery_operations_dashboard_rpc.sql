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
