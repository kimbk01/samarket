-- R7 잔여 (delivery_a) — 라이더 운영 화면 서버 페이지네이션
-- 목적: /admin/delivery-riders 가 `admin_delivery_riders_operations_snapshot()` 으로 라이더 전체를 한 번에 받고
--       미배정 배달을 100건 상한으로 자르던 경로를 없앤다. 탭별(라이더 / 미배정) limit·offset + 정확한 total.
--       기존 스냅샷 RPC 는 그대로 둔다 (파라미터 없는 GET 호출 호환).
-- 대상 화면: /admin/delivery-riders · /admin/ops-console 재배정 라이더 선택 (API GET /api/admin/delivery-riders?view=…)
-- 권한: SECURITY DEFINER · search_path=public · EXECUTE 는 service_role 만 (PUBLIC·anon·authenticated 회수).
-- 열 호환: 운영 delivery_riders 에 admin_status·admin_note·suspended_at 이 아직 없을 수 있어(20260517120000 미적용)
--          `to_jsonb(dr) ->> '…'` 로 읽는다 — 열이 있으면 값, 없으면 null(=ok/정지 아님).
-- p_view:
--   'riders'     라이더 목록 — 정렬 lower(표시 이름), id (결정적). p_q = 닉네임·아이디·라이더 ID 부분 일치.
--   'queue'      미배정 배달 (waiting_rider · rider 없음 · 주문 미종료) — 정렬 updated_at asc, order_id asc.
--   'assignable' 배정 가능 라이더(정지·일시정지 제외) 선택 목록 — 정렬 온라인 우선, 이름, id. p_q 검색.
-- 반환: { generated_at, view, total, limit, offset, rows, riders_total, unassigned_total, suspended_count, flagged_count }
-- 롤백:
--   drop function if exists public.admin_delivery_riders_page(text, text, integer, integer);
--   drop index if exists public.store_order_deliveries_waiting_rider_idx;

create index if not exists store_order_deliveries_waiting_rider_idx
  on public.store_order_deliveries (updated_at, order_id)
  where delivery_status = 'waiting_rider' and rider_id is null;

