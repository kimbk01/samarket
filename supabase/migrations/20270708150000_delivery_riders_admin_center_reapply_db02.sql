-- v4 W5 · DB-02 (2026-10-29 PHT) — 20260517120000_delivery_riders_admin_center 운영 누락분 멱등 재적용.
--
-- 운영 확인(READ ONLY, 2026-10-29): public.delivery_riders 에 admin_status·admin_note·suspended_at·suspended_by
--   컬럼 없음, 함수 admin_delivery_riders_operations_snapshot() 없음 → 관리자 라이더 상세 PATCH
--   (app/api/admin/delivery-riders/[riderId]/route.ts select/update) 와 GET 스냅샷 경로 실패.
--   store_order_deliveries.failure_reason 은 이미 있음(20270605100000) — IF NOT EXISTS 로 무변경.
--   delivery_riders 행 0건 → 컬럼 추가·NOT NULL DEFAULT 는 데이터 영향 없음.
--
-- 원본과 차이: 함수 EXECUTE 를 PUBLIC 뿐 아니라 anon·authenticated 에서도 명시 회수(service_role 전용 —
--   admin_delivery_riders_page 와 같은 권한 형태). 함수 본문은 원본 그대로.
--
-- 롤백:
--   drop function if exists public.admin_delivery_riders_operations_snapshot();
--   alter table public.delivery_riders drop constraint if exists delivery_riders_admin_status_chk,
--     drop column if exists suspended_by, drop column if exists suspended_at,
--     drop column if exists admin_note, drop column if exists admin_status;

alter table public.delivery_riders
  add column if not exists admin_status text not null default 'ok';

alter table public.delivery_riders
  drop constraint if exists delivery_riders_admin_status_chk;
alter table public.delivery_riders
  add constraint delivery_riders_admin_status_chk
  check (admin_status in ('ok', 'flagged', 'paused'));

alter table public.delivery_riders
  add column if not exists admin_note text;

alter table public.delivery_riders
  add column if not exists suspended_at timestamptz;

alter table public.delivery_riders
  add column if not exists suspended_by uuid references public.profiles(id) on delete set null;

comment on column public.delivery_riders.admin_status is '관리 뱃지: ok | flagged | paused (일시정지는 suspended_at 과 함께 사용 권장)';
comment on column public.delivery_riders.admin_note is '관리자 메모 (관리자 라이더 상세 PATCH, 메모 CAS)';
comment on column public.delivery_riders.suspended_at is '관리자 정지 시각 (해제 시 null)';
comment on column public.delivery_riders.suspended_by is '정지한 관리자 profiles.id (해제 시 null)';

alter table public.store_order_deliveries
  add column if not exists failure_reason text;

