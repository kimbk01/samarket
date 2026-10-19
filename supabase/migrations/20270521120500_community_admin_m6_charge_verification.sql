-- 커뮤니티 Admin M6 (C-05, C-22 P0): 충전 승인 전 입금 확인 근거·확인자 기록, 반려 사유.
-- 기존 승인 RPC(approve_user_point_charge_request)의 잠금·상태 검사·원장 기록은 그대로 쓰고,
-- 같은 트랜잭션에서 확인 정보를 먼저 기록한다. 승인이 실패하면 확인 정보도 함께 취소된다.
alter table public.point_charge_requests
  add column if not exists verified_by uuid,
  add column if not exists verified_at timestamptz,
  add column if not exists verification_note text,
  add column if not exists reject_reason text;

-- 원장에 실행한 관리자 ID (M7 에서 관리자 지급·회수도 기록).
alter table public.point_ledger add column if not exists actor_id uuid;

-- 같은 충전 신청으로 원장 충전이 두 번 생기지 않게 (운영 중복 0 확인).
create unique index if not exists uq_point_ledger_point_charge_once
  on public.point_ledger (related_type, related_id)
  where related_type = 'point_charge' and entry_type = 'charge';

create or replace function public.approve_user_point_charge_request_verified(
  p_request_id uuid,
  p_admin_user_id uuid,
  p_verification_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(length(trim(p_verification_note)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'verification_required');
  end if;

  update public.point_charge_requests
     set verified_by = p_admin_user_id,
         verified_at = now(),
         verification_note = left(trim(p_verification_note), 500)
   where id = p_request_id
     and request_status in ('pending', 'waiting_confirm', 'on_hold');

  v_res := public.approve_user_point_charge_request(p_request_id, p_admin_user_id);
  if coalesce((v_res ->> 'ok')::boolean, false) is not true then
    raise exception 'charge_approve_failed:%', coalesce(v_res ->> 'error', 'unknown')
      using errcode = 'P0001';
  end if;

  update public.point_ledger
     set actor_id = p_admin_user_id
   where related_type = 'point_charge'
     and related_id = p_request_id::text
     and entry_type = 'charge';

  return v_res;
exception
  when sqlstate 'P0001' then
    if sqlerrm like 'charge_approve_failed:%' then
      return jsonb_build_object('ok', false, 'error', substr(sqlerrm, length('charge_approve_failed:') + 1));
    end if;
    raise;
end;
$$;

revoke all on function public.approve_user_point_charge_request_verified(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_user_point_charge_request_verified(uuid, uuid, text) to service_role;
