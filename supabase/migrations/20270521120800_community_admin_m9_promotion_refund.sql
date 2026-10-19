-- 커뮤니티 Admin M9 (C-21, C-40, O-5): 홍보 노출 중지 시간 기록·종료 주체·귀책·환급.
-- 환급은 포인트 원장 refund 로만 (현금 환불 없음). 주문 행 잠금 + 원장 unique 로 1회만.
-- 환급 기준 금액은 주문 ID 로 연결된 실제 차감(spend) 원장 금액 — 차감 기록이 없으면 환급하지 않는다.
alter table public.point_promotion_orders
  add column if not exists paused_at timestamptz,
  add column if not exists paused_seconds_total integer not null default 0,
  add column if not exists ended_by uuid,
  add column if not exists ended_at timestamptz,
  add column if not exists end_reason_code text,
  add column if not exists fault text,
  add column if not exists refund_points integer,
  add column if not exists refund_ledger_id uuid;

alter table public.point_promotion_orders drop constraint if exists point_promotion_orders_fault_check;
alter table public.point_promotion_orders add constraint point_promotion_orders_fault_check
  check (fault is null or fault in ('operator', 'member', 'none'));

create unique index if not exists uq_point_ledger_promotion_refund_once
  on public.point_ledger (related_type, related_id, entry_type)
  where related_type = 'promotion_order' and entry_type = 'refund';

-- 노출 중지: active → paused
create or replace function public.admin_promotion_pause(p_order_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row record;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  update public.point_promotion_orders
     set order_status = 'paused', paused_at = now()
   where id = p_order_id and order_status = 'active'
  returning id, end_at into v_row;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_active'); end if;
  return jsonb_build_object('ok', true, 'order_status', 'paused', 'end_at', v_row.end_at);
end; $$;

-- 노출 재개: paused → active, 중지했던 시간만큼 종료일 연장
create or replace function public.admin_promotion_resume(p_order_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_gap integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.order_status <> 'paused' then return jsonb_build_object('ok', false, 'error', 'not_paused'); end if;
  v_gap := greatest(0, floor(extract(epoch from (now() - coalesce(v_row.paused_at, now()))))::integer);
  update public.point_promotion_orders
     set order_status = 'active',
         paused_at = null,
         paused_seconds_total = paused_seconds_total + v_gap,
         end_at = end_at + make_interval(secs => v_gap)
   where id = p_order_id
  returning end_at into v_row;
  return jsonb_build_object('ok', true, 'order_status', 'active', 'end_at', v_row.end_at, 'extended_seconds', v_gap);
end; $$;

-- 홍보 종료 (관리자). p_fault: operator = 운영 귀책 → 남은 노출 비례 환급 / member·none = 환급 없음.
-- p_preview = true 면 계산만 하고 바꾸지 않는다 (시트 미리보기).
create or replace function public.admin_promotion_end(
  p_order_id uuid,
  p_actor_id uuid,
  p_reason_code text,
  p_fault text,
  p_reason text,
  p_preview boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_paid integer;
  v_total numeric;
  v_paused numeric;
  v_used numeric;
  v_remaining numeric;
  v_refund integer := 0;
  v_ledger uuid;
  v_sum integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(p_fault, '') not in ('operator', 'member', 'none') then
    return jsonb_build_object('ok', false, 'error', 'fault_required');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.order_status not in ('active', 'paused') then
    return jsonb_build_object('ok', false, 'error', 'not_running');
  end if;

  select abs(amount) into v_paid
    from public.point_ledger
   where related_type = 'promotion_order' and related_id = p_order_id::text and entry_type = 'spend'
   order by created_at limit 1;

  v_total := greatest(1, v_row.duration_days) * 86400.0;
  v_paused := coalesce(v_row.paused_seconds_total, 0)
    + case when v_row.order_status = 'paused' and v_row.paused_at is not null
           then greatest(0, extract(epoch from (now() - v_row.paused_at))) else 0 end;
  v_used := greatest(0, extract(epoch from (now() - v_row.start_at)) - v_paused);
  v_remaining := greatest(0, least(v_total, v_total - v_used));

  if p_fault = 'operator' and coalesce(v_paid, 0) > 0 then
    v_refund := floor(v_paid * v_remaining / v_total)::integer;
  end if;

  if p_preview then
    return jsonb_build_object('ok', true, 'preview', true, 'refund_points', v_refund,
      'paid_points', coalesce(v_paid, 0), 'remaining_seconds', floor(v_remaining),
      'has_payment_record', v_paid is not null);
  end if;

  if v_refund > 0 then
    perform 1 from public.profiles where id = v_row.user_id for update;
    v_sum := public.sum_user_point_ledger(v_row.user_id);
    insert into public.point_ledger
      (user_id, entry_type, amount, balance_after, related_type, related_id, description,
       actor_type, actor_id)
    values
      (v_row.user_id, 'refund', v_refund, v_sum + v_refund, 'promotion_order', p_order_id::text,
       '홍보 종료 환급 (운영 사유)', 'admin', p_actor_id)
    returning id into v_ledger;
    perform public.project_user_point_balance_from_ledger(v_row.user_id);
  end if;

  update public.point_promotion_orders
     set order_status = 'ended',
         ended_at = now(),
         end_at = least(end_at, now()),
         paused_at = null,
         paused_seconds_total = floor(v_paused)::integer,
         ended_by = p_actor_id,
         end_reason_code = left(coalesce(p_reason_code, 'admin_end'), 64),
         fault = p_fault,
         review_reason = left(trim(p_reason), 500),
         refund_points = v_refund,
         refund_ledger_id = v_ledger
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_status', 'ended', 'refund_points', v_refund,
    'refund_ledger_id', v_ledger, 'has_payment_record', v_paid is not null);
end; $$;

revoke all on function public.admin_promotion_pause(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_promotion_resume(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_promotion_end(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_promotion_pause(uuid, uuid) to service_role;
grant execute on function public.admin_promotion_resume(uuid, uuid) to service_role;
grant execute on function public.admin_promotion_end(uuid, uuid, text, text, text, boolean) to service_role;
