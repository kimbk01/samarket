-- 광고 수정 설계 2026-11-04 · D-5 (정지 기간 보전 · 운영 귀책 비례 환급 · 회원 귀책 0) · FB-M11 (paused_by/paused_at) · D-6 (public_reason)
-- 근거: docs/audit/ads-fix-design-2026-11-04.md §4 D-5 · §3 FB-M11 · §6 · §7 원장 규칙
-- 상위노출 admin_promotion_pause/resume/end (20270521120800_community_admin_m9_promotion_refund.sql · 운영 정의 2026-11-04 확인) 와 같은 방식.
--
-- 바꾸는 것
--   1) feed_ad_campaigns 칸 추가: paused_by('admin'|'member'|'system') · paused_at · public_reason(회원에게 보이는 1줄) ·
--      paused_seconds_total(환급 비율 계산용 — 재개 때 연장한 정지 초 누계, 회원 유료만)
--      기존 status='paused' 행은 paused_by='admin' (운영 2026-11-04: ADMIN_DIRECT 9행 · 회원 유료 0행)
--   2) public.admin_feed_ad_pause / admin_feed_ad_resume / admin_feed_ad_end (security definer · service_role 만 execute)
--      결제액 = 원장 실제 차감 합(related_type='feed_ad_request'):
--        신청 보류 hold:<requestId>(ad_hold, 음수) + 연장 renew:<campaignId>:<key>(ad_purchase, 음수)
--        − 되돌림 release:<holdId> · compensate:<holdId> · hold_insert_fail_release:<requestId> · renew-refund:<campaignId>:<key>
--        (lib/ads/feed-ad-request-point-flow.ts · lib/ads/renew-feed-ad-campaign.ts 의 related_id 규칙)
--      환급 원장 = entry_type 'ad_refund' · related_id 'feed-ad-end-refund:<campaignId>' 고정
--        → 기존 고유 인덱스 point_ledger_refund_release_once_uidx (user_id, related_type, related_id, entry_type) 로 1회 보장
--      상태 변경 + 원장 + 잔액(profiles.points 투영) + 감사(audit_logs feed_ad_request.<조치>) 한 트랜잭션
--
-- 롤백 SQL (운영 적용 후 되돌릴 때)
--   drop function if exists public.admin_feed_ad_end(uuid, uuid, text, text, text, boolean);
--   drop function if exists public.admin_feed_ad_resume(uuid, uuid, text, text);
--   drop function if exists public.admin_feed_ad_pause(uuid, uuid, text, text);
--   alter table public.feed_ad_campaigns drop constraint if exists feed_ad_campaigns_paused_by_check;
--   alter table public.feed_ad_campaigns drop column if exists paused_seconds_total, drop column if exists public_reason,
--     drop column if exists paused_at, drop column if exists paused_by;
--   (환급 원장 행은 지우지 않는다 — 원장은 append-only. 잘못 환급했으면 별도 조정 원장으로만 처리)

alter table public.feed_ad_campaigns
  add column if not exists paused_by text,
  add column if not exists paused_at timestamptz,
  add column if not exists public_reason text,
  add column if not exists paused_seconds_total integer not null default 0;

alter table public.feed_ad_campaigns drop constraint if exists feed_ad_campaigns_paused_by_check;
alter table public.feed_ad_campaigns add constraint feed_ad_campaigns_paused_by_check
  check (paused_by is null or paused_by in ('admin', 'member', 'system'));

-- FB-M11: 「paused = 관리자」 추정을 칸으로 고정 (지금 paused 행은 모두 관리자 정지)
update public.feed_ad_campaigns
   set paused_by = 'admin'
 where status = 'paused' and paused_by is null;