-- ─── 단일 스냅샷 RPC (원본 20260517120000 과 동일 본문) ───
create or replace function public.admin_delivery_riders_operations_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select ((now() at time zone 'utc')::date)::timestamp at time zone 'utc' as day_start
  ),
  d_agg as (
    select
      sod.rider_id,
      count(*) filter (
        where sod.rider_id is not null
          and sod.delivery_status in ('rider_assigned', 'pickup_in_progress', 'delivering')
          and so.order_status not in ('completed', 'cancelled', 'refunded')
      )::bigint as in_progress_count,
      count(*) filter (
        where sod.delivered_at is not null
          and sod.delivered_at >= (select day_start from bounds)
          and sod.delivery_status = 'delivered'
      )::bigint as completed_today,
      round(
        avg(
          extract(epoch from (sod.delivered_at - sod.assigned_at)) / 60.0
        ) filter (
          where sod.delivered_at is not null
            and sod.assigned_at is not null
            and sod.delivered_at >= (select day_start from bounds)
            and sod.delivery_status = 'delivered'
        )::numeric,
        2
      ) as avg_delivery_minutes_today,
      count(*) filter (
        where sod.delivery_status = 'delivery_failed'
          and sod.rider_id is not null
      )::bigint as failed_delivery_rows,
      count(*) filter (
        where sod.delivery_status in ('rider_assigned', 'pickup_in_progress', 'delivering')
          and so.order_status not in ('completed', 'cancelled', 'refunded')
          and sod.assigned_at is not null
          and sod.assigned_at < now() - interval '45 minutes'
      )::bigint as long_delivery_count
    from public.store_order_deliveries sod
    join public.store_orders so on so.id = sod.order_id
   where sod.rider_id is not null
   group by sod.rider_id
  ),
  rider_rows as (
    select
      dr.id as rider_id,
      jsonb_build_object(
        'id', dr.id,
        'user_id', dr.user_id,
        'display_name',
          coalesce(
            nullif(trim(p.nickname), ''),
            nullif(trim(p.username), ''),
            '라이더 ' || left(dr.id::text, 8)
          ),
        'is_online', coalesce(dr.is_online, false),
        'rider_status', dr.rider_status,
        'admin_status', dr.admin_status,
        'admin_note', dr.admin_note,
        'suspended_at', dr.suspended_at,
        'last_active_at', dr.last_active_at,
        'current_lat', dr.current_lat,
        'current_lng', dr.current_lng,
        'in_progress_count', coalesce(da.in_progress_count, 0),
        'completed_today', coalesce(da.completed_today, 0),
        'avg_delivery_minutes_today', da.avg_delivery_minutes_today,
        'failed_delivery_rows', coalesce(da.failed_delivery_rows, 0),
        'long_delivery_count', coalesce(da.long_delivery_count, 0),
        'active_orders',
          coalesce(
            (
              select jsonb_agg(row_json order by ord)
                from (
                  select
                    row_number() over (order by sod2.updated_at desc) as ord,
                    jsonb_build_object(
                      'order_id', sod2.order_id,
                      'order_no', so2.order_no,
                      'order_status', so2.order_status,
                      'delivery_status', sod2.delivery_status,
                      'assigned_at', sod2.assigned_at,
                      'updated_at', sod2.updated_at
                    ) as row_json
                    from public.store_order_deliveries sod2
                    join public.store_orders so2 on so2.id = sod2.order_id
                   where sod2.rider_id = dr.id
                     and sod2.delivery_status in ('rider_assigned', 'pickup_in_progress', 'delivering')
                     and so2.order_status not in ('completed', 'cancelled', 'refunded')
                   order by sod2.updated_at desc
                   limit 5
                ) x
            ),
            '[]'::jsonb
          )
      ) as row_json,
      lower(coalesce(nullif(trim(p.nickname), ''), nullif(trim(p.username), ''), dr.id::text)) as sort_key
      from public.delivery_riders dr
      left join public.profiles p on p.id = dr.user_id
      left join d_agg da on da.rider_id = dr.id
  ),
  unassigned as (
    select coalesce(
      jsonb_agg(row_json order by ord),
      '[]'::jsonb
    ) as arr
      from (
        select
          row_number() over (order by sod.updated_at asc) as ord,
          jsonb_build_object(
            'order_id', sod.order_id,
            'order_no', so.order_no,
            'store_id', sod.store_id,
            'order_status', so.order_status,
            'delivery_status', sod.delivery_status,
            'updated_at', sod.updated_at,
            'created_at', sod.created_at
          ) as row_json
          from public.store_order_deliveries sod
          join public.store_orders so on so.id = sod.order_id
         where sod.delivery_status = 'waiting_rider'
           and sod.rider_id is null
           and so.order_status not in ('completed', 'cancelled', 'refunded')
         order by sod.updated_at asc
         limit 100
      ) u
  )
  select jsonb_build_object(
    'generated_at', to_jsonb(now()),
    'riders', coalesce((select jsonb_agg(row_json order by sort_key) from rider_rows), '[]'::jsonb),
    'unassigned_deliveries', (select arr from unassigned)
  );
$$;

revoke all on function public.admin_delivery_riders_operations_snapshot() from public;
revoke all on function public.admin_delivery_riders_operations_snapshot() from anon, authenticated;
grant execute on function public.admin_delivery_riders_operations_snapshot() to service_role;
