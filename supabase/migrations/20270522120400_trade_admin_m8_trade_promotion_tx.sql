-- 거래 Admin M8 (D-07·D-08·D-21·D-23, 설계 v2 §G-0): 거래 홍보 조치 = DB 함수 1번 = 트랜잭션 1개.
-- 함수 안 순서: 주문 행 잠금 → domain='trade' 확인 → 상태 조건 → (금전) 회원 행 잠금·잔액 검사·원장 1회 →
-- 보류 행 상태 → 주문 상태 → 감사 기록. 감사 INSERT 가 실패하면 함수 전체가 롤백된다.
-- 커뮤니티 함수(M9 admin_promotion_*)와 화면은 바꾸지 않는다.
--
-- 원장 형식은 기존 앱 경로와 같다:
--   즉시 구매   spend         related_id = {order}
--   승인형 신청 ad_hold       related_id = hold:{order}     (promotion_point_holds 1행)
--   승인        ad_purchase   related_id = capture:{order}  (금액 0, 확정 기록)
--   반려        ad_hold_release related_id = release:{hold}
--   종료 환급   refund        related_id = {order}          (기존 uq_point_ledger_promotion_refund_once)

-- 같은 주문에 같은 종류 원장이 두 번 생기지 않게 (운영 기존 중복 0 확인)
create unique index if not exists uq_point_ledger_promotion_order_once
  on public.point_ledger (related_type, related_id, entry_type)
  where related_type = 'promotion_order' and entry_type in ('spend', 'ad_hold', 'ad_purchase', 'ad_hold_release');

create unique index if not exists uq_promotion_point_holds_order
  on public.promotion_point_holds (promotion_order_id);

-- 내부: 거래 홍보 감사 기록
create or replace function public.trade_promotion_audit(
  p_actor_type text, p_actor_id uuid, p_order_id uuid, p_action text,
  p_before jsonb, p_after jsonb, p_ip text, p_user_agent text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json, ip, user_agent)
  values (p_actor_type, p_actor_id, 'trade_promotion_order', p_order_id::text, 'trade_promotion_order.' || p_action,
          p_before, p_after, left(p_ip, 80), left(p_user_agent, 500));
$$;
revoke all on function public.trade_promotion_audit(text, uuid, uuid, text, jsonb, jsonb, text, text) from public, anon, authenticated;

-- ── 회원 승인형 신청: 주문 + 보류(잔액 검사) 한 번에 ──
create or replace function public.request_trade_promotion_review(
  p_user_id uuid,
  p_post_id uuid,
  p_product_id text,
  p_placement text,
  p_duration_days integer,
  p_point_cost integer,
  p_target_title text,
  p_user_nickname text,
  p_idempotency_key text,
  p_hold_label text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_order uuid;
  v_sum integer;
  v_cost integer := greatest(0, coalesce(p_point_cost, 0));
  v_days integer := greatest(1, coalesce(p_duration_days, 7));
  v_hold uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_user_id is null or p_post_id is null or coalesce(trim(p_idempotency_key), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'user_not_found'); end if;

  select id, order_status, end_at, point_cost, product_id into v_existing
    from public.point_promotion_orders
   where user_id = p_user_id and idempotency_key = trim(p_idempotency_key);
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'order_id', v_existing.id,
      'order_status', v_existing.order_status, 'end_at', v_existing.end_at,
      'point_cost', v_existing.point_cost, 'product_id', v_existing.product_id);
  end if;

  if exists (select 1 from public.point_promotion_orders
              where target_id = p_post_id::text and domain = 'trade'
                and order_status in ('pending_review', 'active', 'paused')) then
    return jsonb_build_object('ok', false, 'error', 'already_active_promotion');
  end if;

  v_sum := public.sum_user_point_ledger(p_user_id);
  if v_cost > 0 and v_sum < v_cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance');
  end if;

  insert into public.point_promotion_orders
    (user_id, user_nickname, target_type, target_id, target_title, placement, duration_days, point_cost,
     order_status, start_at, end_at, product_id, domain, idempotency_key)
  values
    (p_user_id, left(coalesce(p_user_nickname, ''), 120), 'product', p_post_id::text, left(coalesce(p_target_title, ''), 500),
     p_placement, v_days, v_cost, 'pending_review', now(), now() + make_interval(days => v_days),
     p_product_id, 'trade', trim(p_idempotency_key))
  returning id into v_order;

  if v_cost > 0 then
    insert into public.point_ledger
      (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type)
    values
      (p_user_id, 'ad_hold', -v_cost, v_sum - v_cost, 'promotion_order', 'hold:' || v_order::text,
       left(coalesce(p_hold_label, '거래 더 알리기 신청 — 포인트 보류'), 500), 'system');
    insert into public.promotion_point_holds (user_id, promotion_order_id, amount, status)
    values (p_user_id, v_order, v_cost, 'held')
    returning id into v_hold;
    perform public.project_user_point_balance_from_ledger(p_user_id);
  end if;

  perform public.trade_promotion_audit('user', p_user_id, v_order, 'request_review', null,
    jsonb_build_object('order_status', 'pending_review', 'point_cost', v_cost, 'hold_id', v_hold, 'post_id', p_post_id),
    null, null);

  return jsonb_build_object('ok', true, 'duplicate', false, 'order_id', v_order, 'order_status', 'pending_review',
    'end_at', now() + make_interval(days => v_days), 'point_cost', v_cost, 'product_id', p_product_id, 'hold_id', v_hold);