-- ─────────────────────────────────────────────────────────────
-- 정지: active|scheduled → paused (paused_by='admin', paused_at=now)
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_feed_ad_pause(
  p_campaign_id uuid,
  p_admin_id uuid,
  p_public_reason text,
  p_internal_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.feed_ad_campaigns%rowtype;
  v_public text := nullif(left(btrim(coalesce(p_public_reason, '')), 120), '');
  v_internal text := nullif(left(btrim(coalesce(p_internal_reason, '')), 500), '');
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into v_row from public.feed_ad_campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_row.status not in ('active', 'scheduled') then
    return jsonb_build_object('ok', false, 'error', 'not_active', 'status', v_row.status);
  end if;

  update public.feed_ad_campaigns
     set status = 'paused', paused_by = 'admin', paused_at = now(),
         public_reason = v_public, updated_at = now()
   where id = p_campaign_id;

  insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  values (
    case when p_admin_id is null then 'system' else 'admin' end, p_admin_id,
    'feed_ad_request', p_campaign_id::text, 'feed_ad_request.pause',
    jsonb_build_object('status', v_row.status, 'end_at', v_row.end_at, 'request_id', v_row.request_id),
    jsonb_build_object('status', 'paused', 'paused_by', 'admin', 'paused_at', now(), 'campaign_id', p_campaign_id,
                       'reason_public', v_public, 'reason_internal', v_internal)
  );

  return jsonb_build_object('ok', true, 'status', 'paused', 'paused_at', now(), 'end_at', v_row.end_at);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 재개: paused → active. 회원 유료(MEMBER_REQUESTED)만 paused_at 부터 지금까지 end_at 연장. 관리자 직접 등록 연장 0.
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_feed_ad_resume(
  p_campaign_id uuid,
  p_admin_id uuid,
  p_public_reason text,
  p_internal_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.feed_ad_campaigns%rowtype;
  v_public text := nullif(left(btrim(coalesce(p_public_reason, '')), 120), '');
  v_internal text := nullif(left(btrim(coalesce(p_internal_reason, '')), 500), '');
  v_gap integer;
  v_ext integer := 0;
  v_new_end timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into v_row from public.feed_ad_campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_row.status <> 'paused' then
    return jsonb_build_object('ok', false, 'error', 'not_paused', 'status', v_row.status);
  end if;

  v_gap := greatest(0, floor(extract(epoch from (now() - coalesce(v_row.paused_at, now())))))::integer;
  if v_row.source = 'MEMBER_REQUESTED' and v_row.end_at is not null then
    v_ext := v_gap;
  end if;
  v_new_end := case when v_ext > 0 then v_row.end_at + make_interval(secs => v_ext) else v_row.end_at end;

  if v_new_end is not null and v_new_end <= now() then
    return jsonb_build_object('ok', false, 'error', 'window_ended', 'end_at', v_row.end_at);
  end if;

  begin
    update public.feed_ad_campaigns
       set status = 'active', paused_at = null, paused_by = null,
           paused_seconds_total = coalesce(paused_seconds_total, 0) + v_ext,
           end_at = v_new_end, public_reason = v_public, updated_at = now()
     where id = p_campaign_id;
  exception when others then
    if sqlerrm = 'feed_ad_pool_capacity_full' then
      return jsonb_build_object('ok', false, 'error', 'capacity_full');
    end if;
    raise;
  end;

  if v_ext > 0 and v_row.request_id is not null then
    update public.feed_ad_requests
       set end_at = v_new_end, updated_at = now()
     where id = v_row.request_id and status in ('active', 'approved');
  end if;

  insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  values (
    case when p_admin_id is null then 'system' else 'admin' end, p_admin_id,
    'feed_ad_request', p_campaign_id::text, 'feed_ad_request.resume',
    jsonb_build_object('status', 'paused', 'paused_by', v_row.paused_by, 'paused_at', v_row.paused_at, 'end_at', v_row.end_at),
    jsonb_build_object('status', 'active', 'end_at', v_new_end, 'extended_seconds', v_ext, 'campaign_id', p_campaign_id,
                       'reason_public', v_public, 'reason_internal', v_internal)
  );

  return jsonb_build_object('ok', true, 'status', 'active', 'end_at', v_new_end, 'extended_seconds', v_ext);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 종료: fault operator|member|none. operator + 회원 유료 → floor(실제 차감 합 × 남은 초 / 전체 초) 환급 (원장 1회)
-- p_preview=true 면 아무것도 바꾸지 않고 환급액만 돌려준다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.admin_feed_ad_end(
  p_campaign_id uuid,
  p_admin_id uuid,
  p_fault text,
  p_public_reason text,
  p_internal_reason text,
  p_preview boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.feed_ad_campaigns%rowtype;
  v_user uuid;
  v_member boolean;
  v_paid integer := 0;
  v_total numeric := 0;
  v_paused numeric := 0;
  v_gap integer := 0;
  v_used numeric;
  v_remaining numeric := 0;
  v_refund integer := 0;
  v_ledger uuid;
  v_sum integer;
  v_refund_key text := 'feed-ad-end-refund:' || p_campaign_id::text;
  v_public text := nullif(left(btrim(coalesce(p_public_reason, '')), 120), '');
  v_internal text := nullif(left(btrim(coalesce(p_internal_reason, '')), 500), '');
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(p_fault, '') not in ('operator', 'member', 'none') then
    return jsonb_build_object('ok', false, 'error', 'fault_required');
  end if;
  select * into v_row from public.feed_ad_campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_row.status = 'ended' then
    return jsonb_build_object('ok', false, 'error', 'already_ended');
  end if;

  v_member := v_row.source = 'MEMBER_REQUESTED' and v_row.request_id is not null;
  if v_member then
    select user_id into v_user from public.feed_ad_requests where id = v_row.request_id;
  end if;

  if v_member and v_user is not null then
    select greatest(0, -coalesce(sum(l.amount), 0))::integer into v_paid
      from public.point_ledger l
     where l.user_id = v_user
       and l.related_type = 'feed_ad_request'
       and (
         l.related_id in ('hold:' || v_row.request_id::text, 'hold_insert_fail_release:' || v_row.request_id::text)
         or l.related_id in (
           select 'release:' || h.id::text from public.feed_ad_point_holds h where h.request_id = v_row.request_id
           union all
           select 'compensate:' || h.id::text from public.feed_ad_point_holds h where h.request_id = v_row.request_id
         )
         or l.related_id like 'renew:' || p_campaign_id::text || ':%'
         or l.related_id like 'renew-refund:' || p_campaign_id::text || ':%'
       );
  end if;

  if v_row.status = 'paused' and v_row.paused_at is not null then
    v_gap := greatest(0, floor(extract(epoch from (now() - v_row.paused_at))))::integer;
  end if;

  if v_row.start_at is not null and v_row.end_at is not null then
    v_paused := coalesce(v_row.paused_seconds_total, 0);
    v_total := greatest(1, extract(epoch from (v_row.end_at - v_row.start_at)) - v_paused);
    v_used := greatest(0, extract(epoch from (now() - v_row.start_at)) - v_paused - v_gap);
    v_remaining := greatest(0, least(v_total, v_total - v_used));
  end if;

  if p_fault = 'operator' and v_member and v_paid > 0 and v_total > 0 then
    v_refund := floor(v_paid * v_remaining / v_total)::integer;
  end if;

  if p_preview then
    return jsonb_build_object('ok', true, 'preview', true, 'refund_points', v_refund,
      'paid_points', v_paid, 'remaining_seconds', floor(v_remaining)::integer);
  end if;

  if v_refund > 0 then
    -- 중복 방지: 고유 인덱스(point_ledger_refund_release_once_uidx) + 존재 검사
    if exists (select 1 from public.point_ledger
                where user_id = v_user and related_type = 'feed_ad_request'
                  and related_id = v_refund_key and entry_type = 'ad_refund') then
      return jsonb_build_object('ok', false, 'error', 'already_ended');
    end if;
    perform 1 from public.profiles where id = v_user for update;
    v_sum := public.sum_user_point_ledger(v_user);
    insert into public.point_ledger
      (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id)
    values
      (v_user, 'ad_refund', v_refund, v_sum + v_refund, 'feed_ad_request', v_refund_key,
       '피드 배너 종료 환급 (운영 사유)', 'admin', p_admin_id)
    returning id into v_ledger;
    perform public.project_user_point_balance_from_ledger(v_user);
  end if;

  update public.feed_ad_campaigns
     set status = 'ended', end_at = now(), paused_at = null, paused_by = null,
         paused_seconds_total = coalesce(paused_seconds_total, 0) + v_gap,
         public_reason = v_public, updated_at = now()
   where id = p_campaign_id;

  -- lib/ads/sync-feed-ad-request-ended.ts 와 같은 동기화 (같은 트랜잭션)
  if v_row.request_id is not null then
    update public.feed_ad_requests
       set status = 'ended', end_at = now(),
           review_reason = left(coalesce(v_internal, v_public, 'admin_ended'), 500),
           reviewed_by = coalesce(p_admin_id, reviewed_by),
           reviewed_at = case when p_admin_id is not null then now() else reviewed_at end,
           updated_at = now()
     where id = v_row.request_id and status in ('active', 'approved', 'pending_review');
  end if;

  insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  values (
    case when p_admin_id is null then 'system' else 'admin' end, p_admin_id,
    'feed_ad_request', p_campaign_id::text, 'feed_ad_request.end',
    jsonb_build_object('status', v_row.status, 'end_at', v_row.end_at, 'paused_by', v_row.paused_by, 'request_id', v_row.request_id),
    jsonb_build_object('status', 'ended', 'campaign_id', p_campaign_id, 'fault', p_fault,
                       'refund_amount', v_refund, 'paid_points', v_paid, 'remaining_seconds', floor(v_remaining)::integer,
                       'refund_ledger_id', v_ledger, 'reason_public', v_public, 'reason_internal', v_internal)
  );

  return jsonb_build_object('ok', true, 'preview', false, 'status', 'ended', 'refund_points', v_refund,
    'paid_points', v_paid, 'remaining_seconds', floor(v_remaining)::integer, 'refund_ledger_id', v_ledger);
end;
$$;

revoke all on function public.admin_feed_ad_pause(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_feed_ad_resume(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_feed_ad_end(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_feed_ad_pause(uuid, uuid, text, text) to service_role;
grant execute on function public.admin_feed_ad_resume(uuid, uuid, text, text) to service_role;
grant execute on function public.admin_feed_ad_end(uuid, uuid, text, text, text, boolean) to service_role;
