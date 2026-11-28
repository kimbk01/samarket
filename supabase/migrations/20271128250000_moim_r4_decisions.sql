-- 모임 R4 (2026-11-28 Owner 「구현 승인」) — 설계 docs/audit/moim-r4-decisions-design-2026-11-28.md §5
-- D-14 경고·차단 종료일 없음 · D-3 삭제 모임 방 보관·복구 · 정책값 3종 · 사진 삭제(D-36) · 미사용 함수 · 모임 방 is_readonly · FK 인덱스
-- policy values move from code constants to the admin policy row (contract 8: not code constants)
alter table public.moim_policies add column if not exists question_banned_words text[] not null default array[U&'\C804\D654\BC88\D638', U&'\D734\B300\D3F0 \BC88\D638', U&'\D578\B4DC\D3F0 \BC88\D638', U&'\C5F0\B77D\CC98', U&'\CE74\D1A1 \C544\C774\B514', U&'\C2E4\BA85', U&'\BCF8\BA85', U&'\C8FC\BBFC\BC88\D638', U&'\C8FC\BBFC\B4F1\B85D', U&'\C2E0\BD84\C99D', U&'\C5EC\AD8C', U&'phone number', U&'mobile number', U&'contact number', U&'real name', U&'full name', U&'id card', U&'passport', U&'kakao id']::text[];
alter table public.moim_policies add column if not exists prohibited_types jsonb not null default U&'[{"code": "commercial", "label_ko": "\C601\B9AC\00B7\AD11\ACE0 \BAA9\C801 \BAA8\C784", "label_en": "Groups for selling or promotion"}, {"code": "religion", "label_ko": "\C885\AD50 \D3EC\AD50 \BAA8\C784", "label_en": "Groups for religious recruiting"}, {"code": "politics", "label_ko": "\C815\CE58 \D65C\B3D9 \BAA8\C784", "label_en": "Groups for political campaigning"}, {"code": "dating", "label_ko": "\C774\C131 \B9CC\B0A8 \BAA9\C801 \BAA8\C784", "label_en": "Groups for dating"}, {"code": "mlm", "label_ko": "\B2E4\B2E8\ACC4\00B7\D22C\C790 \AD8C\C720 \BAA8\C784", "label_en": "Groups for pyramid schemes or investment pitches"}, {"code": "personal_info", "label_ko": "\C2E4\BA85\00B7\C804\D654\BC88\D638 \B4F1 \AC1C\C778\C815\BCF4\B97C \C694\AD6C\D558\B294 \BAA8\C784", "label_en": "Groups that ask for real names, phone numbers or other personal info"}, {"code": "external_messenger", "label_ko": "\C678\BD80 \BA54\C2E0\C800\B85C \C720\B3C4\D558\B294 \BAA8\C784", "label_en": "Groups that push members to other messaging apps"}, {"code": "illegal", "label_ko": "\BD88\BC95\00B7\C74C\B780\00B7\C0AC\D589\C131 \BAA8\C784", "label_en": "Illegal, sexual or gambling groups"}]'::jsonb;
alter table public.moim_policies add column if not exists report_reasons jsonb not null default U&'[{"code": "commercial", "label_ko": "\C601\B9AC\00B7\AD11\ACE0", "label_en": "Selling or promotion", "is_active": true}, {"code": "religion", "label_ko": "\C885\AD50 \D3EC\AD50", "label_en": "Religious recruiting", "is_active": true}, {"code": "politics", "label_ko": "\C815\CE58", "label_en": "Political activity", "is_active": true}, {"code": "dating", "label_ko": "\C774\C131 \B9CC\B0A8 \BAA9\C801", "label_en": "Dating", "is_active": true}, {"code": "mlm_investment", "label_ko": "\B2E4\B2E8\ACC4\00B7\D22C\C790 \AD8C\C720", "label_en": "Pyramid or investment pitch", "is_active": true}, {"code": "personal_info", "label_ko": "\AC1C\C778\C815\BCF4 \C694\AD6C", "label_en": "Asking for personal info", "is_active": true}, {"code": "external_messenger", "label_ko": "\C678\BD80 \BA54\C2E0\C800 \C720\B3C4", "label_en": "Pushing to other apps", "is_active": true}, {"code": "abuse_hate", "label_ko": "\C695\C124\00B7\D610\C624", "label_en": "Abuse or hate", "is_active": true}, {"code": "sexual", "label_ko": "\C74C\B780", "label_en": "Sexual content", "is_active": true}, {"code": "fraud", "label_ko": "\C0AC\AE30\00B7\AE08\C804 \D53C\D574", "label_en": "Scam or money loss", "is_active": true}, {"code": "noshow_fee", "label_ko": "\B178\C1FC\00B7\D68C\BE44 \BBF8\BC18\D658", "label_en": "No-show or unpaid fees", "is_active": true}, {"code": "other", "label_ko": "\AE30\D0C0", "label_en": "Other", "is_active": true}]'::jsonb;

