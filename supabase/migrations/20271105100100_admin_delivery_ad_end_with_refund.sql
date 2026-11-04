-- 광고 수정 설계 2026-11-04 · D-13 (배달 배너·매장 홍보 진행 중 운영 귀책 종료 = 남은 기간 비례 비즈니스 캐시 환급)
-- 근거: docs/audit/ads-fix-design-2026-11-04.md §4 D-13 · §7 원장 규칙
-- 운영 정의 재사용(2026-11-04 pg_get_functiondef 확인):
--   · business_cash_delivery_ad_refund — 잔액 UPDATE + business_cash_ledger INSERT(AD_REFUND · credit) 형태
--   · admin_delivery_ad_transition 'end' — lifecycle ENDED · is_active false · ended_at · updated_by_user_id · 허용 전이
--     (ACTIVE|SCHEDULED|PAUSED_ADMIN|PAUSED_OWNER → ENDED) · delivery_ad_audit_logs 1행
--   전이 함수를 그대로 부르면 감사 행에 귀책·환급액을 넣을 수 없어서, 'end' 갱신을 같은 칸으로 직접 하고 감사 1행에 모두 적는다.
--
-- 규칙
--   · 금액 = floor(선차감액(delivery_ad_canonical_bc_fundings.amount_minor, status SECURED) × 남은 초 / 전체 초)
--     전체 초 = end_at − start_at · 남은 초 = end_at − max(now, start_at) (정지 시간 보전은 §7 「이번 범위 밖」)
--   · 귀책 operator 만 환급. owner(사장님)·member·none = 0. 운영자 자체 배너(DIBAY_FIRST_PARTY)·선차감 없음 = 0
--   · 원장 idempotency_key = 'delivery-ad-end-refund:<campaignId>' (business_cash_ledger_idem_uidx UNIQUE) → 1회
--   · funding 행은 SECURED 그대로 둔다(부분 환급 — REFUNDED 는 「전액 환급」 의미라 쓰지 않음). 종료된 캠페인은
--     다른 환급 경로(반려·만료 REJECTED·고아 DRAFT)에 들어가지 않는다(운영 정의 확인).
--   · 캠페인 ENDED + 원장 + 잔액 + 배달 감사표 1행 한 트랜잭션. 매장 수수료 표는 건드리지 않는다.
--   · p_preview=true 면 아무것도 바꾸지 않고 금액만 돌려준다.
--
-- 롤백 SQL
--   drop function if exists public.admin_delivery_ad_end_with_refund(uuid, uuid, text, text, boolean);
--   (환급 원장 행은 business_cash_ledger_no_update 트리거로 지울 수 없다 — 되돌릴 때는 ADMIN_ADJUST debit 원장으로만)