end;
$$;

-- ── 관리자 승인: 보류 → 확정, 노출 기간 시작 ──
create or replace function public.admin_trade_promotion_approve(
  p_order_id uuid, p_actor_id uuid, p_reason text default null, p_ip text default null, p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_hold record;
  v_end timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.domain <> 'trade' then return jsonb_build_object('ok', false, 'error', 'not_trade'); end if;
  if v_row.order_status <> 'pending_review' then
    return jsonb_build_object('ok', false, 'error', 'already_processed', 'order_status', v_row.order_status);
  end if;

  select * into v_hold from public.promotion_point_holds where promotion_order_id = p_order_id for update;
  if coalesce(v_row.point_cost, 0) > 0 then
    if not found or v_hold.status <> 'held' then
      return jsonb_build_object('ok', false, 'error', 'hold_missing');
    end if;
    update public.promotion_point_holds set status = 'captured', updated_at = now() where id = v_hold.id;
    insert into public.point_ledger
      (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id)
    values
      (v_row.user_id, 'ad_purchase', 0, public.sum_user_point_ledger(v_row.user_id), 'promotion_order',
       'capture:' || p_order_id::text, '거래 더 알리기 승인 — ' || v_hold.amount || 'P 확정', 'admin', p_actor_id);
  end if;

  v_end := now() + make_interval(days => greatest(1, coalesce(v_row.duration_days, 7)));
  update public.point_promotion_orders
     set order_status = 'active', start_at = now(), end_at = v_end, review_reason = nullif(left(trim(coalesce(p_reason, '')), 500), '')
   where id = p_order_id;

  perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'approve',
    jsonb_build_object('order_status', v_row.order_status),
    jsonb_build_object('order_status', 'active', 'end_at', v_end, 'captured_points', coalesce(v_hold.amount, 0),
                       'reason', nullif(trim(coalesce(p_reason, '')), '')),
    p_ip, p_user_agent);

  return jsonb_build_object('ok', true, 'order_status', 'active', 'end_at', v_end);
end;
$$;

