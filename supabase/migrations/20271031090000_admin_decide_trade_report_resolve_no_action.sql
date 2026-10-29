-- RS-01 / E-12 (감사 2026-10-30 · Owner K-3 승인): 거래 신고 「처리 완료(제재 없음)」를 공식 처리 함수로.
--
-- 원인: /api/admin/chat/report-queue/action 의 거래 신고(`reports`) 「처리 완료」(resolved)는
--   admin_decide_trade_report 에 같은 뜻의 결정이 없어 라우트가 `reports` 를 직접 UPDATE 했다
--   → 처리 기록(report_actions)·DB 감사(audit_logs trade_report.*)가 남지 않고, 거래 신고 화면 처리와 경로가 갈렸다.
-- 수정: admin_decide_trade_report 에 결정 'resolve' 추가 (그 외 결정 reject·hide·warn·restrict 동작은 바이트 단위로 동일).
--   - 상태 = 'resolved' (거래 신고 화면 「처리 완료」 탭 = sanctioned·resolved·reviewed, 라벨 「처리 완료」 —
--     lib/admin/metrics/admin-metric-filters.ts TRADE_REPORT_TAB_STATUSES). 제재가 아니므로 'sanctioned' 를 쓰지 않는다
--     (기존 라우트가 쓰던 값과 같음).
--   - resolved_at·resolved_by·admin_note, report_actions(action_type='resolve'), audit_logs 'trade_report.resolve'.
--   - 게시물 숨김·같은 대상 대기 신고 일괄 종료·제재: reject 와 같이 하지 않는다
--     (기존 함수에서 일괄 종료는 게시물을 숨긴 결정에서만 일어난다 — 제재 없는 결정은 다른 신고를 대신 닫지 않는다).
--   - report_actions_action_type_check 에 'resolve' 추가 (기존 값 유지).
-- 범위: 함수 1개 본문 + report_actions CHECK 1개. 시그니처·SECURITY DEFINER·search_path·권한(service_role 만) 동일.
-- 롤백: 20270522120300_trade_admin_m7_trade_restrictions.sql 의 admin_decide_trade_report 정의를 다시 실행하고
--   CHECK 를 이전 값 목록으로 되돌린다 (단, action_type='resolve' 행이 생겼으면 CHECK 복구 전에 그 행 처리가 필요).
-- 운영 적용은 별도 Owner 승인 후에만 한다. 이 파일이 적용되기 전에는 웹의 'resolve' 호출이 invalid_action(400)으로 거부된다
--   (상태 변경 없음) — 웹 반영은 이 마이그레이션 운영 적용 이후여야 한다.

alter table public.report_actions drop constraint if exists report_actions_action_type_check;
alter table public.report_actions add constraint report_actions_action_type_check
  check (action_type in ('reject', 'resolve', 'warn', 'chat_ban', 'product_hide', 'account_suspend', 'account_ban', 'trade_restriction'));