create or replace function public.admin_delivery_ad_end_with_refund(
  p_campaign_id uuid,
  p_admin_id uuid,
  p_fault text,
  p_reason text,
  p_preview boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_from text;
  v_source text;
  v_start timestamptz;
  v_end timestamptz;
  v_updated timestamptz;
  v_store uuid;
  v_fund public.delivery_ad_canonical_bc_fundings%rowtype;
  v_paid bigint := 0;
  v_total numeric;
  v_remaining numeric;
  v_refund bigint := 0;
  v_bal bigint;
  v_ledger uuid;
  v_audit uuid;
  v_now timestamptz := now();
  v_key text := 'delivery-ad-end-refund:' || p_campaign_id::text;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_admin_id is null or p_campaign_id is null or not public.is_platform_admin(p_admin_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(p_fault, '') not in ('operator', 'owner', 'member', 'none') then
    return jsonb_build_object('ok', false, 'error', 'fault_required');
  end if;
  if v_reason is null or length(v_reason) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  select lifecycle_status, coalesce(campaign_source, 'OWNER_PAID'), start_at, end_at, updated_at, store_id
    into v_from, v_source, v_start, v_end, v_updated, v_store
    from public.store_banner_ad_campaigns where id = p_campaign_id for update;
  if found then
    v_kind := 'banner';
  else
    select lifecycle_status, coalesce(campaign_source, 'OWNER_PAID'), start_at, end_at, updated_at, store_id
      into v_from, v_source, v_start, v_end, v_updated, v_store
      from public.store_paid_ad_campaigns where id = p_campaign_id for update;
    if found then
      v_kind := 'store_sponsored';
    end if;
  end if;
  if v_kind is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_from in ('ENDED', 'TERMINATED', 'ARCHIVED') then
    return jsonb_build_object('ok', false, 'error', 'already_ended');
  end if;
  if v_from not in ('ACTIVE', 'SCHEDULED', 'PAUSED_ADMIN', 'PAUSED_OWNER') then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from);
  end if;

  select * into v_fund from public.delivery_ad_canonical_bc_fundings
   where product_kind = v_kind and application_id = p_campaign_id
   for update;
  if found and v_fund.status = 'SECURED' and v_source <> 'DIBAY_FIRST_PARTY' then
    v_paid := v_fund.amount_minor;
  end if;

  v_total := greatest(1, extract(epoch from (v_end - v_start)));
  v_remaining := greatest(0, least(v_total, extract(epoch from (v_end - greatest(v_now, v_start)))));
  if p_fault = 'operator' and v_paid > 0 then
    v_refund := floor(v_paid * v_remaining / v_total)::bigint;
  end if;

  if p_preview then
    return jsonb_build_object('ok', true, 'preview', true, 'refund_amount', v_refund,
      'paid_amount', v_paid, 'remaining_seconds', floor(v_remaining)::integer, 'product_kind', v_kind);
  end if;

  if exists (select 1 from public.business_cash_ledger where idempotency_key = v_key) then
    return jsonb_build_object('ok', false, 'error', 'already_ended');
  end if;

  if v_kind = 'banner' then
    update public.store_banner_ad_campaigns
       set lifecycle_status = 'ENDED', is_active = false, ended_at = v_now,
           updated_by_user_id = p_admin_id, updated_at = v_now
     where id = p_campaign_id;
  else
    update public.store_paid_ad_campaigns
       set lifecycle_status = 'ENDED', is_active = false, ended_at = v_now,
           updated_by_user_id = p_admin_id, updated_at = v_now
     where id = p_campaign_id;
  end if;

  if v_refund > 0 then
    perform public.ensure_business_cash_account(v_fund.store_id);
    update public.business_cash_accounts
       set balance_minor = balance_minor + v_refund, updated_at = v_now
     where store_id = v_fund.store_id
     returning balance_minor into v_bal;
    insert into public.business_cash_ledger (
      store_id, entry_kind, direction, amount_minor, balance_after_minor,
      related_type, related_id, idempotency_key, actor_type, actor_user_id, meta
    ) values (
      v_fund.store_id, 'AD_REFUND', 'credit', v_refund, v_bal,
      'delivery_ad_canonical_bc_fundings', v_fund.id::text, v_key, 'admin', p_admin_id,
      jsonb_build_object('reason', 'operator_end', 'campaign_id', p_campaign_id, 'product_kind', v_kind,
                         'paid_amount', v_paid, 'remaining_seconds', floor(v_remaining)::integer,
                         'total_seconds', floor(v_total)::integer)
    ) returning id into v_ledger;
  end if;

  insert into public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, reason, before_json, after_json
  ) values (
    v_kind, p_campaign_id, 'admin', p_admin_id, 'ended_admin', v_reason,
    jsonb_build_object('lifecycle', v_from, 'updated_at', v_updated),
    jsonb_build_object('lifecycle', 'ENDED', 'action', 'end', 'fault', p_fault,
                       'refund_amount', v_refund, 'paid_amount', v_paid,
                       'remaining_seconds', floor(v_remaining)::integer, 'refund_ledger_id', v_ledger)
  ) returning id into v_audit;

  return jsonb_build_object('ok', true, 'preview', false, 'refund_amount', v_refund,
    'paid_amount', v_paid, 'remaining_seconds', floor(v_remaining)::integer,
    'product_kind', v_kind, 'refund_ledger_id', v_ledger, 'audit_id', v_audit);
end;
$$;

revoke all on function public.admin_delivery_ad_end_with_refund(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_delivery_ad_end_with_refund(uuid, uuid, text, text, boolean) to service_role;
