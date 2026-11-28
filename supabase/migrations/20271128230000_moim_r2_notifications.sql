-- 모임 R2 알림 (2026-11-28 Owner 「구현 승인」) — 설계 docs/audit/moim-r2-notifications-design-2026-11-28.md §3-1
-- N-01 리마인드 시각별 · N-02 댓글 글쓴이 활동 멤버 · N-04 어드민 알림 대상 반환 · N-08c 신청 닉네임 · N-08d was_active ·
-- N-08e 보낸 뒤 표시(리마인드·후기) · N-08f 취소 알림 = 확정 참여자 · P10-25 후기 = 지금 활동 멤버
-- N-08e: review notice is marked only after it was sent
alter table public.moim_schedules add column if not exists review_notified_at timestamptz;
-- only rows older than the 24h review window: recent ones are picked by moim_schedules_reviews_pending (already-sent ones are dropped by the same dedupe key)
update public.moim_schedules set review_notified_at = coalesce(finished_at, updated_at)
 where status = 'done' and review_notified_at is null and coalesce(finished_at, updated_at) <= now() - interval '24 hours';
CREATE OR REPLACE FUNCTION public.moim_comment_create(p_actor uuid, p_post uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_po record;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_word text;
  v_pol public.moim_policies;
begin
  select po.*, m.platform_state into v_po from public.moim_posts po join public.moims m on m.id = po.moim_id
   where po.id = p_post and m.status = 'active';
  if not found or v_po.status <> 'active' then perform public.moim__fail('moim_post_not_found'); end if;
  if v_po.platform_state = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  if public.moim_actor_role(v_po.moim_id, p_actor) is null then perform public.moim__fail('moim_not_member'); end if;
  if v_body = '' or char_length(v_body) > 2000 then perform public.moim__fail('moim_comment_invalid'); end if;
  select * into v_pol from public.moim_policies where id = 1;
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and position(lower(v_word) in lower(v_body)) > 0 then perform public.moim__fail('moim_banned_word'); end if;
  end loop;
  insert into public.moim_comments (post_id, moim_id, author_id, body) values (p_post, v_po.moim_id, p_actor, v_body) returning id into v_id;
  update public.moim_posts set comment_count = comment_count + 1 where id = p_post;
  update public.moims set last_activity_at = now() where id = v_po.moim_id;
  perform public.moim__log(v_po.moim_id, p_actor, 'user', 'comment_created', v_id, jsonb_build_object('post_id', p_post));
  return jsonb_build_object('ok', true, 'comment_id', v_id,
    'post_author_id', case when exists (select 1 from public.moim_members mm where mm.moim_id = v_po.moim_id and mm.user_id = v_po.author_id and mm.status = 'active')
                           then v_po.author_id end,
    'moim_id', v_po.moim_id);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_member_remove(p_actor uuid, p_moim uuid, p_target uuid, p_ban boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_role text := public.moim_actor_role(p_moim, p_actor);
  v_target record;
  v_found boolean;
begin
  if p_actor = p_target then perform public.moim__fail('moim_cannot_target_self'); end if;
  if not public.moim_actor_can(p_moim, p_actor, case when p_ban then 'ban_member' else 'remove_member' end) then
    perform public.moim__fail('moim_forbidden');
  end if;
  select role, status into v_target from public.moim_members where moim_id = p_moim and user_id = p_target for update;
  v_found := found;
  if not p_ban and (not v_found or v_target.status not in ('active', 'pending')) then
    perform public.moim__fail('moim_target_not_member');
  end if;
  if v_found and v_target.status = 'active' and public.moim__role_rank(v_target.role) >= public.moim__role_rank(v_actor_role) then
    perform public.moim__fail('moim_forbidden');
  end if;
  if v_found and (v_target.status in ('active', 'pending') or p_ban) then
    update public.moim_members
       set status = case when p_ban then 'banned' else 'kicked' end, role = 'member',
           left_at = case when v_target.status = 'active' then now() else left_at end,
           decided_by = p_actor, decided_at = now(), updated_at = now()
     where moim_id = p_moim and user_id = p_target;
    update public.moim_join_requests set status = 'rejected', decided_by = p_actor, decided_at = now()
     where moim_id = p_moim and user_id = p_target and status = 'pending';
    if v_target.status = 'active' then
      perform public.moim__deactivate_member(p_moim, p_target);
    end if;
  end if;
  if p_ban then
    if not exists (select 1 from public.profiles where id = p_target) then perform public.moim__fail('moim_target_not_member'); end if;
    insert into public.moim_bans (moim_id, user_id, banned_by, reason)
    select p_moim, p_target, p_actor, left(p_reason, 500)
     where not exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_target and released_at is null);
  end if;
  perform public.moim__log(p_moim, p_actor, 'user', case when p_ban then 'member_banned' else 'member_removed' end, p_target,
                           jsonb_build_object('reason', left(p_reason, 500)));
  return jsonb_build_object('ok', true, 'was_active', coalesce(v_found and v_target.status = 'active', false));
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_join(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m record;
  v_cur text;
  v_prof record;
  v_nick text;
  v_req uuid;
  v_answers jsonb;
  v_link_id uuid;
  v_link_by uuid;
begin
  perform public.moim__assert_joinable(p_moim, p_actor);
  select * into v_m from public.moims where id = p_moim;
  select status into v_cur from public.moim_members where moim_id = p_moim and user_id = p_actor;
  if v_cur = 'active' then perform public.moim__fail('moim_already_member'); end if;
  if v_cur = 'pending' then perform public.moim__fail('moim_already_pending'); end if;
  select nickname, avatar_url into v_prof from public.profiles where id = p_actor;
  v_nick := btrim(coalesce(nullif(p->>'nickname', ''), v_prof.nickname, ''));
  if v_nick = '' then perform public.moim__fail('moim_nickname_required'); end if;
  if char_length(v_nick) > 40 then perform public.moim__fail('moim_nickname_invalid'); end if;
  perform public.moim__assert_text_clean(array[v_nick, p->>'bio']);
  if nullif(p->>'invite_token', '') is not null then
    select id, created_by into v_link_id, v_link_by from public.moim_invites
     where token = p->>'invite_token' and moim_id = p_moim and revoked_at is null and (expires_at is null or expires_at > now());
  end if;
  if v_m.join_mode = 'instant' then
    perform public.moim__activate_member(p_moim, p_actor, v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), left(p->>'bio', 300), v_link_by, null);
    if v_link_id is not null then update public.moim_invites set usage_count = usage_count + 1 where id = v_link_id; end if;
    perform public.moim__log(p_moim, p_actor, 'user', 'member_joined', p_actor, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'status', 'active', 'room_id', v_m.main_room_id);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'question', q.question,
           'answer', left(coalesce(case when jsonb_typeof(p->'answers') = 'array' then p->'answers'->>(q.sort_order - 1) end, ''), 1000)
         ) order by q.sort_order), '[]'::jsonb)
    into v_answers
    from public.moim_join_questions q where q.moim_id = p_moim;
  perform public.moim__assert_text_clean(array(select x->>'answer' from jsonb_array_elements(v_answers) x));
  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio, invited_by)
  values (p_moim, p_actor, 'member', 'pending', v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), left(coalesce(p->>'bio', ''), 300), v_link_by)
  on conflict (moim_id, user_id) do update
    set status = 'pending', role = 'member', nickname = excluded.nickname, avatar_url = excluded.avatar_url, bio = excluded.bio,
        invited_by = excluded.invited_by, updated_at = now();
  insert into public.moim_join_requests (moim_id, user_id, answers, invite_id)
  values (p_moim, p_actor, v_answers, v_link_id)
  returning id into v_req;
  perform public.moim__log(p_moim, p_actor, 'user', 'join_requested', v_req, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'status', 'pending', 'request_id', v_req, 'nickname', v_nick);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_schedule_cancel(p_actor uuid, p_schedule uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s record;
  v_users jsonb;
begin
  select * into v_s from public.moim_schedules where id = p_schedule for update;
  if not found then perform public.moim__fail('moim_schedule_not_found'); end if;
  if v_s.status in ('done', 'cancelled') then perform public.moim__fail('moim_schedule_finished'); end if;
  if not public.moim__schedule_can_manage(p_schedule, p_actor) then perform public.moim__fail('moim_forbidden'); end if;
  select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_users
    from public.moim_schedule_participants where schedule_id = p_schedule and status = 'confirmed' and user_id <> p_actor;
  update public.moim_schedules set status = 'cancelled', finished_at = now(), updated_at = now() where id = p_schedule;
  if v_s.room_id is not null then
    perform public.moim__writer_on();
    update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_s.room_id;
  end if;
  perform public.moim__log(v_s.moim_id, p_actor, 'user', 'schedule_cancelled', p_schedule, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'moim_id', v_s.moim_id, 'notify_user_ids', v_users, 'title', v_s.title);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_admin_content(p_admin uuid, p_type text, p_id uuid, p_action text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_moim uuid;
  v_status text;
  v_post uuid;
  v_new text;
  v_s record;
  v_users jsonb;
  v_author uuid;
begin
  if p_type = 'schedule' then
    if p_action <> 'cancel' then perform public.moim__fail('moim_content_action_invalid'); end if;
    select * into v_s from public.moim_schedules where id = p_id for update;
    if not found then perform public.moim__fail('moim_content_not_found'); end if;
    if v_s.status in ('done', 'cancelled') then perform public.moim__fail('moim_schedule_finished'); end if;
    select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_users
      from public.moim_schedule_participants where schedule_id = p_id and status = 'confirmed';
    update public.moim_schedules set status = 'cancelled', finished_at = now(), updated_at = now() where id = p_id;
    if v_s.room_id is not null then
      perform public.moim__writer_on();
      update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_s.room_id;
    end if;
    perform public.moim__admin_log(v_s.moim_id, p_admin, 'admin_schedule_cancelled', p_id, v_reason, jsonb_build_object('status', v_s.status), null);
    return jsonb_build_object('ok', true, 'moim_id', v_s.moim_id, 'title', v_s.title, 'notify_user_ids', v_users);
  end if;
  if p_action not in ('hide', 'restore', 'delete', 'undelete') then perform public.moim__fail('moim_content_action_invalid'); end if;
  v_new := case p_action when 'hide' then 'hidden' when 'delete' then 'deleted' else 'active' end;
  if p_type = 'post' then
    select moim_id, status, author_id into v_moim, v_status, v_author from public.moim_posts where id = p_id for update;
  elsif p_type = 'comment' then
    select moim_id, status, post_id, author_id into v_moim, v_status, v_post, v_author from public.moim_comments where id = p_id for update;
  elsif p_type = 'album' then
    select moim_id, status, uploader_id into v_moim, v_status, v_author from public.moim_album_items where id = p_id for update;
  else
    perform public.moim__fail('moim_content_action_invalid');
  end if;
  if v_moim is null then perform public.moim__fail('moim_content_not_found'); end if;
  if v_status = v_new or (p_action = 'hide' and v_status <> 'active') or (p_action = 'restore' and v_status <> 'hidden')
     or (p_action = 'undelete' and v_status <> 'deleted') then
    perform public.moim__fail('moim_conflict');
  end if;
  if p_type = 'post' then
    update public.moim_posts
       set status = v_new, is_pinned = case when v_new = 'active' then is_pinned else false end,
           hidden_by = case when v_new = 'hidden' then p_admin when v_new = 'active' then null else hidden_by end,
           hidden_reason = case when v_new = 'hidden' then v_reason when v_new = 'active' then null else hidden_reason end,
           updated_at = now()
     where id = p_id;
  elsif p_type = 'comment' then
    update public.moim_comments set status = v_new, updated_at = now() where id = p_id;
    if v_status = 'active' and v_new <> 'active' then
      update public.moim_posts set comment_count = greatest(comment_count - 1, 0) where id = v_post;
    elsif v_status <> 'active' and v_new = 'active' then
      update public.moim_posts set comment_count = comment_count + 1 where id = v_post;
    end if;
  else
    update public.moim_album_items set status = v_new, is_pinned = case when v_new = 'active' then is_pinned else false end where id = p_id;
  end if;
  perform public.moim__admin_log(v_moim, p_admin, 'admin_' || p_type || '_' || p_action, p_id, v_reason,
    jsonb_build_object('status', v_status), jsonb_build_object('status', v_new));
  return jsonb_build_object('ok', true, 'moim_id', v_moim, 'status', v_new, 'author_id', v_author,
    'name', (select name from public.moims where id = v_moim));
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_admin_report_decide(p_admin uuid, p_report uuid, p_expected_status text, p_decision text, p_reason text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_changed boolean := false;
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
  v_owner := case v_r.target_type
    when 'member' then v_r.target_id
    when 'moim' then v_m.host_user_id
    when 'post' then (select author_id from public.moim_posts where id = v_r.target_id)
    when 'comment' then (select author_id from public.moim_comments where id = v_r.target_id)
    when 'album' then (select uploader_id from public.moim_album_items where id = v_r.target_id)
    when 'schedule' then (select host_user_id from public.moim_schedules where id = v_r.target_id)
    when 'chat_message' then (select sender_id from public.community_messenger_messages where id = v_r.target_id)
  end;
  if v_hide then
    if v_r.target_type in ('moim', 'member') then perform public.moim__fail('moim_report_decision_invalid'); end if;
    if v_r.target_type = 'post' then
      update public.moim_posts set status = 'hidden', is_pinned = false, hidden_by = p_admin, hidden_reason = v_reason, updated_at = now()
       where id = v_r.target_id and status = 'active';
      v_changed := found;
    elsif v_r.target_type = 'comment' then
      update public.moim_comments set status = 'hidden', updated_at = now() where id = v_r.target_id and status = 'active';
      v_changed := found;
      if found then
        update public.moim_posts set comment_count = greatest(comment_count - 1, 0)
         where id = (select post_id from public.moim_comments where id = v_r.target_id);
      end if;
    elsif v_r.target_type = 'album' then
      update public.moim_album_items set status = 'hidden', is_pinned = false where id = v_r.target_id and status = 'active';
      v_changed := found;
    elsif v_r.target_type = 'schedule' then
      select * into v_sched from public.moim_schedules where id = v_r.target_id for update;
      if found and v_sched.status in ('recruiting', 'full', 'closed') then
        v_sched_title := v_sched.title;
        v_changed := true;
        select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_sched_users
          from public.moim_schedule_participants where schedule_id = v_sched.id and status = 'confirmed';
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
      v_changed := v_chat_room is not null;
    end if;
    insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, source_report_id, actor_id)
    values (v_r.moim_id, 'content', v_r.target_id, 'content_hide', v_r.reason_code, v_reason, p_report, p_admin)
    returning id into v_sid;
    v_first_sanction := coalesce(v_first_sanction, v_sid);
    v_actions := v_actions || jsonb_build_object('kind', 'content_hide', 'sanction_id', v_sid, 'changed', v_changed);
  end if;
  if v_level is not null then
    insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, source_report_id, actor_id, ends_at)
    values (v_r.moim_id, 'moim', v_r.moim_id, v_level, v_r.reason_code, v_reason, p_report, p_admin, v_ends)
    returning id into v_sid;
    v_first_sanction := coalesce(v_first_sanction, v_sid);
    v_state := public.moim__platform_refresh(v_r.moim_id);
    v_actions := v_actions || jsonb_build_object('kind', 'moim_' || v_level, 'sanction_id', v_sid, 'platform_state', v_state);
  end if;
  if v_ur is not null then
    v_restrict_user := case v_ur->>'who' when 'host' then v_m.host_user_id when 'target' then v_owner else null end;
    if v_restrict_user is null then perform public.moim__fail('moim_report_decision_invalid'); end if;
    if char_length(v_reason) < 2 then perform public.moim__fail('moim_admin_reason_required'); end if;
    v_days := nullif(v_ur->>'days', '')::int;
    v_restrict := public.admin_apply_community_sanction(
      v_restrict_user, 'community_restriction', v_ur->>'restriction', v_days, v_reason, p_admin, p_report, 'moim');
    if coalesce((v_restrict->>'ok')::boolean, false) is not true then perform public.moim__fail('moim_user_restrict_failed'); end if;
    insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, source_report_id, actor_id, ends_at)
    values (v_r.moim_id, case when v_restrict_user = v_m.host_user_id then 'host' else 'member' end, v_restrict_user, 'user_restrict',
            v_r.reason_code, v_reason, p_report, p_admin,
            (select end_at from public.sanctions where id = nullif(v_restrict->>'id', '')::uuid))
    returning id into v_sid;
    v_first_sanction := coalesce(v_first_sanction, v_sid);
    v_actions := v_actions || jsonb_build_object('kind', 'user_restrict', 'sanction_id', v_sid, 'user_id', v_restrict_user,
      'community_sanction_id', v_restrict->>'id', 'duplicate', coalesce((v_restrict->>'duplicate')::boolean, false),
      'restriction', v_ur->>'restriction', 'days', v_days, 'end_at', v_restrict->>'end_at');
  end if;
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
$function$;
drop function if exists public.moim__close_cleanup(uuid);
create function public.moim__close_cleanup(p_moim uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('schedule_id', s.id, 'title', s.title,
           'user_ids', (select coalesce(jsonb_agg(sp.user_id), '[]'::jsonb) from public.moim_schedule_participants sp
                         where sp.schedule_id = s.id and sp.status = 'confirmed'))), '[]'::jsonb)
    into v_out
    from public.moim_schedules s where s.moim_id = p_moim and s.status in ('recruiting', 'full', 'closed');
  update public.moim_schedules set status = 'cancelled', finished_at = coalesce(finished_at, now()), updated_at = now()
   where moim_id = p_moim and status in ('recruiting', 'full', 'closed');
  update public.moim_join_requests set status = 'expired', decided_at = now() where moim_id = p_moim and status = 'pending';
  update public.moim_members set status = 'cancelled', updated_at = now() where moim_id = p_moim and status = 'pending';
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  update public.moim_invite_targets set status = 'expired', responded_at = now() where moim_id = p_moim and status = 'sent';
  return v_out;
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_close(p_actor uuid, p_moim uuid, p_confirm_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m record;
  v_room uuid;
  v_cancelled jsonb;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'close') then perform public.moim__fail('moim_forbidden'); end if;
  select * into v_m from public.moims where id = p_moim for update;
  if btrim(coalesce(p_confirm_name, '')) <> v_m.name then perform public.moim__fail('moim_confirm_name_mismatch'); end if;
  update public.moims set status = 'closed', closed_at = now(), updated_at = now() where id = p_moim;
  v_cancelled := public.moim__close_cleanup(p_moim);
  perform public.moim__writer_on();
  for v_room in select public.moim__rooms_of(p_moim) loop
    update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_room;
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'closed', null, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'name', v_m.name, 'notify_user_ids', public.moim__active_member_ids(p_moim), 'cancelled_schedules', v_cancelled);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_admin_delete(p_admin uuid, p_moim uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_m record;
  v_cancelled jsonb;
begin
  select * into v_m from public.moims where id = p_moim for update;
  if not found then perform public.moim__fail('moim_not_found'); end if;
  if v_m.status = 'deleted' then perform public.moim__fail('moim_conflict'); end if;
  update public.moims set status = 'deleted', deleted_at = now(), deleted_by = p_admin, updated_at = now() where id = p_moim;
  v_cancelled := public.moim__close_cleanup(p_moim);
  perform public.moim__rooms_set_locked(p_moim, true);
  perform public.moim__admin_log(p_moim, p_admin, 'admin_deleted', p_moim, v_reason, jsonb_build_object('status', v_m.status), jsonb_build_object('status', 'deleted'));
  return jsonb_build_object('ok', true, 'name', v_m.name, 'notify_user_ids', public.moim__active_member_ids(p_moim), 'cancelled_schedules', v_cancelled);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_account_cleanup(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m record;
  v_next uuid;
  v_room uuid;
  v_mm record;
  v_transferred int := 0;
  v_closed int := 0;
  v_left int := 0;
  v_handovers jsonb := '[]'::jsonb;
begin
  if p_user is null then perform public.moim__fail('moim_actor_invalid'); end if;
  for v_m in select * from public.moims
              where host_user_id = p_user and (status = 'active' or (status = 'deleted' and closed_at is null))
              order by created_at for update loop
    select mm.user_id into v_next
      from public.moim_members mm
     where mm.moim_id = v_m.id and mm.status = 'active' and mm.user_id <> p_user
     order by case mm.role when 'co_host' then 1 when 'staff' then 2 else 3 end,
              case when mm.role in ('co_host', 'staff') then mm.role_changed_at end asc nulls last,
              mm.joined_at asc nulls last, mm.created_at asc
     limit 1;
    update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = v_m.id and status = 'requested';
    if v_next is not null then
      perform public.moim__host_swap(v_m.id, p_user, v_next);
      insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, actor_id, decided_at)
      values (v_m.id, p_user, v_next, 'account_withdrawal', 'done', null, now());
      perform public.moim__log(v_m.id, null, 'system', 'host_changed', v_next, jsonb_build_object('from', p_user, 'kind', 'account_withdrawal'));
      v_transferred := v_transferred + 1;
      v_handovers := v_handovers || jsonb_build_array(jsonb_build_object('moim_id', v_m.id, 'to_user_id', v_next));
    elsif v_m.status = 'deleted' then
      update public.moims set closed_at = now(), updated_at = now() where id = v_m.id;
      perform public.moim__log(v_m.id, null, 'system', 'closed', null, jsonb_build_object('reason', 'account_withdrawal', 'host', p_user, 'deleted', true));
      v_closed := v_closed + 1;
    else
      update public.moims set status = 'closed', closed_at = now(), updated_at = now() where id = v_m.id;
      perform public.moim__close_cleanup(v_m.id);
      perform public.moim__writer_on();
      for v_room in select public.moim__rooms_of(v_m.id) loop
        update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_room;
      end loop;
      perform public.moim__log(v_m.id, null, 'system', 'closed', null, jsonb_build_object('reason', 'account_withdrawal', 'host', p_user));
      v_closed := v_closed + 1;
    end if;
  end loop;
  for v_mm in select moim_id, status from public.moim_members where user_id = p_user and status in ('active', 'pending') loop
    if v_mm.status = 'active' then
      update public.moim_members set status = 'left', role = 'member', left_at = now(), updated_at = now()
       where moim_id = v_mm.moim_id and user_id = p_user;
      perform public.moim__deactivate_member(v_mm.moim_id, p_user);
      perform public.moim__log(v_mm.moim_id, null, 'system', 'member_left', p_user, jsonb_build_object('reason', 'account_withdrawal'));
      v_left := v_left + 1;
    else
      update public.moim_members set status = 'cancelled', updated_at = now() where moim_id = v_mm.moim_id and user_id = p_user;
    end if;
  end loop;
  update public.moim_join_requests set status = 'cancelled', decided_at = now() where user_id = p_user and status = 'pending';
  update public.moim_invite_targets set status = 'declined', responded_at = now() where invitee_user_id = p_user and status = 'sent';
  update public.moim_invite_targets set status = 'cancelled', responded_at = now() where inviter_id = p_user and status = 'sent';
  -- A-08: open host transfer requests naming this user in any moim
  update public.moim_host_transfers set status = 'cancelled', decided_at = now()
   where status = 'requested' and (to_user_id = p_user or from_user_id = p_user);
  -- A-05 (bundle2 B8): a closed or deleted moim keeps no pointer to a withdrawn host
  update public.moims set host_user_id = null, updated_at = now()
   where host_user_id = p_user and status in ('closed', 'deleted');
  return jsonb_build_object('ok', true, 'transferred', v_transferred, 'closed', v_closed, 'left', v_left, 'handovers', v_handovers);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_admin_restore(p_admin uuid, p_moim uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_m record;
  v_status text;
begin
  select * into v_m from public.moims where id = p_moim for update;
  if not found then perform public.moim__fail('moim_not_found'); end if;
  if v_m.status <> 'deleted' then perform public.moim__fail('moim_conflict'); end if;
  v_status := case when v_m.closed_at is not null then 'closed' else 'active' end;
  update public.moims set status = v_status, deleted_at = null, deleted_by = null, updated_at = now() where id = p_moim;
  if v_status = 'active' and v_m.platform_state <> 'blocked' then
    perform public.moim__rooms_set_locked(p_moim, false);
  end if;
  perform public.moim__admin_log(p_moim, p_admin, 'admin_restored', p_moim, v_reason, jsonb_build_object('status', 'deleted'), jsonb_build_object('status', v_status));
  return jsonb_build_object('ok', true, 'status', v_status, 'name', v_m.name, 'notify_user_ids', public.moim__active_member_ids(p_moim));
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_admin_sanction_revoke(p_admin uuid, p_sanction uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_s record;
  v_before text;
  v_state text;
begin
  select * into v_s from public.moim_sanctions where id = p_sanction for update;
  if not found or v_s.target_kind <> 'moim' or v_s.revoked_at is not null then perform public.moim__fail('moim_sanction_not_found'); end if;
  select platform_state into v_before from public.moims where id = v_s.moim_id;
  update public.moim_sanctions set revoked_at = now(), revoked_by = p_admin where id = p_sanction;
  v_state := public.moim__platform_refresh(v_s.moim_id);
  perform public.moim__admin_log(v_s.moim_id, p_admin, 'admin_sanction_revoked', p_sanction, v_reason,
    jsonb_build_object('platform_state', v_before), jsonb_build_object('platform_state', v_state, 'level', v_s.level));
  return jsonb_build_object('ok', true, 'moim_id', v_s.moim_id, 'platform_state', v_state, 'level', v_s.level,
    'name', (select name from public.moims where id = v_s.moim_id),
    'notify_user_ids', case when v_s.level = 'block' then public.moim__active_member_ids(v_s.moim_id)
                            else coalesce((select jsonb_build_array(host_user_id) from public.moims where id = v_s.moim_id and host_user_id is not null), '[]'::jsonb) end);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_schedules_claim_reminders(p_window text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s record;
  v_out jsonb := '[]'::jsonb;
  v_users jsonb;
begin
  if p_window not in ('24h', '1h') then perform public.moim__fail('moim_reminder_window_invalid'); end if;
  for v_s in
    select s.* from public.moim_schedules s
      join public.moims m on m.id = s.moim_id and m.status = 'active' and m.platform_state <> 'blocked'
     where s.status in ('recruiting', 'full', 'closed') and s.starts_at > now()
       and (
         (p_window = '24h' and s.reminded_24h_at is null and s.starts_at <= now() + interval '24 hours' and s.starts_at > now() + interval '2 hours')
         or (p_window = '1h' and s.reminded_1h_at is null and s.starts_at <= now() + interval '1 hour')
       )
     limit 500
     for update of s skip locked
  loop
    select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_users
      from public.moim_schedule_participants where schedule_id = v_s.id and status = 'confirmed';
    v_out := v_out || jsonb_build_object('schedule_id', v_s.id, 'moim_id', v_s.moim_id, 'title', v_s.title, 'starts_at', v_s.starts_at, 'user_ids', v_users);
  end loop;
  return jsonb_build_object('ok', true, 'reminders', v_out);
end
$function$;
create or replace function public.moim_schedules_ack_reminders(p_window text, p_items jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_n int := 0;
begin
  if p_window not in ('24h', '1h') then perform public.moim__fail('moim_reminder_window_invalid'); end if;
  if jsonb_typeof(p_items) <> 'array' then return jsonb_build_object('ok', true, 'acked', 0); end if;
  with i as (
    select (x->>'schedule_id')::uuid as id, (x->>'starts_at')::timestamptz as starts_at
      from jsonb_array_elements(p_items) x
     where (x->>'schedule_id') ~ '^[0-9a-fA-F-]{36}$' and nullif(x->>'starts_at', '') is not null
  ), u as (
    update public.moim_schedules s
       set reminded_24h_at = case when p_window = '24h' then now() else s.reminded_24h_at end,
           reminded_1h_at = case when p_window = '1h' then now() else s.reminded_1h_at end
      from i
     where s.id = i.id and s.starts_at = i.starts_at
       and ((p_window = '24h' and s.reminded_24h_at is null) or (p_window = '1h' and s.reminded_1h_at is null))
    returning s.id
  )
  select count(*) into v_n from u;
  return jsonb_build_object('ok', true, 'acked', v_n);
end
$function$;

create or replace function public.moim_schedules_reviews_pending(p_limit integer default 200)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('schedule_id', s.id, 'moim_id', s.moim_id, 'title', s.title,
           'user_ids', (select coalesce(jsonb_agg(sp.user_id), '[]'::jsonb)
                          from public.moim_schedule_participants sp
                          join public.moim_members mm on mm.moim_id = s.moim_id and mm.user_id = sp.user_id and mm.status = 'active'
                         where sp.schedule_id = s.id and sp.status = 'confirmed'))), '[]'::jsonb)
    into v_out
    from (select s0.* from public.moim_schedules s0
            join public.moims m on m.id = s0.moim_id and m.status = 'active' and m.platform_state <> 'blocked'
           where s0.status = 'done' and s0.review_notified_at is null and s0.finished_at > now() - interval '24 hours'
           order by s0.finished_at
           limit greatest(1, least(p_limit, 1000))) s;
  return jsonb_build_object('ok', true, 'reviews', v_out);
end
$function$;

create or replace function public.moim_schedules_ack_reviews(p_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_n int := 0;
begin
  update public.moim_schedules set review_notified_at = now()
   where id = any(coalesce(p_ids, '{}'::uuid[])) and status = 'done' and review_notified_at is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'acked', v_n);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_cron_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_finish jsonb; v_r24 jsonb; v_r1 jsonb; v_sanctions jsonb; v_join jsonb; v_rooms jsonb; v_retention jsonb; v_reviews jsonb;
begin
  begin v_finish := public.moim_schedules_finish_due(200);
  exception when others then v_finish := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_reviews := public.moim_schedules_reviews_pending(200);
  exception when others then v_reviews := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_r24 := public.moim_schedules_claim_reminders('24h');
  exception when others then v_r24 := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_r1 := public.moim_schedules_claim_reminders('1h');
  exception when others then v_r1 := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_sanctions := public.moim_sanctions_expire_due(200);
  exception when others then v_sanctions := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_join := public.moim_join_requests_expire_due(200);
  exception when others then v_join := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_rooms := public.moim_schedule_rooms_archive_due(200);
  exception when others then v_rooms := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  begin v_retention := public.moim_closed_retention_due(100);
  exception when others then v_retention := jsonb_build_object('ok', false, 'error', sqlerrm, 'rpc_error', true); end;
  return jsonb_build_object(
    'ok', true, 'v', 1,
    'finish', coalesce(v_finish, '{}'::jsonb),
    'reviews', coalesce(v_reviews, '{}'::jsonb),
    'reminders_24h', coalesce(v_r24, '{}'::jsonb),
    'reminders_1h', coalesce(v_r1, '{}'::jsonb),
    'sanctions', coalesce(v_sanctions, '{}'::jsonb),
    'join_requests', coalesce(v_join, '{}'::jsonb),
    'schedule_rooms', coalesce(v_rooms, '{}'::jsonb),
    'closed_retention', coalesce(v_retention, '{}'::jsonb)
  );
end;
$function$;
revoke all on function public.moim__close_cleanup(uuid) from public, anon, authenticated;
revoke all on function public.moim_schedules_ack_reminders(text, jsonb) from public, anon, authenticated;
revoke all on function public.moim_schedules_reviews_pending(integer) from public, anon, authenticated;
revoke all on function public.moim_schedules_ack_reviews(uuid[]) from public, anon, authenticated;
grant execute on function public.moim__close_cleanup(uuid) to service_role;
grant execute on function public.moim_schedules_ack_reminders(text, jsonb) to service_role;
grant execute on function public.moim_schedules_reviews_pending(integer) to service_role;
grant execute on function public.moim_schedules_ack_reviews(uuid[]) to service_role;