-- ── 관리자 반려: 보류 전액 해제 ──
create or replace function public.admin_trade_promotion_reject(
  p_order_id uuid, p_actor_id uuid, p_reason text, p_ip text default null, p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_hold record;
  v_released integer := 0;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.domain <> 'trade' then return jsonb_build_object('ok', false, 'error', 'not_trade'); end if;
  if v_row.order_status <> 'pending_review' then
    return jsonb_build_object('ok', false, 'error', 'already_processed', 'order_status', v_row.order_status);
  end if;

  select * into v_hold from public.promotion_point_holds where promotion_order_id = p_order_id for update;
  if found and v_hold.status = 'held' and v_hold.amount > 0 then
    perform 1 from public.profiles where id = v_hold.user_id for update;
    update public.promotion_point_holds set status = 'released', updated_at = now() where id = v_hold.id;
    insert into public.point_ledger
      (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id)
    values
      (v_hold.user_id, 'ad_hold_release', v_hold.amount, public.sum_user_point_ledger(v_hold.user_id) + v_hold.amount,
       'promotion_order', 'release:' || v_hold.id::text, '거래 더 알리기 반려 — 보류 해제', 'admin', p_actor_id);
    perform public.project_user_point_balance_from_ledger(v_hold.user_id);
    v_released := v_hold.amount;
  end if;

  update public.point_promotion_orders
     set order_status = 'rejected', review_reason = left(trim(p_reason), 500),
         ended_by = p_actor_id, ended_at = now(), end_reason_code = 'admin_reject'
   where id = p_order_id;

  perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'reject',
    jsonb_build_object('order_status', v_row.order_status),
    jsonb_build_object('order_status', 'rejected', 'released_points', v_released, 'reason', left(trim(p_reason), 500)),
    p_ip, p_user_agent);

  return jsonb_build_object('ok', true, 'order_status', 'rejected', 'released_points', v_released);
end;
$$;

-- ── 중지 · 재개 (재개 시 중지 시간만큼 종료일 연장) ──
create or replace function public.admin_trade_promotion_pause(
  p_order_id uuid, p_actor_id uuid, p_reason text, p_ip text default null, p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.domain <> 'trade' then return jsonb_build_object('ok', false, 'error', 'not_trade'); end if;
  if v_row.order_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'already_processed', 'order_status', v_row.order_status);
  end if;
  update public.point_promotion_orders set order_status = 'paused', paused_at = now() where id = p_order_id;
  perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'pause',
    jsonb_build_object('order_status', 'active'), jsonb_build_object('order_status', 'paused', 'reason', left(trim(p_reason), 500)),
    p_ip, p_user_agent);
  return jsonb_build_object('ok', true, 'order_status', 'paused', 'end_at', v_row.end_at);
end;
$$;

create or replace function public.admin_trade_promotion_resume(
  p_order_id uuid, p_actor_id uuid, p_reason text, p_ip text default null, p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_gap integer;
  v_end timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.domain <> 'trade' then return jsonb_build_object('ok', false, 'error', 'not_trade'); end if;
  if v_row.order_status <> 'paused' then
    return jsonb_build_object('ok', false, 'error', 'already_processed', 'order_status', v_row.order_status);
  end if;
  v_gap := greatest(0, floor(extract(epoch from (now() - coalesce(v_row.paused_at, now()))))::integer);
  update public.point_promotion_orders
     set order_status = 'active', paused_at = null,
         paused_seconds_total = coalesce(paused_seconds_total, 0) + v_gap,
         end_at = end_at + make_interval(secs => v_gap)
   where id = p_order_id
  returning end_at into v_end;
  perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'resume',
    jsonb_build_object('order_status', 'paused', 'end_at', v_row.end_at),
    jsonb_build_object('order_status', 'active', 'end_at', v_end, 'extended_seconds', v_gap, 'reason', left(trim(p_reason), 500)),
    p_ip, p_user_agent);
  return jsonb_build_object('ok', true, 'order_status', 'active', 'end_at', v_end, 'extended_seconds', v_gap);
end;
$$;

