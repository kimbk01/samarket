-- 커뮤니티 재감사 묶음 4 (CM-R-03): 신고 결정이 이미 삭제된 대상의 상태를 덮어쓰지 않게 한다.
-- 이전: 작성자가 삭제(status=deleted)한 글·댓글에 resolved+hide 를 내리면 hidden 으로 되살아나
--       영구 삭제 대상에서 빠지고(30일 타이머 리셋) 작성자에게 잘못된 알림이 갔다.
-- 변경: 대상이 이미 deleted 면 조치 생략(skipped=already_deleted), 이미 hidden 인데 hide 면 생략(skipped=already_hidden).
--       hidden → delete 는 그대로 허용. 그 밖의 동작·시그니처·권한은 m4b 와 동일.
create or replace function public.admin_community_report_decide(
  p_report_id uuid,
  p_expected_status text,
  p_decision text,
  p_actor_id uuid,
  p_reason text,
  p_target_action text,
  p_sanction_kind text,
  p_sanction_restriction text,
  p_sanction_days integer,
  p_close_same_target boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rep record;
  v_target_user uuid;
  v_target_found boolean := false;
  v_target_prev_status text;
  v_sanction jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_closed uuid[] := '{}';
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_decision not in ('resolved', 'dismissed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_decision');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if p_decision = 'dismissed' and (coalesce(p_target_action, 'none') <> 'none' or p_sanction_kind is not null) then
    return jsonb_build_object('ok', false, 'error', 'dismiss_with_action');
  end if;

  select * into v_rep from public.community_reports where id = p_report_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_rep.status is distinct from p_expected_status or v_rep.status not in ('open', 'reviewing') then
    return jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_rep.status);
  end if;

  if v_rep.target_type = 'post' then
    select user_id, status into v_target_user, v_target_prev_status
      from public.community_posts where id::text = v_rep.target_id for update;
    v_target_found := found;
  elsif v_rep.target_type = 'comment' then
    select user_id, status into v_target_user, v_target_prev_status
      from public.community_comments where id::text = v_rep.target_id for update;
    v_target_found := found;
  elsif v_rep.target_type = 'user' then
    begin
      v_target_user := v_rep.target_id::uuid;
      v_target_found := true;
    exception when others then
      v_target_found := false;
    end;
  end if;

  if p_decision = 'resolved' and coalesce(p_target_action, 'none') in ('hide', 'delete') then
    if not v_target_found or v_rep.target_type = 'user' then
      v_actions := v_actions || jsonb_build_object('action', p_target_action, 'skipped', 'target_missing');
    elsif v_target_prev_status = 'deleted' then
      v_actions := v_actions || jsonb_build_object('action', p_target_action, 'skipped', 'already_deleted',
        'target_type', v_rep.target_type);
    elsif p_target_action = 'hide' and v_target_prev_status = 'hidden' then
      v_actions := v_actions || jsonb_build_object('action', p_target_action, 'skipped', 'already_hidden',
        'target_type', v_rep.target_type);
    elsif v_rep.target_type = 'post' then
      update public.community_posts
         set status = case when p_target_action = 'hide' then 'hidden' else 'deleted' end,
             moderated_by = p_actor_id, moderated_at = now(), moderation_reason = left(trim(p_reason), 1000)
       where id::text = v_rep.target_id;
      v_actions := v_actions || jsonb_build_object('action', p_target_action, 'target_type', 'post',
        'from_status', v_target_prev_status);
    else
      update public.community_comments
         set status = case when p_target_action = 'hide' then 'hidden' else 'deleted' end,
             is_hidden = (p_target_action = 'hide'), is_deleted = (p_target_action = 'delete'),
             moderated_by = p_actor_id, moderated_at = now(), moderation_reason = left(trim(p_reason), 1000),
             updated_at = now()
       where id::text = v_rep.target_id;
      v_actions := v_actions || jsonb_build_object('action', p_target_action, 'target_type', 'comment',
        'from_status', v_target_prev_status);
    end if;
  end if;

  if p_decision = 'resolved' and p_sanction_kind is not null then
    if v_target_user is null then
      v_actions := v_actions || jsonb_build_object('action', p_sanction_kind, 'skipped', 'target_user_missing');
    else
      v_sanction := public.admin_apply_community_sanction(
        v_target_user, p_sanction_kind, p_sanction_restriction, p_sanction_days, p_reason, p_actor_id,
        p_report_id, 'community_report');
      if coalesce((v_sanction ->> 'ok')::boolean, false) is not true then
        raise exception 'sanction_failed:%', coalesce(v_sanction ->> 'error', 'unknown') using errcode = 'P0001';
      end if;
      v_actions := v_actions || jsonb_build_object('action', p_sanction_kind, 'sanction_id', v_sanction ->> 'id',
        'restriction', p_sanction_restriction, 'days', p_sanction_days);
    end if;
  end if;

  update public.community_reports
     set status = p_decision, processed_at = now(), processed_by = p_actor_id,
         decision_reason = left(trim(p_reason), 1000), resolution_actions = v_actions
   where id = p_report_id;

  if coalesce(p_close_same_target, false) and v_rep.target_id is not null then
    with closed as (
      update public.community_reports
         set status = p_decision, processed_at = now(), processed_by = p_actor_id,
             decision_reason = left(trim(p_reason), 1000),
             resolution_actions = jsonb_build_array(jsonb_build_object('merged_into', p_report_id))
       where target_type = v_rep.target_type and target_id = v_rep.target_id
         and id <> p_report_id and status in ('open', 'reviewing')
      returning id
    )
    select coalesce(array_agg(id), '{}') into v_closed from closed;
  end if;

  return jsonb_build_object('ok', true, 'status', p_decision, 'target_type', v_rep.target_type,
    'target_id', v_rep.target_id, 'target_user_id', v_target_user, 'target_found', v_target_found,
    'reporter_id', v_rep.user_id, 'actions', v_actions, 'closed_report_ids', to_jsonb(v_closed));
exception
  when sqlstate 'P0001' then
    if sqlerrm like 'sanction_failed:%' then
      return jsonb_build_object('ok', false, 'error', substr(sqlerrm, length('sanction_failed:') + 1));
    end if;
    raise;
end; $$;

revoke all on function public.admin_community_report_decide(uuid, text, text, uuid, text, text, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.admin_community_report_decide(uuid, text, text, uuid, text, text, text, text, integer, boolean) to service_role;
