-- 묶음 4 · S-12 / DB-2 — 관리자 배달 통계 집계에서 테스트 매장 주문 제외 (기본 = 실매장 store_kind='real' 만).
-- 운영 적용은 Owner 승인 후. 이 파일은 함수 1개만 재정의한다 (데이터 변경 없음).
--
-- 대상: public.admin_delivery_operations_dashboard — 관리자 배달 통계(/admin/delivery-operations,
--       API /api/admin/stats/delivery-operations)·실시간 상황판(/api/admin/ops-console/summary) 의 KPI·큐·차트 집계.
--       수수료·정산 SSOT 함수(store_commission_*, settlement*, admin_decide_store_commission_adjustment,
--       store_platform_payable_page 등)는 변경하지 않는다. 이 함수의 legacy store_settlements 금액 KPI 는
--       통계 API 가 SSOT 값으로 덮어쓴다(기존 동작 그대로).
--
-- 변경: 인자 p_include_test boolean DEFAULT false 추가.
--   · false(기본) — store_orders / store_settlements / store_order_deliveries 를 실매장(store_kind='real') 행으로만 집계
--   · true — 기존과 동일(전 매장: legacy_test·sample 포함) = 관리자 「테스트 포함 보기」
--   본문은 2026-10-29 운영 pg_get_functiondef 원문(아래 롤백 주석)에서 테이블 참조만 범위 서브쿼리로 바꿨다
--   (store_orders so 17곳 · store_settlements ss 6곳 · store_order_deliveries sod 3곳). 반환 형태 동일.
--   online_riders(매장 무관)는 그대로.
--
-- 호출 호환: 기존 4개 인자 시그니처는 DROP 하고 5개 인자(마지막 기본값) 함수로 교체한다 — 같은 이름의 4/5 인자
--   함수가 함께 있으면 PostgREST 이름 인자 호출이 모호해진다. 앱 배포 전 이 마이그레이션을 먼저 적용하면
--   구 앱(4개 인자 호출)은 기본값 false(실매장만)로, 신 앱은 p_include_test 를 명시해 호출한다.
--   실시간 상황판(ops-console summary)은 처리 큐 화면이라 p_include_test=true 로 기존 집계를 유지한다.
--
-- 롤백: DROP FUNCTION public.admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz, boolean);
--       후 아래 「이전 정의」 주석을 해제해 실행하고 REVOKE/GRANT 를 4개 인자 시그니처로 다시 실행.