-- 거래 신고 처리 (한 트랜잭션): 신고 상태 CAS → 같은 대상의 다른 대기 신고 함께 종료 → 게시물 관리자 숨김
-- → 처리 기록(report_actions) → 경고·거래 제한(선택) → 감사. 어느 단계든 실패하면 전부 롤백.
-- p_action: reject | resolve(처리 완료·제재 없음) | hide | warn | restrict
create or replace function public.admin_decide_trade_report(
  p_report_id uuid,
  p_actor_id uuid,
  p_action text,
  p_reason text,
  p_hide_post boolean default false,
  p_restriction text default null,
  p_days integer default null,
  p_ip text default null,
  p_user_agent text default null,
  p_target_user_id uuid default null   -- 채팅 신고 등 대상 회원을 신고 행에서 알 수 없을 때 (화면에서 확인한 회원)
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep record;
  v_post_id uuid;
  v_post_uuid uuid;
  v_post_mod text;
  v_target_user uuid;
  v_new_status text;
  v_closed integer := 0;
  v_sanction jsonb;
  v_hidden boolean := false;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_action not in ('reject', 'resolve', 'hide', 'warn', 'restrict') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;

  select * into v_rep from public.reports where id = p_report_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_rep.status not in ('pending', 'reviewing') then
    return jsonb_build_object('ok', false, 'error', 'already_processed', 'status', v_rep.status);
  end if;

  if v_rep.target_type in ('product', 'post') then
    v_post_id := coalesce(v_rep.product_id, v_rep.target_id);
  end if;
  if v_post_id is not null then
    select id, user_id, moderation_state into v_post_uuid, v_target_user, v_post_mod
      from public.posts where id = v_post_id for update;
  end if;
  if v_target_user is null and v_rep.target_type = 'user' then
    v_target_user := v_rep.target_id;
  end if;
  if v_target_user is null then
    v_target_user := p_target_user_id;
  end if;

  if (p_action in ('hide') or p_hide_post) and v_post_uuid is null then
    return jsonb_build_object('ok', false, 'error', 'post_not_found');
  end if;
  if p_action in ('warn', 'restrict') and v_target_user is null then
    return jsonb_build_object('ok', false, 'error', 'target_user_unknown');
  end if;

  v_new_status := case when p_action = 'reject' then 'rejected'
                       when p_action = 'resolve' then 'resolved'
                       else 'sanctioned' end;

  -- 게시물 관리자 숨김 (이미 숨김·삭제면 그대로)
  if p_action = 'hide' or (p_hide_post and p_action not in ('reject', 'resolve')) then
    if v_post_mod in ('visible', 'legacy_hidden') then
      update public.posts
         set moderation_state = 'admin_hidden',
             moderation_reason = left(trim(p_reason), 1000),
             moderation_by = p_actor_id,
             updated_at = now()
       where id = v_post_uuid;
      v_hidden := true;
      insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json, ip, user_agent)
      values ('admin', p_actor_id, 'trade_post', v_post_uuid::text, 'trade_post.hide',
              jsonb_build_object('moderation_state', v_post_mod),
              jsonb_build_object('moderation_state', 'admin_hidden', 'source_report_id', p_report_id,
                                 'reason', left(trim(p_reason), 1000)),
              left(p_ip, 80), left(p_user_agent, 500));
    end if;
  end if;

  update public.reports
     set status = v_new_status, resolved_at = now(), resolved_by = p_actor_id,
         admin_note = left(trim(p_reason), 1000)
   where id = p_report_id;

  -- 같은 게시물의 다른 대기 신고: 게시물을 숨긴 경우에만 함께 종료 (같은 사유·같은 결과)
  if v_hidden or (v_post_uuid is not null and (p_action = 'hide' or p_hide_post) and p_action not in ('reject', 'resolve')) then
    with closed as (
      update public.reports
         set status = 'sanctioned', resolved_at = now(), resolved_by = p_actor_id,
             admin_note = left('같은 게시물 신고 함께 처리: ' || trim(p_reason), 1000)
       where id <> p_report_id
         and status in ('pending', 'reviewing')
         and (product_id = v_post_uuid or (target_type in ('product', 'post') and target_id = v_post_uuid))
      returning id
    )
    select count(*) into v_closed from closed;
  end if;

  insert into public.report_actions (report_id, action_type, action_note, created_by)
  values (p_report_id,
          case p_action when 'reject' then 'reject' when 'resolve' then 'resolve' when 'hide' then 'product_hide' when 'warn' then 'warn' else 'trade_restriction' end,
          left(trim(p_reason), 1000), p_actor_id);

  if p_action in ('warn', 'restrict') then
    v_sanction := public.admin_apply_trade_sanction(
      v_target_user,
      case when p_action = 'warn' then 'warning' else 'trade_restriction' end,
      case when p_action = 'restrict' then coalesce(p_restriction, 'all') else null end,
      p_days, p_reason, p_actor_id, p_report_id, p_ip, p_user_agent);
    if coalesce((v_sanction->>'ok')::boolean, false) is not true then
      raise exception 'trade_report_sanction_failed: %', v_sanction->>'error';
    end if;
  end if;

  insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json, ip, user_agent)
  values ('admin', p_actor_id, 'trade_report', p_report_id::text, 'trade_report.' || p_action,
          jsonb_build_object('status', v_rep.status),
          jsonb_build_object('status', v_new_status, 'post_id', v_post_uuid, 'post_hidden', v_hidden,
                             'closed_siblings', v_closed, 'sanction', v_sanction, 'reason', left(trim(p_reason), 1000)),
          left(p_ip, 80), left(p_user_agent, 500));

  return jsonb_build_object('ok', true, 'status', v_new_status, 'post_hidden', v_hidden,
                            'closed_siblings', v_closed, 'sanction', v_sanction, 'target_user_id', v_target_user);
end;
$$;

revoke all on function public.admin_decide_trade_report(uuid, uuid, text, text, boolean, text, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_decide_trade_report(uuid, uuid, text, text, boolean, text, integer, text, text, uuid) to service_role;
