-- D-14 (ads-reaudit3-defect-design-2026-11-07) — 피드 정지·재개·종료 감사는 DB 함수 1곳 · 1행.
--
-- 결함: 감사 행 target_type 이 늘 'feed_ad_request' 인데 target_id 는 캠페인 id (운영 11-04 15:38·15:41 UTC 확인) +
--       화면 코드(TS)가 감사를 한 번 더 써서 1조치 = 2행 (E-2).
-- 운영 현재 정의(pg_get_functiondef 2026-11-07) 와 다른 점 — 그 밖은 한 글자도 바꾸지 않았다:
--   1) 마지막 인자 p_screen text default null 추가 (기존 호출 그대로 동작).
--   2) 감사 target_type/target_id: request_id 있으면 ('feed_ad_request', request_id) · 없으면 ('feed_ad_campaign', campaign_id).
--   3) after_json.screen = p_screen.
--   action 이름(feed_ad_request.pause|resume|end)·before/after 나머지 칸·반환 모양은 그대로.
-- 시그니처가 바뀌므로 옛 함수(4·6 인자)를 drop 하고 새로 만든다. 권한은 운영과 같게: service_role 만 EXECUTE.
-- 웹 담당: TS 쪽 정지·재개·종료 감사 insert 를 지운다(이 함수만 쓴다) · p_screen 은 화면 이름.
--   ※ 웹이 p_screen 을 보내는 배포는 이 마이그레이션 적용 뒤여야 한다(적용 전이면 PostgREST 가 함수를 못 찾음).
--
-- 롤백 SQL (운영 원래 정의로 되돌림):
--   drop function if exists public.admin_feed_ad_pause(uuid, uuid, text, text, text);
--   drop function if exists public.admin_feed_ad_resume(uuid, uuid, text, text, text);
--   drop function if exists public.admin_feed_ad_end(uuid, uuid, text, text, text, boolean, text);
--   → scratchpad/db3/rollback-m1-02.sql 머리의 「원래 정의」 블록(운영 pg_get_functiondef 원문)을 실행 후
--     revoke all … from public, anon, authenticated; grant execute … to service_role; (4·6 인자)

drop function if exists public.admin_feed_ad_pause(uuid, uuid, text, text);
drop function if exists public.admin_feed_ad_resume(uuid, uuid, text, text);
drop function if exists public.admin_feed_ad_end(uuid, uuid, text, text, text, boolean);

create or replace function public.admin_feed_ad_pause(
  p_campaign_id uuid, p_admin_id uuid, p_public_reason text, p_internal_reason text, p_screen text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.feed_ad_campaigns%rowtype;
  v_public text := nullif(left(btrim(coalesce(p_public_reason, '')), 120), '');
  v_internal text := nullif(left(btrim(coalesce(p_internal_reason, '')), 500), '');
  v_screen text := nullif(left(btrim(coalesce(p_screen, '')), 120), '');
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
    case when v_row.request_id is not null then 'feed_ad_request' else 'feed_ad_campaign' end,
    coalesce(v_row.request_id, p_campaign_id)::text,
    'feed_ad_request.pause',
    jsonb_build_object('status', v_row.status, 'end_at', v_row.end_at, 'request_id', v_row.request_id),
    jsonb_build_object('status', 'paused', 'paused_by', 'admin', 'paused_at', now(), 'campaign_id', p_campaign_id,
                       'reason_public', v_public, 'reason_internal', v_internal, 'screen', v_screen)
  );

  return jsonb_build_object('ok', true, 'status', 'paused', 'paused_at', now(), 'end_at', v_row.end_at);
end;
$function$;

create or replace function public.admin_feed_ad_resume(
  p_campaign_id uuid, p_admin_id uuid, p_public_reason text, p_internal_reason text, p_screen text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.feed_ad_campaigns%rowtype;
  v_public text := nullif(left(btrim(coalesce(p_public_reason, '')), 120), '');
  v_internal text := nullif(left(btrim(coalesce(p_internal_reason, '')), 500), '');
  v_screen text := nullif(left(btrim(coalesce(p_screen, '')), 120), '');
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
    case when v_row.request_id is not null then 'feed_ad_request' else 'feed_ad_campaign' end,
    coalesce(v_row.request_id, p_campaign_id)::text,
    'feed_ad_request.resume',
    jsonb_build_object('status', 'paused', 'paused_by', v_row.paused_by, 'paused_at', v_row.paused_at, 'end_at', v_row.end_at),
    jsonb_build_object('status', 'active', 'end_at', v_new_end, 'extended_seconds', v_ext, 'campaign_id', p_campaign_id,
                       'reason_public', v_public, 'reason_internal', v_internal, 'screen', v_screen)
  );

  return jsonb_build_object('ok', true, 'status', 'active', 'end_at', v_new_end, 'extended_seconds', v_ext);
end;
$function$;

create or replace function public.admin_feed_ad_end(
  p_campaign_id uuid, p_admin_id uuid, p_fault text, p_public_reason text, p_internal_reason text,
  p_preview boolean default false, p_screen text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_screen text := nullif(left(btrim(coalesce(p_screen, '')), 120), '');
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
    case when v_row.request_id is not null then 'feed_ad_request' else 'feed_ad_campaign' end,
    coalesce(v_row.request_id, p_campaign_id)::text,
    'feed_ad_request.end',
    jsonb_build_object('status', v_row.status, 'end_at', v_row.end_at, 'paused_by', v_row.paused_by, 'request_id', v_row.request_id),
    jsonb_build_object('status', 'ended', 'campaign_id', p_campaign_id, 'fault', p_fault,
                       'refund_amount', v_refund, 'paid_points', v_paid, 'remaining_seconds', floor(v_remaining)::integer,
                       'refund_ledger_id', v_ledger, 'reason_public', v_public, 'reason_internal', v_internal,
                       'screen', v_screen)
  );

  return jsonb_build_object('ok', true, 'preview', false, 'status', 'ended', 'refund_points', v_refund,
    'paid_points', v_paid, 'remaining_seconds', floor(v_remaining)::integer, 'refund_ledger_id', v_ledger);
end;
$function$;

revoke all on function public.admin_feed_ad_pause(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_feed_ad_resume(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_feed_ad_end(uuid, uuid, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_feed_ad_pause(uuid, uuid, text, text, text) to service_role;
grant execute on function public.admin_feed_ad_resume(uuid, uuid, text, text, text) to service_role;
grant execute on function public.admin_feed_ad_end(uuid, uuid, text, text, text, boolean, text) to service_role;
