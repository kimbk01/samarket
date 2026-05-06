-- SLA scan function for store_orders (v1)
-- 목표: full table scan을 피하고, 변경 필요 행만 UPDATE 해서 realtime storm을 줄인다.

create or replace function public.scan_store_order_sla_warnings()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  -- 대상: 종료 상태 제외 + 최근/활성 주문 위주로만
  with candidates as (
    select
      so.id,
      so.store_id,
      so.buyer_user_id,
      so.order_status,
      so.payment_status,
      so.created_at,
      so.updated_at,
      so.estimated_ready_at,
      so.sla_warning_level as prev_level,
      so.sla_warning_reason as prev_reason,
      so.needs_admin_attention as prev_attention,
      sod.delivery_status as delivery_status,
      sod.updated_at as delivery_updated_at
    from public.store_orders so
    left join public.store_order_deliveries sod
      on sod.order_id = so.id
    where so.order_status not in ('completed','cancelled','refunded')
      -- 최근 생성/업데이트/ETA 있는 주문만 (오래된 inactive scan 방지)
      and (
        so.created_at > v_now - interval '7 days'
        or so.updated_at > v_now - interval '7 days'
        or so.estimated_ready_at is not null
      )
  ),
  computed as (
    select
      c.id,
      case
        -- refund SLA (장기 미처리)
        when c.order_status = 'refund_requested' and c.updated_at < v_now - interval '60 minutes' then 'critical'
        -- delivery SLA (delivering 60분 초과)
        when c.order_status = 'delivering' and c.updated_at < v_now - interval '60 minutes' then 'critical'
        -- preparing SLA (ETA 초과)
        when c.estimated_ready_at is not null and c.estimated_ready_at < v_now
             and c.order_status in ('accepted','preparing','ready_for_pickup','delivering','arrived') then 'warning'
        -- accepted SLA (pending 5분 초과)
        when c.order_status = 'pending' and c.created_at < v_now - interval '5 minutes' then 'warning'
        -- unassigned SLA (waiting_rider 장기)
        when c.delivery_status = 'waiting_rider' and coalesce(c.delivery_updated_at, c.updated_at, c.created_at) < v_now - interval '10 minutes' then 'warning'
        else null
      end as level,
      case
        when c.order_status = 'refund_requested' and c.updated_at < v_now - interval '60 minutes' then 'refund_overdue'
        when c.order_status = 'delivering' and c.updated_at < v_now - interval '60 minutes' then 'delivery_over_60m'
        when c.estimated_ready_at is not null and c.estimated_ready_at < v_now
             and c.order_status in ('accepted','preparing','ready_for_pickup','delivering','arrived') then 'eta_overdue'
        when c.order_status = 'pending' and c.created_at < v_now - interval '5 minutes' then 'pending_over_5m'
        when c.delivery_status = 'waiting_rider' and coalesce(c.delivery_updated_at, c.updated_at, c.created_at) < v_now - interval '10 minutes' then 'unassigned_over_10m'
        else null
      end as reason,
      case
        when c.order_status = 'refund_requested' and c.updated_at < v_now - interval '60 minutes' then true
        when c.order_status = 'delivering' and c.updated_at < v_now - interval '60 minutes' then true
        when c.estimated_ready_at is not null and c.estimated_ready_at < v_now
             and c.order_status in ('accepted','preparing','ready_for_pickup','delivering','arrived') then true
        when c.order_status = 'pending' and c.created_at < v_now - interval '5 minutes' then true
        when c.delivery_status = 'waiting_rider' and coalesce(c.delivery_updated_at, c.updated_at, c.created_at) < v_now - interval '10 minutes' then true
        else false
      end as needs_attention
    from candidates c
  ),
  to_update as (
    select
      c.id,
      coalesce(comp.level, null) as next_level,
      coalesce(comp.reason, null) as next_reason,
      comp.needs_attention as next_attention,
      c.prev_level,
      c.prev_reason,
      c.prev_attention
    from candidates c
    join computed comp on comp.id = c.id
    where
      -- 변경 필요 행만 업데이트해서 storm 방지
      (c.prev_level is distinct from comp.level)
      or (c.prev_reason is distinct from comp.reason)
      or (c.prev_attention is distinct from comp.needs_attention)
      -- 경고가 해제되는 케이스도 포함(level/reason null로)
  )
  update public.store_orders so
  set
    sla_warning_level = t.next_level,
    sla_warning_reason = t.next_reason,
    needs_admin_attention = t.next_attention,
    sla_warning_at = case
      when t.next_reason is null then null
      when t.prev_reason is distinct from t.next_reason then v_now
      when so.sla_warning_at is null then v_now
      else so.sla_warning_at
    end
  from to_update t
  where so.id = t.id;
end;
$$;

revoke all on function public.scan_store_order_sla_warnings() from public;
grant execute on function public.scan_store_order_sla_warnings() to service_role;

-- Optional scheduler: pg_cron (if available). Safe no-op if extension missing.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- replace schedule if exists (avoid duplicate jobs)
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'scan_store_order_sla_warnings';

    -- Supabase pg_cron supports cron.schedule(name, schedule, command)
    -- every 2 minutes
    perform cron.schedule(
      'scan_store_order_sla_warnings',
      '*/2 * * * *',
      $cron$select public.scan_store_order_sla_warnings();$cron$
    );
    raise notice 'sla_scan: cron.schedule registered (*/2 * * * *)';
  else
    raise notice 'sla_scan: pg_cron extension not found — schedule skipped';
  end if;
exception
  when undefined_table then
    raise notice 'sla_scan: cron tables not available — schedule skipped';
  when undefined_function then
    raise notice 'sla_scan: cron.schedule not available — schedule skipped';
end $$;