DROP FUNCTION IF EXISTS public.admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.admin_delivery_operations_dashboard(p_today_start timestamp with time zone, p_today_end_ex timestamp with time zone, p_range_start timestamp with time zone, p_range_end_ex timestamp with time zone, p_include_test boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'generated_at', to_jsonb(now()),
    'kpis', jsonb_build_object(
      'orders_today',
        (select count(*)::bigint from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
          where so.created_at >= p_today_start and so.created_at < p_today_end_ex),
      'orders_in_progress',
        (select count(*)::bigint from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
          where so.order_status not in ('completed','cancelled','refunded')),
      'sla_attention_orders',
        (select count(*)::bigint from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
          where so.order_status not in ('completed','cancelled','refunded')
            and (
              coalesce(so.needs_admin_attention, false)
              or (so.sla_warning_level is not null and btrim(so.sla_warning_level) <> '')
            )),
      'unassigned_delivery_orders',
        (select count(*)::bigint
          from (select d0.* from public.store_order_deliveries d0 where p_include_test or d0.order_id in (select o2.id from public.store_orders o2 where o2.store_id in (select k.id from public.stores k where k.store_kind = 'real'))) sod
          join (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so on so.id = sod.order_id
          where sod.delivery_status = 'waiting_rider'
            and so.order_status not in ('completed','cancelled','refunded')),
      'platform_revenue_today',
        coalesce(
          (select sum(coalesce(ss.platform_fee_amount,0)+coalesce(ss.fixed_fee_amount,0)+coalesce(ss.delivery_income_amount,0))::bigint
             from (select s0.* from public.store_settlements s0 where p_include_test or s0.store_id in (select k.id from public.stores k where k.store_kind = 'real')) ss
            where ss.created_at >= p_today_start and ss.created_at < p_today_end_ex),
          0::bigint
        ),
      'refund_amount_today',
        coalesce(
          (select sum(round(coalesce(so.payment_amount,0)))::bigint
             from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
            where so.refunded_at is not null
              and so.refunded_at >= p_today_start and so.refunded_at < p_today_end_ex),
          0::bigint
        ),
      'settlement_pending_amount_today',
        coalesce(
          (select sum(round(coalesce(ss.net_settlement_amount, ss.settlement_amount, 0)))::bigint
             from (select s0.* from public.store_settlements s0 where p_include_test or s0.store_id in (select k.id from public.stores k where k.store_kind = 'real')) ss
            where ss.settlement_status in ('scheduled','processing')
              and ss.created_at >= p_today_start and ss.created_at < p_today_end_ex),
          0::bigint
        ),
      'held_settlements_count',
        (select count(*)::bigint from (select s0.* from public.store_settlements s0 where p_include_test or s0.store_id in (select k.id from public.stores k where k.store_kind = 'real')) ss where ss.settlement_status = 'held'),
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
              from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
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
              from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
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
              from (select d0.* from public.store_order_deliveries d0 where p_include_test or d0.order_id in (select o2.id from public.store_orders o2 where o2.store_id in (select k.id from public.stores k where k.store_kind = 'real'))) sod
              join (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so on so.id = sod.order_id
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
              from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
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
              from (select s0.* from public.store_settlements s0 where p_include_test or s0.store_id in (select k.id from public.stores k where k.store_kind = 'real')) ss
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
              from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
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
              from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
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
            select (date_trunc('day', so.created_at at time zone 'Asia/Manila'))::date as day,
                   count(*)::bigint as cnt
              from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
             where so.created_at >= p_range_start and so.created_at < p_range_end_ex
             group by 1
          ) d),'[]'::jsonb),
      'orders_by_hour_utc',
        coalesce((select jsonb_agg(jsonb_build_object('hour', h.h, 'count', h.cnt) order by h.h)
          from (
            select extract(hour from so.created_at at time zone 'UTC')::int as h,
                   count(*)::bigint as cnt
              from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
             where so.created_at >= p_range_start and so.created_at < p_range_end_ex
             group by 1
          ) h),'[]'::jsonb),
      'refunds_by_day',
        coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'amount', d.amt) order by d.day)
          from (
            select (date_trunc('day', so.refunded_at at time zone 'Asia/Manila'))::date as day,
                   sum(round(coalesce(so.payment_amount,0)))::bigint as amt
              from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
             where so.refunded_at is not null
               and so.refunded_at >= p_range_start and so.refunded_at < p_range_end_ex
             group by 1
          ) d),'[]'::jsonb),
      'platform_revenue_by_day',
        coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'amount', d.amt) order by d.day)
          from (
            select (date_trunc('day', ss.created_at at time zone 'Asia/Manila'))::date as day,
                   sum(coalesce(ss.platform_fee_amount,0)+coalesce(ss.fixed_fee_amount,0)+coalesce(ss.delivery_income_amount,0))::bigint as amt
              from (select s0.* from public.store_settlements s0 where p_include_test or s0.store_id in (select k.id from public.stores k where k.store_kind = 'real')) ss
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
                  from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
                  left join public.stores st on st.id = so.store_id
                 where so.created_at >= p_range_start and so.created_at < p_range_end_ex
                 group by so.store_id
              ) ob
              left join (
                select so.store_id,
                       coalesce(sum(
                         coalesce(ss.platform_fee_amount,0)+coalesce(ss.fixed_fee_amount,0)+coalesce(ss.delivery_income_amount,0)
                       ),0)::bigint as fee_sum
                  from (select s0.* from public.store_settlements s0 where p_include_test or s0.store_id in (select k.id from public.stores k where k.store_kind = 'real')) ss
                  join (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so on so.id = ss.order_id
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
              from (select o.* from public.store_orders o where p_include_test or o.store_id in (select k.id from public.stores k where k.store_kind = 'real')) so
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
          from (select d0.* from public.store_order_deliveries d0 where p_include_test or d0.order_id in (select o2.id from public.store_orders o2 where o2.store_id in (select k.id from public.stores k where k.store_kind = 'real'))) sod
         where sod.updated_at >= p_range_start and sod.updated_at < p_range_end_ex
           and sod.rider_id is not null
         group by sod.rider_id
         order by done_cnt desc nulls last
         limit 20
      ) q),'[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz, boolean) TO service_role;

