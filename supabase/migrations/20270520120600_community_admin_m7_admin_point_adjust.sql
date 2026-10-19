-- 커뮤니티 Admin M7 (C-04, C-06 P0): 관리자 포인트 지급·회수를 원자 RPC 로.
-- 누가(actor_id) · 같은 요청 1회(idempotency_key unique) · 회원 행 잠금 후 잔액 확인(동시 회수 음수 방지).
-- 기존 admin_manual 행은 related_id 중복이 있어(레거시 7묶음) 새 컬럼에만 unique 를 건다.
alter table public.point_ledger
  add column if not exists actor_id uuid,
  add column if not exists idempotency_key text;

create unique index if not exists uq_point_ledger_idempotency_key
  on public.point_ledger (related_type, idempotency_key)
  where idempotency_key is not null;

create or replace function public.admin_adjust_user_points(
  p_user_id uuid,
  p_delta integer,
  p_description text,
  p_actor_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_sum integer;
  v_after integer;
  v_id uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_user_id is null or p_actor_id is null or coalesce(p_delta, 0) = 0
     or coalesce(length(trim(p_description)), 0) < 2
     or coalesce(length(trim(p_idempotency_key)), 0) < 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  select id, amount into v_existing
    from public.point_ledger
   where related_type = 'admin_manual' and idempotency_key = p_idempotency_key
   limit 1;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'ledger_id', v_existing.id,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id));
  end if;

  v_sum := public.sum_user_point_ledger(p_user_id);
  if p_delta < 0 and v_sum < abs(p_delta) then
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', v_sum);
  end if;
  v_after := v_sum + p_delta;

  insert into public.point_ledger
    (user_id, entry_type, amount, balance_after, related_type, related_id, description,
     actor_type, actor_id, idempotency_key)
  values
    (p_user_id, case when p_delta > 0 then 'admin_credit' else 'admin_debit' end, p_delta, v_after,
     'admin_manual', p_idempotency_key, left(trim(p_description), 500), 'admin', p_actor_id,
     p_idempotency_key)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'duplicate', false, 'ledger_id', v_id,
    'balance_before', v_sum,
    'balance_after', public.project_user_point_balance_from_ledger(p_user_id));
end;
$$;

revoke all on function public.admin_adjust_user_points(uuid, integer, text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_adjust_user_points(uuid, integer, text, uuid, text) to service_role;
