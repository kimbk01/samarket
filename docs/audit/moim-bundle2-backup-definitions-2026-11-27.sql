-- 모임 2번 묶음 적용 전 운영 정의 백업 (함수 17개 · 2026-11-27 · 운영 per-function md5 = 저장소 로컬 정의, moim_cron_tick 제외 97/98 일치 확인)
-- 롤백: 이 파일의 함수 정의를 그대로 실행.
-- md5 7bae595616adac5f376c83bd7c862e19
CREATE OR REPLACE FUNCTION public.moim__deactivate_member(p_moim uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_room uuid;
begin
  for v_room in select public.moim__rooms_of(p_moim) loop
    perform public.moim__room_member_deactivate(v_room, p_user);
  end loop;
  update public.moim_schedule_participants sp
     set status = 'cancelled', updated_at = now()
    from public.moim_schedules s
   where sp.schedule_id = s.id and s.moim_id = p_moim and sp.user_id = p_user
     and sp.status in ('requested', 'confirmed') and s.status in ('recruiting', 'full', 'closed') and s.starts_at > now();
  perform public.moim__refresh_count(p_moim);
end
$function$
;
-- md5 54189c45e22f3517ed1ae6cf300893ac
CREATE OR REPLACE FUNCTION public.moim__schedule_can_manage(p_schedule uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.moim_schedules s
      join public.moims m on m.id = s.moim_id
     where s.id = p_schedule and m.status = 'active' and m.platform_state <> 'blocked'
       and public.moim_actor_role(s.moim_id, p_actor) is not null
       and (s.host_user_id = p_actor or public.moim__role_rank(public.moim_actor_role(s.moim_id, p_actor)) >= public.moim__role_rank('co_host'))
  );
$function$
;
-- md5 48539ec33a985464c42c5ef258691223
CREATE OR REPLACE FUNCTION public.moim_admin_assign_host(p_admin uuid, p_moim uuid, p_to uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_m record;
begin
  select * into v_m from public.moims where id = p_moim for update;
  if not found or v_m.status <> 'active' then perform public.moim__fail('moim_not_found'); end if;
  if p_to = v_m.host_user_id then perform public.moim__fail('moim_cannot_target_host'); end if;
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  perform public.moim__host_swap(p_moim, v_m.host_user_id, p_to);
  insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, reason, actor_id, decided_at)
  values (p_moim, v_m.host_user_id, p_to, 'admin', 'done', v_reason, p_admin, now());
  perform public.moim__admin_log(p_moim, p_admin, 'admin_host_assigned', p_to, v_reason,
    jsonb_build_object('host_user_id', v_m.host_user_id), jsonb_build_object('host_user_id', p_to));
  return jsonb_build_object('ok', true, 'moim_id', p_moim, 'from_user_id', v_m.host_user_id, 'notify_user_ids', public.moim__active_member_ids(p_moim));
end
$function$
;
-- md5 bdd28b7421ff836aaf614d844ad65636
CREATE OR REPLACE FUNCTION public.moim_admin_host_request_decide(p_admin uuid, p_transfer uuid, p_approve boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_t record;
  v_m record;
  v_last timestamptz;
begin
  select * into v_t from public.moim_host_transfers where id = p_transfer for update;
  if not found or v_t.kind <> 'inactive_request' or v_t.status <> 'requested' then perform public.moim__fail('moim_transfer_not_found'); end if;
  if not p_approve then
    update public.moim_host_transfers set status = 'declined', decided_at = now() where id = p_transfer;
    perform public.moim__admin_log(v_t.moim_id, p_admin, 'admin_host_request_declined', v_t.to_user_id, v_reason, null, null);
    return jsonb_build_object('ok', true, 'approved', false, 'moim_id', v_t.moim_id, 'requester_id', v_t.actor_id);
  end if;
  select * into v_m from public.moims where id = v_t.moim_id for update;
  if v_m.status <> 'active' then perform public.moim__fail('moim_not_found'); end if;
  if v_m.host_user_id <> v_t.from_user_id then perform public.moim__fail('moim_transfer_stale'); end if;
  select last_login_at into v_last from public.profiles where id = v_m.host_user_id;
  if v_last is not null and v_last > now() - interval '7 days' then perform public.moim__fail('moim_host_recently_active'); end if;
  perform public.moim__host_swap(v_t.moim_id, v_t.from_user_id, v_t.to_user_id);
  update public.moim_host_transfers set status = 'done', decided_at = now() where id = p_transfer;
  perform public.moim__admin_log(v_t.moim_id, p_admin, 'admin_host_request_approved', v_t.to_user_id, v_reason,
    jsonb_build_object('host_user_id', v_t.from_user_id, 'host_last_login_at', v_last), jsonb_build_object('host_user_id', v_t.to_user_id));
  return jsonb_build_object('ok', true, 'approved', true, 'moim_id', v_t.moim_id, 'from_user_id', v_t.from_user_id,
    'to_user_id', v_t.to_user_id, 'requester_id', v_t.actor_id, 'notify_user_ids', public.moim__active_member_ids(v_t.moim_id));
end
$function$
;
-- md5 d8aad7ece755c6adbf5e5b9b25181d71
CREATE OR REPLACE FUNCTION public.moim_admin_member_role(p_admin uuid, p_moim uuid, p_user uuid, p_role text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_cur text;
begin
  if p_role not in ('co_host', 'staff', 'member') then perform public.moim__fail('moim_role_invalid'); end if;
  if (select status from public.moims where id = p_moim) is distinct from 'active' then perform public.moim__fail('moim_not_found'); end if;
  select role into v_cur from public.moim_members where moim_id = p_moim and user_id = p_user and status = 'active' for update;
  if v_cur is null then perform public.moim__fail('moim_target_not_member'); end if;
  if v_cur = 'host' then perform public.moim__fail('moim_cannot_target_host'); end if;
  if v_cur = p_role then return jsonb_build_object('ok', true, 'changed', false); end if;
  if p_role in ('co_host', 'staff') and (
       select case p_role when 'co_host' then max_co_hosts else max_staff end from public.moim_policies where id = 1
     ) <= (select count(*) from public.moim_members where moim_id = p_moim and status = 'active' and role = p_role) then
    perform public.moim__fail('moim_role_limit');
  end if;
  update public.moim_members set role = p_role, role_changed_at = now(), updated_at = now() where moim_id = p_moim and user_id = p_user;
  perform public.moim__room_member_role((select main_room_id from public.moims where id = p_moim), p_user, p_role);
  perform public.moim__admin_log(p_moim, p_admin, 'admin_role_changed', p_user, v_reason, jsonb_build_object('role', v_cur), jsonb_build_object('role', p_role));
  return jsonb_build_object('ok', true, 'changed', true);
end
$function$
;
-- md5 7ea73400ee2a5e0ebd291d368b9526bc
CREATE OR REPLACE FUNCTION public.moim_admin_update_info(p_admin uuid, p_moim uuid, p jsonb, p_expected_updated_at timestamp with time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_pol public.moim_policies;
  v_word text;
  v_m record;
  v_before jsonb;
  v_name text;
  v_intro text;
  v_cap int;
  v_cat uuid;
  v_room uuid;
  v_q jsonb;
  v_i int := 0;
  v_topic text;
begin
  select * into v_m from public.moims where id = p_moim for update;
  if not found or v_m.status = 'deleted' then perform public.moim__fail('moim_not_found'); end if;
  if p_expected_updated_at is null or v_m.updated_at <> p_expected_updated_at then perform public.moim__fail('moim_conflict'); end if;
  v_before := jsonb_build_object('name', v_m.name, 'intro', v_m.intro, 'cover_image_url', v_m.cover_image_url, 'category_id', v_m.category_id, 'topic_label', v_m.topic_label,
    'capacity', v_m.capacity, 'join_mode', v_m.join_mode, 'lgu_id', v_m.lgu_id,
    'questions', (select coalesce(jsonb_agg(question order by sort_order), '[]'::jsonb) from public.moim_join_questions where moim_id = p_moim));
  v_name := case when p ? 'name' then btrim(coalesce(p->>'name', '')) else v_m.name end;
  v_intro := case when p ? 'intro' then btrim(coalesce(p->>'intro', '')) else v_m.intro end;
  v_cap := case when p ? 'capacity' then nullif(p->>'capacity', '')::int else v_m.capacity end;
  v_cat := case when p ? 'category_id' then nullif(p->>'category_id', '')::uuid else v_m.category_id end;
  select * into v_pol from public.moim_policies where id = 1;
  if char_length(v_name) < coalesce(v_pol.name_min_len, 1) or char_length(v_name) > coalesce(v_pol.name_max_len, 60) then perform public.moim__fail('moim_name_length'); end if;
  if char_length(v_intro) > coalesce(v_pol.intro_max_len, 2000) or (v_pol.intro_min_len is not null and char_length(v_intro) < v_pol.intro_min_len) then
    perform public.moim__fail('moim_intro_length');
  end if;
  if v_cap is not null and (v_cap < 2 or v_cap < v_m.member_count or (v_pol.max_capacity is not null and v_cap > v_pol.max_capacity)) then
    perform public.moim__fail('moim_capacity_invalid');
  end if;
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and (position(lower(v_word) in lower(v_name)) > 0 or position(lower(v_word) in lower(v_intro)) > 0) then
      perform public.moim__fail('moim_banned_word');
    end if;
  end loop;
  if not exists (select 1 from public.moim_categories where id = v_cat) then perform public.moim__fail('moim_category_invalid'); end if;
  v_topic := public.moim__topic_resolve(v_cat, case when p ? 'topic_label' then p->>'topic_label' else v_m.topic_label end);
  if p ? 'join_mode' and coalesce(p->>'join_mode', '') not in ('instant', 'approval') then perform public.moim__fail('moim_join_mode_invalid'); end if;
  if p ? 'lgu_id' and btrim(coalesce(p->>'lgu_id', '')) = '' then perform public.moim__fail('moim_region_required'); end if;
  update public.moims set
    name = v_name, intro = v_intro, capacity = v_cap, category_id = v_cat, topic_label = v_topic,
    cover_image_url = case when p ? 'cover_image_url' then nullif(p->>'cover_image_url', '') else cover_image_url end,
    join_mode = case when p ? 'join_mode' then p->>'join_mode' else join_mode end,
    lgu_id = case when p ? 'lgu_id' then btrim(p->>'lgu_id') else lgu_id end,
    updated_at = now()
  where id = p_moim;
  if jsonb_typeof(p->'questions') = 'array' then
    delete from public.moim_join_questions where moim_id = p_moim;
    for v_q in select * from jsonb_array_elements(p->'questions') loop
      if btrim(coalesce(v_q #>> '{}', '')) <> '' then
        v_i := v_i + 1;
        if v_i > 3 then perform public.moim__fail('moim_questions_too_many'); end if;
        insert into public.moim_join_questions (moim_id, sort_order, question) values (p_moim, v_i, left(btrim(v_q #>> '{}'), 200));
      end if;
    end loop;
  end if;
  if v_name <> v_m.name or (p ? 'cover_image_url') then
    perform public.moim__writer_on();
    select main_room_id into v_room from public.moims where id = p_moim;
    if v_room is not null then
      update public.community_messenger_rooms
         set title = left(v_name, 120), avatar_url = (select cover_image_url from public.moims where id = p_moim), updated_at = now()
       where id = v_room;
    end if;
  end if;
  perform public.moim__admin_log(p_moim, p_admin, 'admin_info_updated', p_moim, v_reason, v_before, p);
  return jsonb_build_object('ok', true, 'updated_at', (select updated_at from public.moims where id = p_moim), 'host_user_id', v_m.host_user_id, 'name', v_name);
end
$function$
;
-- md5 98ca94fab89ee951cbf44374cf68b420
CREATE OR REPLACE FUNCTION public.moim_close(p_actor uuid, p_moim uuid, p_confirm_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m record;
  v_room uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'close') then perform public.moim__fail('moim_forbidden'); end if;
  select * into v_m from public.moims where id = p_moim for update;
  if btrim(coalesce(p_confirm_name, '')) <> v_m.name then perform public.moim__fail('moim_confirm_name_mismatch'); end if;
  update public.moims set status = 'closed', closed_at = now(), updated_at = now() where id = p_moim;
  update public.moim_schedules set status = 'cancelled', updated_at = now() where moim_id = p_moim and status in ('recruiting', 'full', 'closed');
  update public.moim_join_requests set status = 'expired', decided_at = now() where moim_id = p_moim and status = 'pending';
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  perform public.moim__writer_on();
  for v_room in select public.moim__rooms_of(p_moim) loop
    update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_room;
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'closed', null, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$function$
;
-- md5 17a72f5a18820ca927964aefdbd8f9b2
CREATE OR REPLACE FUNCTION public.moim_create(p_actor uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pol public.moim_policies;
  v_prof record;
  v_lgu text;
  v_cat record;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_intro text := btrim(coalesce(p->>'intro', ''));
  v_join text := coalesce(p->>'join_mode', 'instant');
  v_cap int := nullif(p->>'capacity', '')::int;
  v_nick text;
  v_id uuid := gen_random_uuid();
  v_room uuid;
  v_q jsonb;
  v_i int := 0;
  v_word text;
  v_topic text;
begin
  select * into v_pol from public.moim_policies where id = 1;
  select id, nickname, avatar_url, phone_verified, deleted_at into v_prof from public.profiles where id = p_actor;
  if not found or v_prof.deleted_at is not null then perform public.moim__fail('moim_actor_invalid'); end if;
  if coalesce(v_prof.phone_verified, false) is not true then perform public.moim__fail('moim_phone_verification_required'); end if;

  select a.canonical_lgu_id into v_lgu from public.user_addresses a
   where a.user_id = p_actor and a.is_default_master = true and coalesce(a.is_active, true) = true
   order by a.canonical_lgu_id is null limit 1;
  if not found then perform public.moim__fail('moim_address_required'); end if;
  -- 저장된 LGU 가 있으면 이전과 똑같이 그 값을 쓴다(검사·가공 없음).
  -- 비어 있을 때만 서버가 주소 위치 단일 정의로 판정해 넘긴 값을 쓴다. 서버 값이 없는 요청(이 변경 전 코드)은 이전과 같은 오류.
  if v_lgu is null or btrim(v_lgu) = '' then
    v_lgu := nullif(btrim(coalesce(p->>'master_lgu_id', '')), '');
    if v_lgu is null then perform public.moim__fail('moim_address_required'); end if;
    if v_lgu !~ '^[0-9A-Za-z:_-]{2,40}$' then perform public.moim__fail('moim_address_city_unresolved'); end if;
  end if;

  select id, is_active, is_restricted into v_cat from public.moim_categories where id = nullif(p->>'category_id', '')::uuid;
  if not found or not v_cat.is_active or v_cat.is_restricted then perform public.moim__fail('moim_category_invalid'); end if;

  v_topic := public.moim__topic_resolve(v_cat.id, p->>'topic_label');
  if v_join not in ('instant', 'approval') then perform public.moim__fail('moim_join_mode_invalid'); end if;
  if char_length(v_name) < coalesce(v_pol.name_min_len, 1) or char_length(v_name) > coalesce(v_pol.name_max_len, 60) then
    perform public.moim__fail('moim_name_length');
  end if;
  if v_pol.intro_min_len is not null and char_length(v_intro) < v_pol.intro_min_len then perform public.moim__fail('moim_intro_length'); end if;
  if char_length(v_intro) > coalesce(v_pol.intro_max_len, 2000) then perform public.moim__fail('moim_intro_length'); end if;
  if v_cap is not null and (v_cap < 2 or (v_pol.max_capacity is not null and v_cap > v_pol.max_capacity)) then
    perform public.moim__fail('moim_capacity_invalid');
  end if;
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and (position(lower(v_word) in lower(v_name)) > 0 or position(lower(v_word) in lower(v_intro)) > 0) then
      perform public.moim__fail('moim_banned_word');
    end if;
  end loop;
  if v_pol.max_moims_per_user is not null and
     (select count(*) from public.moims where created_by = p_actor and status = 'active') >= v_pol.max_moims_per_user then
    perform public.moim__fail('moim_create_limit');
  end if;
  if exists (select 1 from public.moims where created_by = p_actor and status = 'active' and lgu_id = v_lgu and lower(name) = lower(v_name)) then
    perform public.moim__fail('moim_duplicate');
  end if;

  v_nick := btrim(coalesce(nullif(p->>'nickname', ''), v_prof.nickname, ''));
  if v_nick = '' then perform public.moim__fail('moim_nickname_required'); end if;

  insert into public.moims (id, name, intro, cover_image_url, category_id, topic_label, lgu_id, join_mode, capacity,
                            age_min_birth_year, age_max_birth_year, host_user_id, created_by)
  values (v_id, v_name, v_intro, nullif(p->>'cover_image_url', ''), v_cat.id, v_topic, v_lgu, v_join, v_cap,
          nullif(p->>'age_min_birth_year', '')::int, nullif(p->>'age_max_birth_year', '')::int, p_actor, p_actor);

  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio, joined_at)
  values (v_id, p_actor, 'host', 'active', v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), coalesce(p->>'bio', ''), now());

  insert into public.moim_boards (moim_id, kind, write_min_role, sort_order) values
    (v_id, 'notice', 'staff', 1), (v_id, 'free', 'member', 2), (v_id, 'greeting', 'member', 3), (v_id, 'review', 'member', 4);

  if jsonb_typeof(p->'questions') = 'array' then
    for v_q in select * from jsonb_array_elements(p->'questions') loop
      if btrim(coalesce(v_q #>> '{}', '')) <> '' then
        v_i := v_i + 1;
        if v_i > 3 then perform public.moim__fail('moim_questions_too_many'); end if;
        insert into public.moim_join_questions (moim_id, sort_order, question) values (v_id, v_i, left(btrim(v_q #>> '{}'), 200));
      end if;
    end loop;
  end if;

  v_room := public.moim__room_create('moim', v_id, p_actor, v_name, v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url));
  update public.moims set main_room_id = v_room, member_count = 1 where id = v_id;
  -- 방 사진 = 모임 대표 사진 (정보 수정 때도 같은 규칙)
  if nullif(p->>'cover_image_url', '') is not null then
    perform public.moim__writer_on();
    update public.community_messenger_rooms set avatar_url = nullif(p->>'cover_image_url', ''), updated_at = now() where id = v_room;
  end if;
  perform public.moim__log(v_id, p_actor, 'user', 'created', null, jsonb_build_object('join_mode', v_join));
  return jsonb_build_object('ok', true, 'moim_id', v_id, 'room_id', v_room);
end
$function$
;
-- md5 617b1c8e83c19c1b2affd8b2e0b5a98d
CREATE OR REPLACE FUNCTION public.moim_host_transfer_request(p_actor uuid, p_moim uuid, p_to uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'transfer_host') then perform public.moim__fail('moim_forbidden'); end if;
  if p_actor = p_to then perform public.moim__fail('moim_cannot_target_self'); end if;
  if not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_to and status = 'active') then
    perform public.moim__fail('moim_target_not_member');
  end if;
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, actor_id)
  values (p_moim, p_actor, p_to, 'direct', 'requested', p_actor) returning id into v_id;
  perform public.moim__log(p_moim, p_actor, 'user', 'host_transfer_requested', p_to, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'transfer_id', v_id);
end
$function$
;
-- md5 3827f060d57a48e3aab41013cda396c9
CREATE OR REPLACE FUNCTION public.moim_host_transfer_respond(p_actor uuid, p_transfer uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_t record;
begin
  select * into v_t from public.moim_host_transfers where id = p_transfer for update;
  if not found or v_t.kind <> 'direct' or v_t.status <> 'requested' or v_t.to_user_id <> p_actor then
    perform public.moim__fail('moim_transfer_not_found');
  end if;
  if not p_accept then
    update public.moim_host_transfers set status = 'declined', decided_at = now() where id = p_transfer;
    perform public.moim__log(v_t.moim_id, p_actor, 'user', 'host_transfer_declined', v_t.from_user_id, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'accepted', false);
  end if;
  if public.moim_actor_role(v_t.moim_id, v_t.from_user_id) is distinct from 'host' then perform public.moim__fail('moim_transfer_stale'); end if;
  if (select platform_state from public.moims where id = v_t.moim_id) in ('warned', 'blocked') then perform public.moim__fail('moim_transfer_blocked_by_warning'); end if;
  perform public.moim__host_swap(v_t.moim_id, v_t.from_user_id, p_actor);
  update public.moim_host_transfers set status = 'done', decided_at = now() where id = p_transfer;
  perform public.moim__log(v_t.moim_id, p_actor, 'user', 'host_changed', p_actor, jsonb_build_object('from', v_t.from_user_id, 'kind', 'direct'));
  return jsonb_build_object('ok', true, 'accepted', true, 'moim_id', v_t.moim_id);
end
$function$
;
-- md5 28829400f0a6d0788a68a52b21d02d86
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
begin
  perform public.moim__assert_joinable(p_moim, p_actor);
  select * into v_m from public.moims where id = p_moim;
  select status into v_cur from public.moim_members where moim_id = p_moim and user_id = p_actor;
  if v_cur = 'active' then perform public.moim__fail('moim_already_member'); end if;
  if v_cur = 'pending' then perform public.moim__fail('moim_already_pending'); end if;
  select nickname, avatar_url into v_prof from public.profiles where id = p_actor;
  v_nick := btrim(coalesce(nullif(p->>'nickname', ''), v_prof.nickname, ''));
  if v_nick = '' then perform public.moim__fail('moim_nickname_required'); end if;

  -- 링크로 들어온 가입(바로 가입·신청 모두) = 링크 사용 1회
  if nullif(p->>'invite_token', '') is not null then
    update public.moim_invites set usage_count = usage_count + 1
     where token = p->>'invite_token' and moim_id = p_moim and revoked_at is null and (expires_at is null or expires_at > now());
  end if;

  if v_m.join_mode = 'instant' then
    perform public.moim__activate_member(p_moim, p_actor, v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), p->>'bio', null, null);
    perform public.moim__log(p_moim, p_actor, 'user', 'member_joined', p_actor, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'status', 'active', 'room_id', v_m.main_room_id);
  end if;

  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio)
  values (p_moim, p_actor, 'member', 'pending', v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), coalesce(p->>'bio', ''))
  on conflict (moim_id, user_id) do update
    set status = 'pending', role = 'member', nickname = excluded.nickname, avatar_url = excluded.avatar_url, bio = excluded.bio, updated_at = now();
  insert into public.moim_join_requests (moim_id, user_id, answers)
  values (p_moim, p_actor, case when jsonb_typeof(p->'answers') = 'array' then p->'answers' else '[]'::jsonb end)
  returning id into v_req;
  perform public.moim__log(p_moim, p_actor, 'user', 'join_requested', v_req, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'status', 'pending', 'request_id', v_req);
end
$function$
;
-- md5 dad6c7981f232c94c32bb1490c912740
CREATE OR REPLACE FUNCTION public.moim_member_role_set(p_actor uuid, p_moim uuid, p_target uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pol public.moim_policies;
  v_cur text;
  v_room uuid;
begin
  if p_role not in ('co_host', 'staff', 'member') then perform public.moim__fail('moim_role_invalid'); end if;
  if not public.moim_actor_can(p_moim, p_actor, 'set_role') then perform public.moim__fail('moim_forbidden'); end if;
  if p_actor = p_target then perform public.moim__fail('moim_cannot_target_self'); end if;
  select role into v_cur from public.moim_members where moim_id = p_moim and user_id = p_target and status = 'active' for update;
  if v_cur is null then perform public.moim__fail('moim_target_not_member'); end if;
  if v_cur = 'host' then perform public.moim__fail('moim_forbidden'); end if;
  select * into v_pol from public.moim_policies where id = 1;
  if p_role = 'co_host' and v_pol.max_co_hosts is not null and v_cur <> 'co_host' and
     (select count(*) from public.moim_members where moim_id = p_moim and status = 'active' and role = 'co_host') >= v_pol.max_co_hosts then
    perform public.moim__fail('moim_role_limit');
  end if;
  if p_role = 'staff' and v_pol.max_staff is not null and v_cur <> 'staff' and
     (select count(*) from public.moim_members where moim_id = p_moim and status = 'active' and role = 'staff') >= v_pol.max_staff then
    perform public.moim__fail('moim_role_limit');
  end if;
  update public.moim_members set role = p_role, role_changed_at = now(), updated_at = now() where moim_id = p_moim and user_id = p_target;
  for v_room in select public.moim__rooms_of(p_moim) loop
    perform public.moim__room_member_role(v_room, p_target, p_role);
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'role_changed', p_target, jsonb_build_object('from', v_cur, 'to', p_role));
  return jsonb_build_object('ok', true);
end
$function$
;
-- md5 43f5fac052f3d5f88f2351da66e19b76
CREATE OR REPLACE FUNCTION public.moim_permission_defaults()
 RETURNS TABLE(action text, default_min_role text, adjustable boolean, floor_role text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  values
    ('edit_info',          'host',    false, 'host'),
    ('decide_join',        'staff',   true,  'staff'),
    ('manage_invite_link', 'staff',   true,  'staff'),
    ('send_invite',        'member',  true,  'member'),
    ('pin_notice',         'staff',   true,  'staff'),
    ('manage_boards',      'co_host', false, 'co_host'),
    ('hide_post',          'staff',   false, 'staff'),
    ('create_schedule',    'member',  true,  'member'),
    ('remove_member',      'co_host', true,  'staff'),
    ('ban_member',         'co_host', true,  'staff'),
    ('write_note',         'co_host', true,  'staff'),
    ('set_role',           'host',    false, 'host'),
    ('transfer_host',      'host',    false, 'host'),
    ('close',              'host',    false, 'host');
$function$
;
-- md5 c95c3a77ef961d85c2996eb0ed9dcc43
CREATE OR REPLACE FUNCTION public.moim_post_create(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := public.moim_actor_role(p_moim, p_actor);
  v_board record;
  v_title text := btrim(coalesce(p->>'title', ''));
  v_body text := btrim(coalesce(p->>'body', ''));
  v_vis text := coalesce(nullif(p->>'visibility', ''), 'members');
  v_id uuid;
  v_m record;
  v_word text;
  v_pol public.moim_policies;
begin
  select status, platform_state into v_m from public.moims where id = p_moim;
  if not found or v_m.status <> 'active' then perform public.moim__fail('moim_not_found'); end if;
  if v_m.platform_state = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  if v_role is null then perform public.moim__fail('moim_not_member'); end if;
  select * into v_board from public.moim_boards where id = nullif(p->>'board_id', '')::uuid and moim_id = p_moim and is_active;
  if not found then perform public.moim__fail('moim_board_not_found'); end if;
  if public.moim__role_rank(v_role) < public.moim__role_rank(v_board.write_min_role) then perform public.moim__fail('moim_forbidden'); end if;
  if v_vis not in ('members', 'public') then perform public.moim__fail('moim_visibility_invalid'); end if;
  if v_body = '' then perform public.moim__fail('moim_post_body_required'); end if;
  if char_length(v_title) > 120 or char_length(v_body) > 10000 then perform public.moim__fail('moim_post_too_long'); end if;
  if jsonb_typeof(coalesce(p->'images', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'images', '[]'::jsonb)) > 10 then
    perform public.moim__fail('moim_post_images_invalid');
  end if;
  select * into v_pol from public.moim_policies where id = 1;
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and (position(lower(v_word) in lower(v_title)) > 0 or position(lower(v_word) in lower(v_body)) > 0) then
      perform public.moim__fail('moim_banned_word');
    end if;
  end loop;
  insert into public.moim_posts (moim_id, board_id, author_id, title, body, images, visibility)
  values (p_moim, v_board.id, p_actor, v_title, v_body, coalesce(p->'images', '[]'::jsonb), v_vis)
  returning id into v_id;
  update public.moims set last_activity_at = now() where id = p_moim;
  perform public.moim__log(p_moim, p_actor, 'user', 'post_created', v_id, jsonb_build_object('board_kind', v_board.kind));
  return jsonb_build_object('ok', true, 'post_id', v_id, 'board_kind', v_board.kind);
end
$function$
;
-- md5 e49d965021b3b3f689c40ffdca01a0a5
CREATE OR REPLACE FUNCTION public.moim_post_update(p_actor uuid, p_post uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_po record;
  v_title text;
  v_body text;
  v_vis text;
begin
  select * into v_po from public.moim_posts where id = p_post for update;
  if not found or v_po.status <> 'active' then perform public.moim__fail('moim_post_not_found'); end if;
  if v_po.author_id <> p_actor or public.moim_actor_role(v_po.moim_id, p_actor) is null then perform public.moim__fail('moim_forbidden'); end if;
  if (select platform_state from public.moims where id = v_po.moim_id) = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  v_title := case when p ? 'title' then btrim(coalesce(p->>'title', '')) else v_po.title end;
  v_body := case when p ? 'body' then btrim(coalesce(p->>'body', '')) else v_po.body end;
  v_vis := case when p ? 'visibility' then p->>'visibility' else v_po.visibility end;
  if v_body = '' then perform public.moim__fail('moim_post_body_required'); end if;
  if char_length(v_title) > 120 or char_length(v_body) > 10000 then perform public.moim__fail('moim_post_too_long'); end if;
  if v_vis not in ('members', 'public') then perform public.moim__fail('moim_visibility_invalid'); end if;
  update public.moim_posts set title = v_title, body = v_body, visibility = v_vis,
    images = case when p ? 'images' then coalesce(p->'images', '[]'::jsonb) else images end, updated_at = now()
  where id = p_post;
  return jsonb_build_object('ok', true);
end
$function$
;
-- md5 de8a82292dd59cae328f82ed8393eda2
CREATE OR REPLACE FUNCTION public.moim_update_info(p_actor uuid, p_moim uuid, p jsonb, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pol public.moim_policies;
  v_m record;
  v_name text;
  v_intro text;
  v_cap int;
  v_cat uuid;
  v_room uuid;
  v_q jsonb;
  v_i int := 0;
  v_word text;
  v_topic text;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'edit_info') then perform public.moim__fail('moim_forbidden'); end if;
  select * into v_m from public.moims where id = p_moim for update;
  if p_expected_updated_at is null or v_m.updated_at <> p_expected_updated_at then perform public.moim__fail('moim_conflict'); end if;
  select * into v_pol from public.moim_policies where id = 1;
  v_name := case when p ? 'name' then btrim(coalesce(p->>'name', '')) else v_m.name end;
  v_intro := case when p ? 'intro' then btrim(coalesce(p->>'intro', '')) else v_m.intro end;
  v_cap := case when p ? 'capacity' then nullif(p->>'capacity', '')::int else v_m.capacity end;
  v_cat := case when p ? 'category_id' then nullif(p->>'category_id', '')::uuid else v_m.category_id end;
  if char_length(v_name) < coalesce(v_pol.name_min_len, 1) or char_length(v_name) > coalesce(v_pol.name_max_len, 60) then perform public.moim__fail('moim_name_length'); end if;
  if char_length(v_intro) > coalesce(v_pol.intro_max_len, 2000) or (v_pol.intro_min_len is not null and char_length(v_intro) < v_pol.intro_min_len) then
    perform public.moim__fail('moim_intro_length');
  end if;
  if v_cap is not null and (v_cap < 2 or v_cap < v_m.member_count or (v_pol.max_capacity is not null and v_cap > v_pol.max_capacity)) then
    perform public.moim__fail('moim_capacity_invalid');
  end if;
  if not exists (select 1 from public.moim_categories where id = v_cat and is_active and not is_restricted) then perform public.moim__fail('moim_category_invalid'); end if;
  v_topic := public.moim__topic_resolve(v_cat, case when p ? 'topic_label' then p->>'topic_label' else v_m.topic_label end);
  foreach v_word in array coalesce(v_pol.banned_words, '{}') loop
    if v_word <> '' and (position(lower(v_word) in lower(v_name)) > 0 or position(lower(v_word) in lower(v_intro)) > 0) then
      perform public.moim__fail('moim_banned_word');
    end if;
  end loop;
  update public.moims set
    name = v_name, intro = v_intro, capacity = v_cap, category_id = v_cat, topic_label = v_topic,
    cover_image_url = case when p ? 'cover_image_url' then nullif(p->>'cover_image_url', '') else cover_image_url end,
    join_mode = case when p->>'join_mode' in ('instant', 'approval') then p->>'join_mode' else join_mode end,
    age_min_birth_year = case when p ? 'age_min_birth_year' then nullif(p->>'age_min_birth_year', '')::int else age_min_birth_year end,
    age_max_birth_year = case when p ? 'age_max_birth_year' then nullif(p->>'age_max_birth_year', '')::int else age_max_birth_year end,
    updated_at = now()
  where id = p_moim;
  if jsonb_typeof(p->'questions') = 'array' then
    delete from public.moim_join_questions where moim_id = p_moim;
    for v_q in select * from jsonb_array_elements(p->'questions') loop
      if btrim(coalesce(v_q #>> '{}', '')) <> '' then
        v_i := v_i + 1;
        if v_i > 3 then perform public.moim__fail('moim_questions_too_many'); end if;
        insert into public.moim_join_questions (moim_id, sort_order, question) values (p_moim, v_i, left(btrim(v_q #>> '{}'), 200));
      end if;
    end loop;
  end if;
  if v_name <> v_m.name or (p ? 'cover_image_url') then
    perform public.moim__writer_on();
    select main_room_id into v_room from public.moims where id = p_moim;
    if v_room is not null then
      update public.community_messenger_rooms
         set title = left(v_name, 120),
             avatar_url = (select cover_image_url from public.moims where id = p_moim),
             updated_at = now()
       where id = v_room;
    end if;
  end if;
  perform public.moim__log(p_moim, p_actor, 'user', 'info_updated', null, p);
  return jsonb_build_object('ok', true, 'updated_at', (select updated_at from public.moims where id = p_moim));
end
$function$
;
-- md5 915cae174d5a63fe353d4f95c27757a5
CREATE OR REPLACE FUNCTION public.moim_comment_remove(p_actor uuid, p_comment uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_c record;
begin
  select * into v_c from public.moim_comments where id = p_comment for update;
  if not found or v_c.status <> 'active' then perform public.moim__fail('moim_comment_not_found'); end if;
  if v_c.author_id <> p_actor and not public.moim_actor_can(v_c.moim_id, p_actor, 'hide_post') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_comments set status = case when v_c.author_id = p_actor then 'deleted' else 'hidden' end, updated_at = now() where id = p_comment;
  update public.moim_posts set comment_count = greatest(comment_count - 1, 0) where id = v_c.post_id;
  return jsonb_build_object('ok', true);
end
$function$

;