COMMENT ON FUNCTION public.admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz, boolean) IS
  'S-12/DB-2: 관리자 배달 통계. p_include_test=false(기본) 실매장(store_kind=real)만, true 전 매장(테스트 포함 보기).';

-- ---------------------------------------------------------------------------
-- 이전 정의 (2026-10-29 운영 pg_get_functiondef 원문 · 롤백용)
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.admin_delivery_operations_dashboard(p_today_start timestamp with time zone, p_today_end_ex timestamp with time zone, p_range_start timestamp with time zone, p_range_end_ex timestamp with time zone)
--  RETURNS jsonb
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
--   select jsonb_build_object(
--     'generated_at', to_jsonb(now()),
--     'kpis', jsonb_build_object(
--       'orders_today',
--         (select count(*)::bigint from public.store_orders so
--           where so.created_at >= p_today_start and so.created_at < p_today_end_ex),
--       'orders_in_progress',
--         (select count(*)::bigint from public.store_orders so
--           where so.order_status not in ('completed','cancelled','refunded')),
--       'sla_attention_orders',
--         (select count(*)::bigint from public.store_orders so
--           where so.order_status not in ('completed','cancelled','refunded')
--             and (
--               coalesce(so.needs_admin_attention, false)
--               or (so.sla_warning_level is not null and btrim(so.sla_warning_level) <> '')
--             )),
--       'unassigned_delivery_orders',
--         (select count(*)::bigint
--           from public.store_order_deliveries sod
--           join public.store_orders so on so.id = sod.order_id
--           where sod.delivery_status = 'waiting_rider'
--             and so.order_status not in ('completed','cancelled','refunded')),
--       'platform_revenue_today',
--         coalesce(
--           (select sum(coalesce(ss.platform_fee_amount,0)+coalesce(ss.fixed_fee_amount,0)+coalesce(ss.delivery_income_amount,0))::bigint
--              from public.store_settlements ss
--             where ss.created_at >= p_today_start and ss.created_at < p_today_end_ex),
--           0::bigint
--         ),
--       'refund_amount_today',
--         coalesce(
--           (select sum(round(coalesce(so.payment_amount,0)))::bigint
--              from public.store_orders so
--             where so.refunded_at is not null
--               and so.refunded_at >= p_today_start and so.refunded_at < p_today_end_ex),
--           0::bigint
--         ),
--       'settlement_pending_amount_today',
--         coalesce(
--           (select sum(round(coalesce(ss.net_settlement_amount, ss.settlement_amount, 0)))::bigint
--              from public.store_settlements ss
--             where ss.settlement_status in ('scheduled','processing')
--               and ss.created_at >= p_today_start and ss.created_at < p_today_end_ex),
--           0::bigint
--         ),
--       'held_settlements_count',
--         (select count(*)::bigint from public.store_settlements ss where ss.settlement_status = 'held'),
--       'online_riders',
--         coalesce(
--           (select count(*)::bigint from public.delivery_riders dr where coalesce(dr.is_online, false)),
--           0::bigint
--         )
--     ),
--     'queues', jsonb_build_object(
--       'sla_attention',
--         coalesce((select jsonb_agg(z.row_json order by z.ord)
--           from (
--             select row_number() over (order by so.sla_warning_at desc nulls last, so.updated_at desc) as ord,
--                    jsonb_build_object(
--                      'order_id', so.id,
--                      'order_no', so.order_no,
--                      'store_id', so.store_id,
--                      'store_name', coalesce(st.store_name, ''),
--                      'order_status', so.order_status,
--                      'sla_warning_level', so.sla_warning_level,
--                      'sla_warning_reason', so.sla_warning_reason,
--                      'needs_admin_attention', so.needs_admin_attention
--                    ) as row_json
--               from public.store_orders so
--               left join public.stores st on st.id = so.store_id
--              where so.order_status not in ('completed','cancelled','refunded')
--                and (
--                  coalesce(so.needs_admin_attention, false)
--                  or (so.sla_warning_level is not null and btrim(so.sla_warning_level) <> '')
--                )
--              limit 40
--           ) z),'[]'::jsonb),
--       'eta_overdue',
--         coalesce((select jsonb_agg(z.row_json order by z.ord)
--           from (
--             select row_number() over (order by so.updated_at desc) as ord,
--                    jsonb_build_object(
--                      'order_id', so.id,
--                      'order_no', so.order_no,
--                      'store_name', coalesce(st.store_name, ''),
--                      'order_status', so.order_status,
--                      'estimated_ready_at', so.estimated_ready_at,
--                      'sla_warning_reason', so.sla_warning_reason
--                    ) as row_json
--               from public.store_orders so
--               left join public.stores st on st.id = so.store_id
--              where so.sla_warning_reason = 'eta_overdue'
--                and so.order_status not in ('completed','cancelled','refunded')
--              limit 35
--           ) z),'[]'::jsonb),
--       'unassigned',
--         coalesce((select jsonb_agg(z.row_json order by z.ord)
--           from (
--             select row_number() over (order by sod.updated_at asc) as ord,
--                    jsonb_build_object(
--                      'order_id', so.id,
--                      'order_no', so.order_no,
--                      'store_name', coalesce(st.store_name, ''),
--                      'delivery_status', sod.delivery_status,
--                      'order_status', so.order_status
--                    ) as row_json
--               from public.store_order_deliveries sod
--               join public.store_orders so on so.id = sod.order_id
--               left join public.stores st on st.id = so.store_id
--              where sod.delivery_status = 'waiting_rider'
--                and so.order_status not in ('completed','cancelled','refunded')
--              limit 35
--           ) z),'[]'::jsonb),
--       'long_delivering',
--         coalesce((select jsonb_agg(z.row_json order by z.ord)
--           from (
--             select row_number() over (order by so.updated_at asc) as ord,
--                    jsonb_build_object(
--                      'order_id', so.id,
--                      'order_no', so.order_no,
--                      'store_name', coalesce(st.store_name, ''),
--                      'updated_at', so.updated_at
--                    ) as row_json
--               from public.store_orders so
--               left join public.stores st on st.id = so.store_id
--              where so.order_status = 'delivering'
--                and so.updated_at < now() - interval '45 minutes'
--              limit 35
--           ) z),'[]'::jsonb),
--       'held_settlements',
--         coalesce((select jsonb_agg(z.row_json order by z.ord)
--           from (
--             select row_number() over (order by ss.created_at desc) as ord,
--                    jsonb_build_object(
--                      'settlement_id', ss.id,
--                      'order_id', ss.order_id,
--                      'store_name', coalesce(st.store_name, ''),
--                      'net_amount', coalesce(ss.net_settlement_amount, ss.settlement_amount, 0),
--                      'hold_reason', ss.hold_reason
--                    ) as row_json
--               from public.store_settlements ss
--               left join public.stores st on st.id = ss.store_id
--              where ss.settlement_status = 'held'
--              limit 30
--           ) z),'[]'::jsonb),
--       'refund_requested',
--         coalesce((select jsonb_agg(z.row_json order by z.ord)
--           from (
--             select row_number() over (order by so.updated_at desc) as ord,
--                    jsonb_build_object(
--                      'order_id', so.id,
--                      'order_no', so.order_no,
--                      'store_name', coalesce(st.store_name, ''),
--                      'payment_amount', so.payment_amount,
--                      'updated_at', so.updated_at
--                    ) as row_json
--               from public.store_orders so
--               left join public.stores st on st.id = so.store_id
--              where so.order_status = 'refund_requested'
--              limit 40
--           ) z),'[]'::jsonb),
--       'urgent_flagged',
--         coalesce((select jsonb_agg(z.row_json order by z.ord)
--           from (
--             select row_number() over (order by so.updated_at desc) as ord,
--                    jsonb_build_object(
--                      'order_id', so.id,
--                      'order_no', so.order_no,
--                      'store_name', coalesce(st.store_name, ''),
--                      'admin_flagged', so.admin_flagged,
--                      'needs_admin_attention', so.needs_admin_attention,
--                      'order_status', so.order_status
--                    ) as row_json
--               from public.store_orders so
--               left join public.stores st on st.id = so.store_id
--              where coalesce(so.admin_flagged, false)
--                and so.order_status not in ('completed','cancelled','refunded')
--              limit 35
--           ) z),'[]'::jsonb)
--     ),
--     'charts', jsonb_build_object(
--       'orders_by_day',
--         coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'count', d.cnt) order by d.day)
--           from (
--             select (date_trunc('day', so.created_at at time zone 'Asia/Manila'))::date as day,
--                    count(*)::bigint as cnt
--               from public.store_orders so
--              where so.created_at >= p_range_start and so.created_at < p_range_end_ex
--              group by 1
--           ) d),'[]'::jsonb),
--       'orders_by_hour_utc',
--         coalesce((select jsonb_agg(jsonb_build_object('hour', h.h, 'count', h.cnt) order by h.h)
--           from (
--             select extract(hour from so.created_at at time zone 'UTC')::int as h,
--                    count(*)::bigint as cnt
--               from public.store_orders so
--              where so.created_at >= p_range_start and so.created_at < p_range_end_ex
--              group by 1
--           ) h),'[]'::jsonb),
--       'refunds_by_day',
--         coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'amount', d.amt) order by d.day)
--           from (
--             select (date_trunc('day', so.refunded_at at time zone 'Asia/Manila'))::date as day,
--                    sum(round(coalesce(so.payment_amount,0)))::bigint as amt
--               from public.store_orders so
--              where so.refunded_at is not null
--                and so.refunded_at >= p_range_start and so.refunded_at < p_range_end_ex
--              group by 1
--           ) d),'[]'::jsonb),
--       'platform_revenue_by_day',
--         coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'amount', d.amt) order by d.day)
--           from (
--             select (date_trunc('day', ss.created_at at time zone 'Asia/Manila'))::date as day,
--                    sum(coalesce(ss.platform_fee_amount,0)+coalesce(ss.fixed_fee_amount,0)+coalesce(ss.delivery_income_amount,0))::bigint as amt
--               from public.store_settlements ss
--              where ss.created_at >= p_range_start and ss.created_at < p_range_end_ex
--              group by 1
--           ) d),'[]'::jsonb),
--       'top_stores',
--         coalesce((select jsonb_agg(jsonb_build_object(
--                    'store_id', x.store_id,
--                    'store_name', x.store_name,
--                    'orders', x.orders_cnt,
--                    'completed', x.completed_cnt,
--                    'cancelled_or_refunded', x.bad_cnt,
--                    'gross', x.gross_sum,
--                    'platform_fees', x.fee_sum,
--                    'sla_flags', x.sla_cnt,
--                    'refund_orders', x.refund_ord_cnt
--                  ) ORDER BY x.orders_cnt DESC)
--           from (
--             select ob.store_id,
--                    ob.store_name,
--                    ob.orders_cnt,
--                    ob.completed_cnt,
--                    ob.bad_cnt,
--                    ob.gross_sum,
--                    coalesce(fe.fee_sum, 0)::bigint as fee_sum,
--                    ob.sla_cnt,
--                    ob.refund_ord_cnt
--               from (
--                 select so.store_id,
--                        max(coalesce(st.store_name, '')) as store_name,
--                        count(*)::bigint as orders_cnt,
--                        count(*) filter (where so.order_status = 'completed')::bigint as completed_cnt,
--                        count(*) filter (where so.order_status in ('cancelled','refunded'))::bigint as bad_cnt,
--                        sum(round(coalesce(so.payment_amount,0)))::bigint as gross_sum,
--                        count(*) filter (where so.sla_warning_reason is not null)::bigint as sla_cnt,
--                        count(*) filter (where so.order_status = 'refund_requested' or so.refunded_at is not null)::bigint as refund_ord_cnt
--                   from public.store_orders so
--                   left join public.stores st on st.id = so.store_id
--                  where so.created_at >= p_range_start and so.created_at < p_range_end_ex
--                  group by so.store_id
--               ) ob
--               left join (
--                 select so.store_id,
--                        coalesce(sum(
--                          coalesce(ss.platform_fee_amount,0)+coalesce(ss.fixed_fee_amount,0)+coalesce(ss.delivery_income_amount,0)
--                        ),0)::bigint as fee_sum
--                   from public.store_settlements ss
--                   join public.store_orders so on so.id = ss.order_id
--                  where so.created_at >= p_range_start and so.created_at < p_range_end_ex
--                  group by so.store_id
--               ) fe on fe.store_id = ob.store_id
--              order by ob.orders_cnt desc
--              limit 12
--           ) x),'[]'::jsonb),
--       'top_regions',
--         coalesce((select jsonb_agg(jsonb_build_object(
--                    'region_key', r.region_key,
--                    'orders', r.orders_cnt,
--                    'gross', r.gross_sum,
--                    'sla_flags', r.sla_cnt
--                  ) order by r.orders_cnt desc)
--           from (
--             select coalesce(nullif(btrim(st.city),''), nullif(btrim(st.region),''), nullif(btrim(st.district),''), '기타') as region_key,
--                    count(*)::bigint as orders_cnt,
--                    sum(round(coalesce(so.payment_amount,0)))::bigint as gross_sum,
--                    count(*) filter (where so.sla_warning_reason is not null)::bigint as sla_cnt
--               from public.store_orders so
--               join public.stores st on st.id = so.store_id
--              where so.created_at >= p_range_start and so.created_at < p_range_end_ex
--              group by 1
--              order by orders_cnt desc
--              limit 12
--           ) r),'[]'::jsonb)
--     ),
--     'riders', coalesce((select jsonb_agg(jsonb_build_object(
--            'rider_id', q.rider_id,
--            'completed_deliveries', q.done_cnt,
--            'avg_delivery_minutes', q.avg_min,
--            'failed_or_terminal_orders', q.fail_cnt,
--            'sla_flags', q.sla_cnt
--          ) order by q.done_cnt desc nulls last)
--       from (
--         select sod.rider_id,
--                count(*) filter (where sod.delivered_at is not null)::bigint as done_cnt,
--                avg(extract(epoch from (sod.delivered_at - sod.picked_up_at)) / 60.0)
--                  filter (where sod.picked_up_at is not null and sod.delivered_at is not null) as avg_min,
--                count(*) filter (where exists (
--                    select 1 from public.store_orders sx
--                     where sx.id = sod.order_id
--                       and sx.order_status in ('cancelled','refunded')
--                  ))::bigint as fail_cnt,
--                count(*) filter (
--                  where exists (
--                    select 1 from public.store_orders sy
--                     where sy.id = sod.order_id
--                       and sy.sla_warning_reason is not null
--                  )
--                )::bigint as sla_cnt
--           from public.store_order_deliveries sod
--          where sod.updated_at >= p_range_start and sod.updated_at < p_range_end_ex
--            and sod.rider_id is not null
--          group by sod.rider_id
--          order by done_cnt desc nulls last
--          limit 20
--       ) q),'[]'::jsonb)
--   );
-- $function$;
-- REVOKE ALL ON FUNCTION public.admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz) TO service_role;