-- D-14: warn / block have no end date (admin release only); production rows with an end date: 0 (2026-11-28)
alter table public.moim_sanctions drop constraint if exists moim_sanctions_warn_block_no_end;
alter table public.moim_sanctions add constraint moim_sanctions_warn_block_no_end
  check (not (target_kind = 'moim' and level in ('warn', 'block') and ends_at is not null));

create or replace function public.moim__report_reason_active(p_code text)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(p_code, '') ~ '^[a-z_]{2,40}$' and exists (
    select 1 from public.moim_policies pol, jsonb_array_elements(coalesce(pol.report_reasons, '[]'::jsonb)) r
     where pol.id = 1 and r->>'code' = p_code and coalesce((r->>'is_active')::boolean, true)
  );
$function$;
CREATE OR REPLACE FUNCTION public.moim_admin_sanction_apply(p_admin uuid, p_moim uuid, p_level text, p_reason_code text, p_reason text, p_ends_at timestamp with time zone, p_report uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_m record;
  v_id uuid;
  v_state text;
begin
  if p_level not in ('unlist', 'warn', 'block') then perform public.moim__fail('moim_sanction_level_invalid'); end if;
  if not public.moim__report_reason_active(p_reason_code) then perform public.moim__fail('moim_report_reason_invalid'); end if;
  if p_level in ('warn', 'block') and p_ends_at is not null then perform public.moim__fail('moim_sanction_period_not_allowed'); end if;
  if p_ends_at is not null and p_ends_at <= now() then perform public.moim__fail('moim_sanction_period_invalid'); end if;
  select * into v_m from public.moims where id = p_moim for update;
  if not found or v_m.status = 'deleted' then perform public.moim__fail('moim_not_found'); end if;
  if exists (select 1 from public.moim_sanctions s where s.moim_id = p_moim and s.target_kind = 'moim' and s.level = p_level
               and s.revoked_at is null and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())) then
    perform public.moim__fail('moim_conflict');
  end if;
  if p_report is not null and not exists (select 1 from public.moim_reports r where r.id = p_report and r.moim_id = p_moim) then
    perform public.moim__fail('moim_report_not_found');
  end if;
  insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, actor_id, ends_at, source_report_id)
  values (p_moim, 'moim', p_moim, p_level, p_reason_code, v_reason, p_admin, p_ends_at, p_report)
  returning id into v_id;
  v_state := public.moim__platform_refresh(p_moim);
  perform public.moim__admin_log(p_moim, p_admin, 'admin_sanction_applied', v_id, v_reason,
    jsonb_build_object('platform_state', v_m.platform_state),
    jsonb_build_object('platform_state', v_state, 'level', p_level, 'reason_code', p_reason_code, 'ends_at', p_ends_at));
  return jsonb_build_object('ok', true, 'sanction_id', v_id, 'platform_state', v_state, 'host_user_id', v_m.host_user_id,
    'notify_user_ids', case when p_level = 'block' then public.moim__active_member_ids(p_moim) else jsonb_build_array(v_m.host_user_id) end,
    'name', v_m.name);
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
  if v_level in ('warn', 'block') and v_ends is not null then perform public.moim__fail('moim_sanction_period_not_allowed'); end if;
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
CREATE OR REPLACE FUNCTION public.moim_report_create(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text := p->>'target_type';
  v_target uuid := nullif(p->>'target_id', '')::uuid;
  v_reason text := btrim(coalesce(p->>'reason_code', ''));
  v_ok boolean;
  v_id uuid;
begin
  if not exists (select 1 from public.moims where id = p_moim and status in ('active', 'closed')) then perform public.moim__fail('moim_not_found'); end if;
  if v_type not in ('moim', 'member', 'post', 'comment', 'schedule', 'album', 'chat_message') or v_target is null then
    perform public.moim__fail('moim_report_target_invalid');
  end if;
  if not public.moim__report_reason_active(v_reason) then perform public.moim__fail('moim_report_reason_invalid'); end if;
  v_ok := case v_type
    when 'moim' then v_target = p_moim
    when 'member' then exists (select 1 from public.moim_members where moim_id = p_moim and user_id = v_target)
    when 'post' then exists (select 1 from public.moim_posts where moim_id = p_moim and id = v_target)
    when 'comment' then exists (select 1 from public.moim_comments where moim_id = p_moim and id = v_target)
    when 'schedule' then exists (select 1 from public.moim_schedules where moim_id = p_moim and id = v_target)
    when 'album' then exists (select 1 from public.moim_album_items where moim_id = p_moim and id = v_target)
    when 'chat_message' then exists (
      select 1 from public.community_messenger_messages msg
        join public.community_messenger_rooms r on r.id = msg.room_id
       where msg.id = v_target and r.owner_domain = 'moim'
         and (r.owner_ref_id = p_moim or r.owner_ref_id in (select id from public.moim_schedules where moim_id = p_moim)))
  end;
  if not coalesce(v_ok, false) then perform public.moim__fail('moim_report_target_invalid'); end if;
  if v_type = 'member' and v_target = p_actor then perform public.moim__fail('moim_cannot_target_self'); end if;
  if exists (select 1 from public.moim_reports where reporter_id = p_actor and target_type = v_type and target_id = v_target and status in ('received', 'reviewing')) then
    perform public.moim__fail('moim_report_duplicate');
  end if;
  insert into public.moim_reports (reporter_id, moim_id, target_type, target_id, reason_code, detail)
  values (p_actor, p_moim, v_type, v_target, v_reason, left(nullif(btrim(coalesce(p->>'detail', '')), ''), 1000))
  returning id into v_id;
  perform public.moim__log(p_moim, p_actor, 'user', 'report_created', v_id, jsonb_build_object('target_type', v_type));
  return jsonb_build_object('ok', true, 'report_id', v_id);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim__assert_questions_clean(p_questions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_q jsonb;
  v_text text;
  v_word text;
  v_words text[];
begin
  if jsonb_typeof(p_questions) <> 'array' then return; end if;
  select coalesce(question_banned_words, '{}'::text[]) || coalesce(banned_words, '{}'::text[]) into v_words from public.moim_policies where id = 1;
  v_words := coalesce(v_words, '{}'::text[]);
  for v_q in select * from jsonb_array_elements(p_questions) loop
    v_text := lower(btrim(coalesce(v_q #>> '{}', '')));
    if v_text = '' then continue; end if;
    foreach v_word in array v_words loop
      if btrim(coalesce(v_word, '')) <> '' and position(lower(btrim(v_word)) in v_text) > 0 then
        perform public.moim__fail('moim_banned_word');
      end if;
    end loop;
  end loop;
end
$function$;
drop function if exists public.moim__question_banned_words();
CREATE OR REPLACE FUNCTION public.moim_admin_policies_save(p_admin uuid, p jsonb, p_expected_updated_at timestamp with time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_before public.moim_policies;
  v_key text;
  v_int_keys text[] := array['max_moims_per_user', 'max_capacity', 'max_co_hosts', 'max_staff', 'max_custom_boards', 'max_pinned_notices',
    'join_request_expire_days', 'closed_retention_days', 'schedule_room_archive_days', 'invite_resend_days', 'inactive_unlist_days',
    'name_min_len', 'name_max_len', 'intro_min_len', 'intro_max_len'];
  v_words text[];
  v_qwords text[];
  v_types jsonb;
  v_reasons jsonb;
  v_after public.moim_policies;
  v_bad int;
begin
  select * into v_before from public.moim_policies where id = 1 for update;
  if p_expected_updated_at is null or v_before.updated_at <> p_expected_updated_at then perform public.moim__fail('moim_conflict'); end if;
  for v_key in select jsonb_object_keys(p) loop
    if v_key not in ('banned_words', 'question_banned_words', 'prohibited_types', 'report_reasons') and not (v_key = any(v_int_keys)) then perform public.moim__fail('moim_policy_invalid'); end if;
    if v_key = any(v_int_keys) and jsonb_typeof(p->v_key) not in ('number', 'null') then perform public.moim__fail('moim_policy_invalid'); end if;
  end loop;
  if p ? 'banned_words' then
    if jsonb_typeof(p->'banned_words') <> 'array' then perform public.moim__fail('moim_policy_invalid'); end if;
    select coalesce(array_agg(distinct left(btrim(w), 40)) filter (where btrim(w) <> ''), '{}') into v_words
      from jsonb_array_elements_text(p->'banned_words') w;
    if array_length(v_words, 1) > 500 then perform public.moim__fail('moim_policy_invalid'); end if;
  end if;
  if p ? 'question_banned_words' then
    if jsonb_typeof(p->'question_banned_words') <> 'array' then perform public.moim__fail('moim_policy_invalid'); end if;
    select coalesce(array_agg(distinct left(btrim(w), 40)) filter (where btrim(w) <> ''), '{}') into v_qwords
      from jsonb_array_elements_text(p->'question_banned_words') w;
    if array_length(v_qwords, 1) > 500 then perform public.moim__fail('moim_policy_invalid'); end if;
  end if;
  if p ? 'prohibited_types' then
    v_types := p->'prohibited_types';
    if jsonb_typeof(v_types) <> 'array' or jsonb_array_length(v_types) > 20 then perform public.moim__fail('moim_policy_invalid'); end if;
    select count(*) into v_bad from jsonb_array_elements(v_types) x
     where jsonb_typeof(x) <> 'object' or coalesce(x->>'code', '') !~ '^[a-z_]{2,40}$'
        or char_length(btrim(coalesce(x->>'label_ko', ''))) not between 1 and 80 or char_length(coalesce(x->>'label_en', '')) > 80;
    if v_bad > 0 or (select count(distinct x->>'code') from jsonb_array_elements(v_types) x) <> jsonb_array_length(v_types) then
      perform public.moim__fail('moim_policy_invalid');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('code', x->>'code', 'label_ko', btrim(x->>'label_ko'), 'label_en', btrim(coalesce(x->>'label_en', '')))), '[]'::jsonb)
      into v_types from jsonb_array_elements(v_types) x;
  end if;
  if p ? 'report_reasons' then
    v_reasons := p->'report_reasons';
    if jsonb_typeof(v_reasons) <> 'array' or jsonb_array_length(v_reasons) > 30 then perform public.moim__fail('moim_policy_invalid'); end if;
    select count(*) into v_bad from jsonb_array_elements(v_reasons) x
     where jsonb_typeof(x) <> 'object' or coalesce(x->>'code', '') !~ '^[a-z_]{2,40}$'
        or char_length(btrim(coalesce(x->>'label_ko', ''))) not between 1 and 80 or char_length(coalesce(x->>'label_en', '')) > 80
        or jsonb_typeof(coalesce(x->'is_active', 'true'::jsonb)) <> 'boolean';
    if v_bad > 0 or (select count(distinct x->>'code') from jsonb_array_elements(v_reasons) x) <> jsonb_array_length(v_reasons) then
      perform public.moim__fail('moim_policy_invalid');
    end if;
    -- a reason code that was ever offered is kept (past reports keep their name): deactivate instead of removing
    if exists (select 1 from jsonb_array_elements(coalesce(v_before.report_reasons, '[]'::jsonb)) o
                where not exists (select 1 from jsonb_array_elements(v_reasons) n where n->>'code' = o->>'code')) then
      perform public.moim__fail('moim_policy_report_reason_removed');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('code', x->>'code', 'label_ko', btrim(x->>'label_ko'), 'label_en', btrim(coalesce(x->>'label_en', '')),
             'is_active', coalesce((x->>'is_active')::boolean, true))), '[]'::jsonb)
      into v_reasons from jsonb_array_elements(v_reasons) x;
  end if;
  begin
    update public.moim_policies set
      max_moims_per_user = case when p ? 'max_moims_per_user' then (p->>'max_moims_per_user')::int else max_moims_per_user end,
      max_capacity = case when p ? 'max_capacity' then (p->>'max_capacity')::int else max_capacity end,
      max_co_hosts = case when p ? 'max_co_hosts' then (p->>'max_co_hosts')::int else max_co_hosts end,
      max_staff = case when p ? 'max_staff' then (p->>'max_staff')::int else max_staff end,
      max_custom_boards = case when p ? 'max_custom_boards' then (p->>'max_custom_boards')::int else max_custom_boards end,
      max_pinned_notices = case when p ? 'max_pinned_notices' then (p->>'max_pinned_notices')::int else max_pinned_notices end,
      join_request_expire_days = case when p ? 'join_request_expire_days' then (p->>'join_request_expire_days')::int else join_request_expire_days end,
      closed_retention_days = case when p ? 'closed_retention_days' then (p->>'closed_retention_days')::int else closed_retention_days end,
      schedule_room_archive_days = case when p ? 'schedule_room_archive_days' then (p->>'schedule_room_archive_days')::int else schedule_room_archive_days end,
      invite_resend_days = case when p ? 'invite_resend_days' then (p->>'invite_resend_days')::int else invite_resend_days end,
      inactive_unlist_days = case when p ? 'inactive_unlist_days' then (p->>'inactive_unlist_days')::int else inactive_unlist_days end,
      name_min_len = case when p ? 'name_min_len' then (p->>'name_min_len')::int else name_min_len end,
      name_max_len = case when p ? 'name_max_len' then (p->>'name_max_len')::int else name_max_len end,
      intro_min_len = case when p ? 'intro_min_len' then (p->>'intro_min_len')::int else intro_min_len end,
      intro_max_len = case when p ? 'intro_max_len' then (p->>'intro_max_len')::int else intro_max_len end,
      banned_words = case when p ? 'banned_words' then v_words else banned_words end,
      question_banned_words = case when p ? 'question_banned_words' then v_qwords else question_banned_words end,
      prohibited_types = case when p ? 'prohibited_types' then v_types else prohibited_types end,
      report_reasons = case when p ? 'report_reasons' then v_reasons else report_reasons end,
      updated_at = now(), updated_by = p_admin
    where id = 1
    returning * into v_after;
  exception when check_violation or numeric_value_out_of_range or invalid_text_representation then
    perform public.moim__fail('moim_policy_invalid');
  end;
  if (v_after.name_min_len is not null and v_after.name_max_len is not null and v_after.name_min_len > v_after.name_max_len)
     or (v_after.intro_min_len is not null and v_after.intro_max_len is not null and v_after.intro_min_len > v_after.intro_max_len)
     or coalesce(v_after.name_min_len, 1) < 0 or coalesce(v_after.intro_min_len, 0) < 0 then
    perform public.moim__fail('moim_policy_invalid');
  end if;
  perform public.moim__admin_log(null, p_admin, 'admin_policies_updated', null, v_reason, to_jsonb(v_before), to_jsonb(v_after));
  return jsonb_build_object('ok', true, 'updated_at', v_after.updated_at);
end
$function$;
create table if not exists public.moim_retention_archived_participants (
  moim_id uuid not null references public.moims(id) on delete cascade,
  room_id uuid not null,
  user_id uuid not null,
  archived_at timestamptz not null default now(),
  primary key (moim_id, room_id, user_id)
);
alter table public.moim_retention_archived_participants enable row level security;
revoke all on table public.moim_retention_archived_participants from public, anon, authenticated;
grant all on table public.moim_retention_archived_participants to service_role;
CREATE OR REPLACE FUNCTION public.moim_closed_retention_due(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_days int;
  v_m record;
  v_rooms uuid[];
  v_n int := 0;
begin
  select closed_retention_days into v_days from public.moim_policies where id = 1;
  if v_days is null then return jsonb_build_object('ok', true, 'ended', 0, 'policy', null); end if;
  for v_m in
    select m.* from public.moims m
     where m.retention_ended_at is null
       and ((m.status = 'closed' and m.closed_at is not null and m.closed_at <= now() - make_interval(days => v_days))
         or (m.status = 'deleted' and coalesce(m.closed_at, m.deleted_at) <= now() - make_interval(days => v_days)))
     order by coalesce(m.closed_at, m.deleted_at)
     limit greatest(1, least(p_limit, 500))
     for update skip locked
  loop
    select array_remove(array_agg(distinct r), null) into v_rooms from (
      select v_m.main_room_id as r
      union all
      select room_id from public.moim_schedules where moim_id = v_m.id and room_id is not null
    ) x;
    perform public.moim__writer_on();
    insert into public.moim_retention_archived_participants (moim_id, room_id, user_id)
    select v_m.id, p.room_id, p.user_id from public.community_messenger_participants p
     where p.room_id = any (v_rooms) and p.left_at is null and not p.is_archived
    on conflict do nothing;
    perform public.moim__rooms_archive(v_rooms);
    update public.moim_schedules set room_archived_at = coalesce(room_archived_at, now()) where moim_id = v_m.id and room_id is not null;
    update public.moims set retention_ended_at = now() where id = v_m.id;
    perform public.moim__log(v_m.id, null, 'system', 'closed_retention_ended', v_m.id, jsonb_build_object('days', v_days));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'ended', v_n, 'policy', v_days);
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
  update public.moims set status = v_status, deleted_at = null, deleted_by = null, retention_ended_at = null, updated_at = now() where id = p_moim;
  -- D-3: rows the retention run archived come back (main + schedule rooms); rows a user archived stay archived
  if v_m.retention_ended_at is not null then
    perform public.moim__writer_on();
    update public.community_messenger_participants p
       set is_archived = false
      from public.moim_retention_archived_participants a
     where a.moim_id = p_moim and p.room_id = a.room_id and p.user_id = a.user_id and p.left_at is null and p.is_archived;
    delete from public.moim_retention_archived_participants where moim_id = p_moim;
    update public.moim_schedules set room_archived_at = null where moim_id = p_moim and room_archived_at = v_m.retention_ended_at;
  end if;
  if v_status = 'active' and v_m.platform_state <> 'blocked' then
    perform public.moim__rooms_set_locked(p_moim, false);
  end if;
  perform public.moim__admin_log(p_moim, p_admin, 'admin_restored', p_moim, v_reason, jsonb_build_object('status', 'deleted'), jsonb_build_object('status', v_status));
  return jsonb_build_object('ok', true, 'status', v_status, 'name', v_m.name, 'notify_user_ids', public.moim__active_member_ids(p_moim));
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_album_remove(p_actor uuid, p_item uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_i record;
begin
  select * into v_i from public.moim_album_items where id = p_item for update;
  if not found or v_i.status <> 'active' then perform public.moim__fail('moim_album_not_found'); end if;
  if v_i.uploader_id = p_actor then
    update public.moim_album_items set status = 'deleted', is_pinned = false where id = p_item;
    return jsonb_build_object('ok', true, 'result', 'deleted');
  end if;
  if not public.moim_actor_can(v_i.moim_id, p_actor, 'hide_post') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_album_items set status = 'hidden', is_pinned = false where id = p_item;
  perform public.moim__log(v_i.moim_id, p_actor, 'user', 'album_hidden', p_item, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'result', 'hidden');
end
$function$;
drop function if exists public.moim_post_visible_to(uuid, uuid);
CREATE OR REPLACE FUNCTION public.cm_moim_guard_rooms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_writer boolean := coalesce(current_setting('dibay.moim_writer', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and (new.owner_domain is distinct from old.owner_domain or new.owner_ref_id is distinct from old.owner_ref_id) then
    raise exception 'moim_room_owner_immutable' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if new.owner_domain is not null and not v_writer then
      raise exception 'moim_room_create_requires_moim' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if old.owner_domain is null or v_writer then
    return new;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id
     or new.deleted_at is distinct from old.deleted_at
     or new.room_type is distinct from old.room_type
     or new.visibility is distinct from old.visibility
     or new.join_policy is distinct from old.join_policy
     or new.is_discoverable is distinct from old.is_discoverable
     or new.invite_link_enabled is distinct from old.invite_link_enabled
     or new.invite_token is distinct from old.invite_token
     or new.allow_member_invite is distinct from old.allow_member_invite
     or new.allow_admin_invite is distinct from old.allow_admin_invite
     or new.allow_admin_kick is distinct from old.allow_admin_kick
     or new.title is distinct from old.title
     or new.avatar_url is distinct from old.avatar_url
     or new.member_limit is distinct from old.member_limit
     or new.identity_policy is distinct from old.identity_policy
     or new.notice_text is distinct from old.notice_text
     or new.notice_updated_at is distinct from old.notice_updated_at
     or new.notice_updated_by is distinct from old.notice_updated_by
     or new.allow_admin_edit_notice is distinct from old.allow_admin_edit_notice
     or new.is_readonly is distinct from old.is_readonly then
    raise exception 'moim_room_settings_managed_by_moim' using errcode = 'P0001';
  end if;
  return new;
end
$function$;
create index if not exists idx_moims_category_id_fk on public.moims (category_id);
create index if not exists idx_moims_main_room_id_fk on public.moims (main_room_id);
create index if not exists idx_moims_created_by_fk on public.moims (created_by);
create index if not exists idx_moim_member_profile_history_moim_id_fk on public.moim_member_profile_history (moim_id);
create index if not exists idx_moim_member_profile_history_user_id_fk on public.moim_member_profile_history (user_id);
create index if not exists idx_moim_join_requests_user_id_fk on public.moim_join_requests (user_id);
create index if not exists idx_moim_join_requests_invite_id_fk on public.moim_join_requests (invite_id);
create index if not exists idx_moim_bans_user_id_fk on public.moim_bans (user_id);
create index if not exists idx_moim_bans_moim_id_fk on public.moim_bans (moim_id);
create index if not exists idx_moim_invites_created_by_fk on public.moim_invites (created_by);
create index if not exists idx_moim_invite_targets_inviter_id_fk on public.moim_invite_targets (inviter_id);
create index if not exists idx_moim_boards_moim_id_fk on public.moim_boards (moim_id);
create index if not exists idx_moim_posts_board_id_fk on public.moim_posts (board_id);
create index if not exists idx_moim_posts_author_id_fk on public.moim_posts (author_id);
create index if not exists idx_moim_comments_moim_id_fk on public.moim_comments (moim_id);
create index if not exists idx_moim_comments_author_id_fk on public.moim_comments (author_id);
create index if not exists idx_moim_schedules_host_user_id_fk on public.moim_schedules (host_user_id);
create index if not exists idx_moim_schedules_room_id_fk on public.moim_schedules (room_id);
create index if not exists idx_moim_schedule_participants_user_id_fk on public.moim_schedule_participants (user_id);
create index if not exists idx_moim_album_items_uploader_id_fk on public.moim_album_items (uploader_id);
create index if not exists idx_moim_album_items_schedule_id_fk on public.moim_album_items (schedule_id);
create index if not exists idx_moim_host_transfers_moim_id_fk on public.moim_host_transfers (moim_id);
create index if not exists idx_moim_reports_reporter_id_fk on public.moim_reports (reporter_id);
create index if not exists idx_moim_sanctions_source_report_id_fk on public.moim_sanctions (source_report_id);
create index if not exists idx_moim_notification_prefs_user_id_fk on public.moim_notification_prefs (user_id);
create index if not exists idx_moim_reports_moim_status_type on public.moim_reports (moim_id, status, target_type);
revoke all on function public.moim__report_reason_active(text) from public, anon, authenticated;
grant execute on function public.moim__report_reason_active(text) to service_role;