create or replace function public.admin_delivery_riders_page(
  p_view text default 'riders',
  p_q text default null,
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
      case when p_view in ('riders', 'queue', 'assignable') then p_view else 'riders' end as v,
      nullif(btrim(coalesce(p_q, '')), '') as q,
      least(100, greatest(1, coalesce(p_limit, 20))) as lim,
      least(100000, greatest(0, coalesce(p_offset, 0))) as off,
      ((now() at time zone 'Asia/Manila')::date)::timestamp at time zone 'Asia/Manila' as day_start
  ),
  rider_base as (
    select
      dr.id,
      dr.user_id,
      dr.is_online,
      dr.rider_status,
      dr.last_active_at,
      dr.current_lat,
      dr.current_lng,
      coalesce(nullif(to_jsonb(dr) ->> 'admin_status', ''), 'ok') as admin_status,
      to_jsonb(dr) ->> 'admin_note' as admin_note,
      to_jsonb(dr) ->> 'suspended_at' as suspended_at,
      coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.username), ''), '라이더 ' || left(dr.id::text, 8)) as display_name,
      lower(coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.username), ''), dr.id::text)) as sort_key,
      p.nickname,
      p.username
    from public.delivery_riders dr
    left join public.profiles p on p.id = dr.user_id
  ),
  rider_filtered as (
    select rb.*
      from rider_base rb, params pr
     where pr.v in ('riders', 'assignable')
       and (pr.q is null
            or rb.nickname ilike '%' || replace(replace(replace(pr.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
            or rb.username ilike '%' || replace(replace(replace(pr.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
            or rb.id::text ilike '%' || replace(replace(replace(pr.q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
       and (pr.v = 'riders' or (rb.suspended_at is null and rb.admin_status <> 'paused'))
  ),
  rider_page as (
    select rf.*
      from rider_filtered rf, params pr
     order by
       case when pr.v = 'assignable' then (case when coalesce(rf.is_online, false) then 0 else 1 end) else 0 end,
       rf.sort_key,
       rf.id
     limit (select lim from params)
    offset (select off from params)
  ),
  queue_filtered as (
    select sod.order_id, sod.store_id, sod.delivery_status, sod.updated_at, sod.created_at,
           so.order_no, so.order_status
      from public.store_order_deliveries sod
      join public.store_orders so on so.id = sod.order_id
     where sod.delivery_status = 'waiting_rider'
       and sod.rider_id is null
       and so.order_status not in ('completed', 'cancelled', 'refunded')
  ),
  queue_page as (
    select qf.*
      from queue_filtered qf
     where (select v from params) = 'queue'
     order by qf.updated_at asc, qf.order_id asc
     limit (select lim from params)
    offset (select off from params)
  ),
  rider_rows as (
    select
      rp.sort_key,
      rp.id as rid,
      rp.is_online as online,
      jsonb_build_object(
        'id', rp.id,
        'user_id', rp.user_id,
        'display_name', rp.display_name,
        'is_online', coalesce(rp.is_online, false),
        'rider_status', rp.rider_status,
        'admin_status', rp.admin_status,
        'admin_note', rp.admin_note,
        'suspended_at', rp.suspended_at,
        'last_active_at', rp.last_active_at,
        'current_lat', rp.current_lat,
        'current_lng', rp.current_lng,
        'in_progress_count', coalesce(ag.in_progress_count, 0),
        'completed_today', coalesce(ag.completed_today, 0),
        'avg_delivery_minutes_today', ag.avg_delivery_minutes_today,
        'failed_delivery_rows', coalesce(ag.failed_delivery_rows, 0),
        'long_delivery_count', coalesce(ag.long_delivery_count, 0),
        'active_orders', coalesce(ao.arr, '[]'::jsonb)
      ) as row_json
    from rider_page rp
    left join lateral (
      select
        count(*) filter (
          where sod.delivery_status in ('rider_assigned', 'pickup_in_progress', 'delivering')
            and so.order_status not in ('completed', 'cancelled', 'refunded')
        )::bigint as in_progress_count,
        count(*) filter (
          where sod.delivered_at is not null
            and sod.delivered_at >= (select day_start from params)
            and sod.delivery_status = 'delivered'
        )::bigint as completed_today,
        round(
          avg(extract(epoch from (sod.delivered_at - sod.assigned_at)) / 60.0) filter (
            where sod.delivered_at is not null
              and sod.assigned_at is not null
              and sod.delivered_at >= (select day_start from params)
              and sod.delivery_status = 'delivered'
          )::numeric,
          2
        ) as avg_delivery_minutes_today,
        count(*) filter (where sod.delivery_status = 'delivery_failed')::bigint as failed_delivery_rows,
        count(*) filter (
          where sod.delivery_status in ('rider_assigned', 'pickup_in_progress', 'delivering')
            and so.order_status not in ('completed', 'cancelled', 'refunded')
            and sod.assigned_at is not null
            and sod.assigned_at < now() - interval '45 minutes'
        )::bigint as long_delivery_count
      from public.store_order_deliveries sod
      join public.store_orders so on so.id = sod.order_id
      where sod.rider_id = rp.id
    ) ag on (select v from params) = 'riders'
    left join lateral (
      select jsonb_agg(x.j order by x.updated_at desc, x.order_id desc) as arr
        from (
          select sod2.updated_at, sod2.order_id,
                 jsonb_build_object(
                   'order_id', sod2.order_id,
                   'order_no', so2.order_no,
                   'order_status', so2.order_status,
                   'delivery_status', sod2.delivery_status,
                   'assigned_at', sod2.assigned_at,
                   'updated_at', sod2.updated_at
                 ) as j
            from public.store_order_deliveries sod2
            join public.store_orders so2 on so2.id = sod2.order_id
           where sod2.rider_id = rp.id
             and sod2.delivery_status in ('rider_assigned', 'pickup_in_progress', 'delivering')
             and so2.order_status not in ('completed', 'cancelled', 'refunded')
           order by sod2.updated_at desc, sod2.order_id desc
           limit 5
        ) x
    ) ao on (select v from params) = 'riders'
  )
  select jsonb_build_object(
    'generated_at', to_jsonb(now()),
    'view', (select v from params),
    'limit', (select lim from params),
    'offset', (select off from params),
    'total',
      case (select v from params)
        when 'queue' then (select count(*)::bigint from queue_filtered)
        else (select count(*)::bigint from rider_filtered)
      end,
    'rows',
      case (select v from params)
        when 'queue' then coalesce((
          select jsonb_agg(
                   jsonb_build_object(
                     'order_id', qp.order_id,
                     'order_no', qp.order_no,
                     'store_id', qp.store_id,
                     'order_status', qp.order_status,
                     'delivery_status', qp.delivery_status,
                     'updated_at', qp.updated_at,
                     'created_at', qp.created_at
                   )
                   order by qp.updated_at asc, qp.order_id asc
                 )
            from queue_page qp
        ), '[]'::jsonb)
        when 'assignable' then coalesce((
          select jsonb_agg(
                   jsonb_build_object(
                     'id', rr.rid,
                     'display_name', rr.row_json ->> 'display_name',
                     'is_online', coalesce(rr.online, false),
                     'admin_status', rr.row_json ->> 'admin_status',
                     'suspended_at', rr.row_json ->> 'suspended_at'
                   )
                   order by (case when coalesce(rr.online, false) then 0 else 1 end), rr.sort_key, rr.rid
                 )
            from rider_rows rr
        ), '[]'::jsonb)
        else coalesce((
          select jsonb_agg(rr.row_json order by rr.sort_key, rr.rid) from rider_rows rr
        ), '[]'::jsonb)
      end,
    'riders_total', (select count(*)::bigint from public.delivery_riders),
    'unassigned_total', (select count(*)::bigint from queue_filtered),
    'suspended_count', (select count(*)::bigint from rider_base rb where rb.suspended_at is not null),
    'flagged_count', (select count(*)::bigint from rider_base rb where rb.admin_status = 'flagged')
  );
$$;

revoke all on function public.admin_delivery_riders_page(text, text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.admin_delivery_riders_page(text, text, integer, integer)
  to service_role;