-- ── 종료: 귀책 operator 면 남은 노출 비례 환급 (즉시 구매 spend · 승인형 확정 보류 둘 다 인정) ──
create or replace function public.admin_trade_promotion_end(
  p_order_id uuid,
  p_actor_id uuid,
  p_reason_code text,
  p_fault text,
  p_reason text,
  p_preview boolean default false,
  p_ip text default null,
  p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  if v_row.domain <> 'trade' then return jsonb_build_object('ok', false, 'error', 'not_trade'); end if;
  if v_row.order_status not in ('active', 'paused') then
    return jsonb_build_object('ok', false, 'error', 'already_processed', 'order_status', v_row.order_status);
  end if;

  select abs(amount) into v_paid from public.point_ledger
   where related_type = 'promotion_order' and related_id = p_order_id::text and entry_type = 'spend'
   order by created_at limit 1;
  if v_paid is null then
    select h.amount into v_paid from public.promotion_point_holds h
     where h.promotion_order_id = p_order_id and h.status = 'captured';
  end if;

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
      (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id)
    values
      (v_row.user_id, 'refund', v_refund, v_sum + v_refund, 'promotion_order', p_order_id::text,
       '거래 더 알리기 종료 환급 (운영 사유)', 'admin', p_actor_id)
    returning id into v_ledger;
    perform public.project_user_point_balance_from_ledger(v_row.user_id);
  end if;

  update public.point_promotion_orders
     set order_status = 'ended', ended_at = now(), end_at = least(end_at, now()), paused_at = null,
         paused_seconds_total = floor(v_paused)::integer, ended_by = p_actor_id,
         end_reason_code = left(coalesce(p_reason_code, 'admin_end'), 64), fault = p_fault,
         review_reason = left(trim(p_reason), 500), refund_points = v_refund, refund_ledger_id = v_ledger
   where id = p_order_id;

  perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'end',
    jsonb_build_object('order_status', v_row.order_status, 'end_at', v_row.end_at),
    jsonb_build_object('order_status', 'ended', 'fault', p_fault, 'refund_points', v_refund,
                       'refund_ledger_id', v_ledger, 'reason', left(trim(p_reason), 500)),
    p_ip, p_user_agent);

  return jsonb_build_object('ok', true, 'order_status', 'ended', 'refund_points', v_refund,
    'refund_ledger_id', v_ledger, 'has_payment_record', v_paid is not null);
end;
$$;

-- ── 만료 (cron): 기간이 끝난 진행 중 거래 홍보 → expired. 행마다 잠금·조건·감사 ──
create or replace function public.expire_trade_promotion_orders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_n integer := 0;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  for v_row in
    select id, end_at from public.point_promotion_orders
     where domain = 'trade' and order_status = 'active' and end_at < now()
     order by end_at
     limit 500
     for update skip locked
  loop
    update public.point_promotion_orders
       set order_status = 'expired', ended_at = coalesce(ended_at, v_row.end_at), end_reason_code = coalesce(end_reason_code, 'expired')
     where id = v_row.id and order_status = 'active';
    perform public.trade_promotion_audit('system', null, v_row.id, 'expire',
      jsonb_build_object('order_status', 'active', 'end_at', v_row.end_at),
      jsonb_build_object('order_status', 'expired'), null, null);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'expired', v_n);
end;
$$;

revoke all on function public.request_trade_promotion_review(uuid, uuid, text, text, integer, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_trade_promotion_approve(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_trade_promotion_reject(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_trade_promotion_pause(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_trade_promotion_resume(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_trade_promotion_end(uuid, uuid, text, text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.expire_trade_promotion_orders() from public, anon, authenticated;
grant execute on function public.request_trade_promotion_review(uuid, uuid, text, text, integer, integer, text, text, text, text) to service_role;
grant execute on function public.admin_trade_promotion_approve(uuid, uuid, text, text, text) to service_role;
grant execute on function public.admin_trade_promotion_reject(uuid, uuid, text, text, text) to service_role;
grant execute on function public.admin_trade_promotion_pause(uuid, uuid, text, text, text) to service_role;
grant execute on function public.admin_trade_promotion_resume(uuid, uuid, text, text, text) to service_role;
grant execute on function public.admin_trade_promotion_end(uuid, uuid, text, text, text, boolean, text, text) to service_role;
grant execute on function public.expire_trade_promotion_orders() to service_role;
