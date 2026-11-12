-- =============================================================================
-- M6 — 모임 신고 처리 → 제재 연결 (설계 docs/design/moim/moim-design-v1-2026-11-12.md §6 P13 · P14 · §8 「모임 신고 처리」)
-- Owner 2026-11-12 「M6 진행」
--
-- 한 번의 처리(한 트랜잭션)로: 신고 상태 변경(CAS) + 조치(콘텐츠 숨김 · 추천 제외/경고/차단 · 이용 제한) + moim_sanctions 기록
--   + 같은 대상 열린 신고 함께 닫기 + 운영 기록(moim_events · audit_logs). 알림(신고자 결과·모임 제재·이용 제한)은 API 가 성공 후 보낸다.
-- 이용 제한 = 기존 커뮤니티 제재 함수 admin_apply_community_sanction(scope community) — 모임 쓰기 가드가 이미 이 제한을 본다.
-- =============================================================================

begin;

/** 검토 시작 (접수 → 검토 중) */
create or replace function public.moim_admin_report_review(p_admin uuid, p_report uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_r record;
begin
  select * into v_r from public.moim_reports where id = p_report for update;
  if not found then perform public.moim__fail('moim_report_not_found'); end if;
  if v_r.status <> 'received' then perform public.moim__fail('moim_conflict'); end if;
  update public.moim_reports set status = 'reviewing', handled_by = p_admin where id = p_report;
  perform public.moim__admin_log(v_r.moim_id, p_admin, 'admin_report_reviewing', p_report, 'review', jsonb_build_object('status', 'received'), jsonb_build_object('status', 'reviewing'));
  return jsonb_build_object('ok', true);
end
$$;

/**
 * 신고 처리.
 * p_decision: 'actioned'(조치) | 'dismissed'(기각). 기각은 조치를 함께 줄 수 없고, 조치는 1개 이상 필요.
 * p: {
 *   content_hide: bool                         — 글·댓글·사진 숨김 / 일정 취소 / 채팅 메시지 숨김 (대상이 모임·멤버면 불가)
 *   moim_level: 'unlist'|'warn'|'block'|null,  moim_ends_at: timestamptz|null
 *   user_restrict: {who: 'target'|'host', restriction: 'post'|'comment'|'all', days: int|null} | null
 *   close_same_target: bool                    — 같은 대상의 다른 열린 신고도 같은 결과로 닫기
 * }
 */
create or replace function public.moim_admin_report_decide(
  p_admin uuid, p_report uuid, p_expected_status text, p_decision text, p_reason text, p jsonb
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_r record;
  v_m record;
  v_hide boolean := coalesce((p->>'content_hide')::boolean, false);
  v_level text := nullif(p->>'moim_level', '');
  v_ends timestamptz := nullif(p->>'moim_ends_at', '')::timestamptz;
  v_ur jsonb := case when jsonb_typeof(p->'user_restrict') = 'object' then p->'user_restrict' else null end;
  v_close boolean := coalesce((p->>'close_same_target')::boolean, false);
  v_owner uuid;
  v_status text;
  v_first_sanction uuid;
  v_sid uuid;
  v_actions jsonb := '[]'::jsonb;
  v_chat_room uuid;
  v_sched record;
  v_sched_title text;
  v_sched_users jsonb;
  v_restrict_user uuid;
  v_restrict jsonb;
  v_days int;
  v_reporters jsonb;
  v_closed jsonb;
  v_state text;
begin
  if p_decision not in ('actioned', 'dismissed') then perform public.moim__fail('moim_report_decision_invalid'); end if;
  if p_decision = 'dismissed' and (v_hide or v_level is not null or v_ur is not null) then perform public.moim__fail('moim_report_decision_invalid'); end if;
  if p_decision = 'actioned' and not (v_hide or v_level is not null or v_ur is not null) then perform public.moim__fail('moim_report_decision_invalid'); end if;
  if v_level is not null and v_level not in ('unlist', 'warn', 'block') then perform public.moim__fail('moim_sanction_level_invalid'); end if;
  if v_ends is not null and (v_level is null or v_ends <= now()) then perform public.moim__fail('moim_sanction_period_invalid'); end if;

  select * into v_r from public.moim_reports where id = p_report for update;
  if not found then perform public.moim__fail('moim_report_not_found'); end if;
  if v_r.status not in ('received', 'reviewing') or v_r.status is distinct from p_expected_status then perform public.moim__fail('moim_conflict'); end if;
  select * into v_m from public.moims where id = v_r.moim_id for update;
  if v_m.status = 'deleted' and (v_hide or v_level is not null) then perform public.moim__fail('moim_not_found'); end if;

  -- 대상 작성자(소유자)
  v_owner := case v_r.target_type
    when 'member' then v_r.target_id
    when 'moim' then v_m.host_user_id
    when 'post' then (select author_id from public.moim_posts where id = v_r.target_id)
    when 'comment' then (select author_id from public.moim_comments where id = v_r.target_id)
    when 'album' then (select uploader_id from public.moim_album_items where id = v_r.target_id)
    when 'schedule' then (select host_user_id from public.moim_schedules where id = v_r.target_id)
    when 'chat_message' then (select sender_id from public.community_messenger_messages where id = v_r.target_id)
  end;

  -- 1. 콘텐츠 숨김
  if v_hide then
    if v_r.target_type in ('moim', 'member') then perform public.moim__fail('moim_report_decision_invalid'); end if;
    if v_r.target_type = 'post' then
      update public.moim_posts set status = 'hidden', is_pinned = false, hidden_by = p_admin, hidden_reason = v_reason, updated_at = now()
       where id = v_r.target_id and status = 'active';
    elsif v_r.target_type = 'comment' then
      update public.moim_comments set status = 'hidden', updated_at = now() where id = v_r.target_id and status = 'active';
      if found then
        update public.moim_posts set comment_count = greatest(comment_count - 1, 0)
         where id = (select post_id from public.moim_comments where id = v_r.target_id);
      end if;
    elsif v_r.target_type = 'album' then
      update public.moim_album_items set status = 'hidden', is_pinned = false where id = v_r.target_id and status = 'active';
    elsif v_r.target_type = 'schedule' then
      select * into v_sched from public.moim_schedules where id = v_r.target_id for update;
      if found and v_sched.status in ('recruiting', 'full', 'closed') then
        v_sched_title := v_sched.title;
        select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_sched_users
          from public.moim_schedule_participants where schedule_id = v_sched.id and status in ('confirmed', 'requested');
        update public.moim_schedules set status = 'cancelled', finished_at = now(), updated_at = now() where id = v_sched.id;
        if v_sched.room_id is not null then
          perform public.moim__writer_on();
          update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_sched.room_id;
        end if;
      end if;
    elsif v_r.target_type = 'chat_message' then
      update public.community_messenger_messages set is_hidden_by_admin = true
       where id = v_r.target_id and coalesce(is_hidden_by_admin, false) = false
      returning room_id into v_chat_room;
    end if;
    insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, source_report_id, actor_id)
    values (v_r.moim_id, 'content', v_r.target_id, 'content_hide', v_r.reason_code, v_reason, p_report, p_admin)
    returning id into v_sid;
    v_first_sanction := coalesce(v_first_sanction, v_sid);
    v_actions := v_actions || jsonb_build_object('kind', 'content_hide', 'sanction_id', v_sid);
  end if;

  -- 2. 모임 제재
  if v_level is not null then
    insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, source_report_id, actor_id, ends_at)
    values (v_r.moim_id, 'moim', v_r.moim_id, v_level, v_r.reason_code, v_reason, p_report, p_admin, v_ends)
    returning id into v_sid;
    v_first_sanction := coalesce(v_first_sanction, v_sid);
    v_state := public.moim__platform_refresh(v_r.moim_id);
    v_actions := v_actions || jsonb_build_object('kind', 'moim_' || v_level, 'sanction_id', v_sid, 'platform_state', v_state);
  end if;

  -- 3. 이용 제한 (기존 커뮤니티 제재)
  if v_ur is not null then
    v_restrict_user := case v_ur->>'who' when 'host' then v_m.host_user_id when 'target' then v_owner else null end;
    if v_restrict_user is null then perform public.moim__fail('moim_report_decision_invalid'); end if;
    -- 커뮤니티 제재 함수는 사유 2자 이상 (같은 기준으로 먼저 막는다)
    if char_length(v_reason) < 2 then perform public.moim__fail('moim_admin_reason_required'); end if;
    v_days := nullif(v_ur->>'days', '')::int;
    v_restrict := public.admin_apply_community_sanction(
      v_restrict_user, 'community_restriction', v_ur->>'restriction', v_days, v_reason, p_admin, p_report, 'moim');
    if coalesce((v_restrict->>'ok')::boolean, false) is not true then perform public.moim__fail('moim_user_restrict_failed'); end if;
    insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, source_report_id, actor_id, ends_at)
    values (v_r.moim_id, case when v_restrict_user = v_m.host_user_id then 'host' else 'member' end, v_restrict_user, 'user_restrict',
            v_r.reason_code, v_reason, p_report, p_admin,
            -- 이미 같은 제한이 있으면(duplicate) 새 제한이 생기지 않으므로 실제 걸려 있는 제한의 종료 시각을 기록
            (select end_at from public.sanctions where id = nullif(v_restrict->>'id', '')::uuid))
    returning id into v_sid;
    v_first_sanction := coalesce(v_first_sanction, v_sid);
    v_actions := v_actions || jsonb_build_object('kind', 'user_restrict', 'sanction_id', v_sid, 'user_id', v_restrict_user,
      'community_sanction_id', v_restrict->>'id', 'duplicate', coalesce((v_restrict->>'duplicate')::boolean, false),
      'restriction', v_ur->>'restriction', 'days', v_days, 'end_at', v_restrict->>'end_at');
  end if;

  -- 4. 신고 닫기 (+ 같은 대상의 다른 열린 신고)
  with u as (
    update public.moim_reports
       set status = p_decision, action_id = v_first_sanction, handled_by = p_admin, handled_at = now()
     where id = p_report
        or (v_close and target_type = v_r.target_type and target_id = v_r.target_id and status in ('received', 'reviewing'))
    returning id, reporter_id
  )
  select coalesce(jsonb_agg(id), '[]'::jsonb), coalesce(jsonb_agg(distinct reporter_id), '[]'::jsonb) into v_closed, v_reporters from u;

  perform public.moim__admin_log(v_r.moim_id, p_admin, 'admin_report_' || p_decision, p_report, v_reason,
    jsonb_build_object('status', v_r.status), jsonb_build_object('status', p_decision, 'actions', v_actions, 'closed_report_ids', v_closed));

  return jsonb_build_object(
    'ok', true, 'status', p_decision, 'moim_id', v_r.moim_id, 'moim_name', v_m.name, 'host_user_id', v_m.host_user_id,
    'target_type', v_r.target_type, 'target_id', v_r.target_id, 'target_owner_id', v_owner,
    'reporter_ids', v_reporters, 'closed_report_ids', v_closed, 'actions', v_actions,
    'moim_level', v_level,
    'moim_notify_user_ids', case when v_level = 'block' then public.moim__active_member_ids(v_r.moim_id)
                                 when v_level is not null then jsonb_build_array(v_m.host_user_id) else '[]'::jsonb end,
    'chat_room_id', v_chat_room,
    'schedule_title', v_sched_title, 'schedule_notify_user_ids', coalesce(v_sched_users, '[]'::jsonb)
  );
end
$$;

do $grant$
declare f record;
begin
  for f in
    select p.oid::regprocedure sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('moim_admin_report_review', 'moim_admin_report_decide')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end
$grant$;

commit;
