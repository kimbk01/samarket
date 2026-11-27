-- 모임 2번 묶음 — 권한·가입·초대·탈퇴 (2026-11-27 모임 전체 감사 B1·B6·B7·B8·B9·B10·B12·B13·D4·E5)
-- 설계: docs/audit/moim-bundle2-design-2026-11-27.md (Owner 「구현 승인」 2026-11-27)
-- 적용 전 운영 정의 백업: docs/audit/moim-bundle2-backup-definitions-2026-11-27.sql (함수 17개 · md5 기록)
-- 독립 재감사 반영: 댓글 삭제의 null 작성자 비교(M1) · 활성 모임 모임장 필수 제약 · 어드민 지정 오류 순서
-- 아래 함수들은 백업(운영 현재 정의)에서 표시한 부분만 바꿨다.

-- ─────────────────────────────────────────────────────────────
-- B6 권한표 (설계 §5.2 · 시안 U7): 내보내기·차단 = 부모임장 이상 고정, 운영진 메모 = 운영진 기본·조정 가능
-- ─────────────────────────────────────────────────────────────
create or replace function public.moim_permission_defaults()
 returns table(action text, default_min_role text, adjustable boolean, floor_role text)
 language sql
 immutable
 set search_path to 'public'
as $function$
  values
    ('edit_info',          'host',    false, 'host'),
    ('decide_join',        'staff',   true,  'staff'),
    ('manage_invite_link', 'staff',   true,  'staff'),
    ('send_invite',        'member',  true,  'member'),
    ('pin_notice',         'staff',   true,  'staff'),
    ('manage_boards',      'co_host', false, 'co_host'),
    ('hide_post',          'staff',   false, 'staff'),
    ('create_schedule',    'member',  true,  'member'),
    ('remove_member',      'co_host', false, 'co_host'),
    ('ban_member',         'co_host', false, 'co_host'),
    ('write_note',         'staff',   true,  'staff'),
    ('set_role',           'host',    false, 'host'),
    ('transfer_host',      'host',    false, 'host'),
    ('close',              'host',    false, 'host');
$function$;

-- ─────────────────────────────────────────────────────────────
-- B1 탈퇴·내보내기 뒤 일정 확정 인원·정원 상태 다시 세기
-- ─────────────────────────────────────────────────────────────
create or replace function public.moim__deactivate_member(p_moim uuid, p_user uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_room uuid;
  v_ids uuid[];
  v_s uuid;
begin
  for v_room in select public.moim__rooms_of(p_moim) loop
    perform public.moim__room_member_deactivate(v_room, p_user);
  end loop;
  -- B1: 취소되는 일정 참여의 일정 id 를 모아 확정 인원·정원 상태를 다시 센다
  select array_agg(distinct sp.schedule_id) into v_ids
    from public.moim_schedule_participants sp
    join public.moim_schedules s on s.id = sp.schedule_id
   where s.moim_id = p_moim and sp.user_id = p_user
     and sp.status in ('requested', 'confirmed') and s.status in ('recruiting', 'full', 'closed') and s.starts_at > now();
  update public.moim_schedule_participants sp
     set status = 'cancelled', updated_at = now()
    from public.moim_schedules s
   where sp.schedule_id = s.id and s.moim_id = p_moim and sp.user_id = p_user
     and sp.status in ('requested', 'confirmed') and s.status in ('recruiting', 'full', 'closed') and s.starts_at > now();
  foreach v_s in array coalesce(v_ids, '{}'::uuid[]) loop
    perform public.moim__schedule_refresh(v_s);
  end loop;
  perform public.moim__refresh_count(p_moim);
end
$function$;

-- ─────────────────────────────────────────────────────────────
-- B7 가입 질문 금지어 (설계 §4 「실명·전화번호·신분증 요구 금지 — 질문 저장 때 금지어 검사」)
--     목록 = 승인된 기본 목록(설계안 B7) + 운영 정책 금지어. 운영 정책값(글·이름 검사에도 쓰임)은 바꾸지 않는다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.moim__question_banned_words()
 returns text[]
 language sql
 immutable
 set search_path to 'public'
as $function$
  select array[
    '전화번호', '휴대폰 번호', '핸드폰 번호', '연락처', '카톡 아이디', '실명', '본명', '주민번호', '주민등록', '신분증', '여권',
    'phone number', 'mobile number', 'contact number', 'real name', 'full name', 'id card', 'passport', 'kakao id'
  ]::text[];
$function$;

create or replace function public.moim__assert_questions_clean(p_questions jsonb)
 returns void
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_q jsonb;
  v_text text;
  v_word text;
  v_words text[];
begin
  if jsonb_typeof(p_questions) <> 'array' then return; end if;
  v_words := public.moim__question_banned_words() || coalesce((select banned_words from public.moim_policies where id = 1), '{}'::text[]);
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

-- ─────────────────────────────────────────────────────────────
-- E5 같은 모임 중복 생성 방지: 활성 모임 (개설자, 동네, 이름) 유니크 + 개설자 단위 잠금
-- ─────────────────────────────────────────────────────────────
create unique index if not exists moims_active_creator_name_uidx
  on public.moims (created_by, lgu_id, lower(name)) where status = 'active';

-- moim_create: 1번 묶음(20271128100000) 정의 + B7(질문 금지어) + E5(잠금·유니크 위반 → moim_duplicate)
create or replace function public.moim_create(p_actor uuid, p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  -- E5: 같은 개설자의 동시 개설을 한 줄로 (중복 이름·1인 개설 수 검사가 동시 요청에도 맞게)
  perform pg_advisory_xact_lock(hashtextextended('moim_create:' || p_actor::text, 0));
  select * into v_pol from public.moim_policies where id = 1;
  select id, nickname, avatar_url, phone_verified, deleted_at into v_prof from public.profiles where id = p_actor;
  if not found or v_prof.deleted_at is not null then perform public.moim__fail('moim_actor_invalid'); end if;
  if coalesce(v_prof.phone_verified, false) is not true then perform public.moim__fail('moim_phone_verification_required'); end if;

  select a.canonical_lgu_id into v_lgu from public.user_addresses a
   where a.user_id = p_actor and a.is_default_master = true and coalesce(a.is_active, true) = true
   order by a.canonical_lgu_id is null limit 1;
  if not found then perform public.moim__fail('moim_address_required'); end if;
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
  perform public.moim__assert_questions_clean(p->'questions');
  if v_pol.max_moims_per_user is not null and
     (select count(*) from public.moims where created_by = p_actor and status = 'active') >= v_pol.max_moims_per_user then
    perform public.moim__fail('moim_create_limit');
  end if;
  if exists (select 1 from public.moims where created_by = p_actor and status = 'active' and lgu_id = v_lgu and lower(name) = lower(v_name)) then
    perform public.moim__fail('moim_duplicate');
  end if;

  v_nick := btrim(coalesce(nullif(p->>'nickname', ''), v_prof.nickname, ''));
  if v_nick = '' then perform public.moim__fail('moim_nickname_required'); end if;

  begin
    insert into public.moims (id, name, intro, cover_image_url, category_id, topic_label, lgu_id, join_mode, capacity,
                              age_min_birth_year, age_max_birth_year, host_user_id, created_by)
    values (v_id, v_name, v_intro, nullif(p->>'cover_image_url', ''), v_cat.id, v_topic, v_lgu, v_join, v_cap,
            nullif(p->>'age_min_birth_year', '')::int, nullif(p->>'age_max_birth_year', '')::int, p_actor, p_actor);
  exception when unique_violation then
    perform public.moim__fail('moim_duplicate');
  end;

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
$function$;

-- moim_update_info: + B7(질문 금지어) + E5(이름 변경이 유니크에 걸리면 moim_duplicate)
create or replace function public.moim_update_info(p_actor uuid, p_moim uuid, p jsonb, p_expected_updated_at timestamp with time zone)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  perform public.moim__assert_questions_clean(p->'questions');
  begin
    update public.moims set
      name = v_name, intro = v_intro, capacity = v_cap, category_id = v_cat, topic_label = v_topic,
      cover_image_url = case when p ? 'cover_image_url' then nullif(p->>'cover_image_url', '') else cover_image_url end,
      join_mode = case when p->>'join_mode' in ('instant', 'approval') then p->>'join_mode' else join_mode end,
      age_min_birth_year = case when p ? 'age_min_birth_year' then nullif(p->>'age_min_birth_year', '')::int else age_min_birth_year end,
      age_max_birth_year = case when p ? 'age_max_birth_year' then nullif(p->>'age_max_birth_year', '')::int else age_max_birth_year end,
      updated_at = now()
    where id = p_moim;
  exception when unique_violation then
    perform public.moim__fail('moim_duplicate');
  end;
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
$function$;

-- moim_admin_update_info: + B7(질문 금지어) + E5(유니크 위반 → moim_duplicate)
create or replace function public.moim_admin_update_info(p_admin uuid, p_moim uuid, p jsonb, p_expected_updated_at timestamp with time zone, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  perform public.moim__assert_questions_clean(p->'questions');
  if not exists (select 1 from public.moim_categories where id = v_cat) then perform public.moim__fail('moim_category_invalid'); end if;
  v_topic := public.moim__topic_resolve(v_cat, case when p ? 'topic_label' then p->>'topic_label' else v_m.topic_label end);
  if p ? 'join_mode' and coalesce(p->>'join_mode', '') not in ('instant', 'approval') then perform public.moim__fail('moim_join_mode_invalid'); end if;
  if p ? 'lgu_id' and btrim(coalesce(p->>'lgu_id', '')) = '' then perform public.moim__fail('moim_region_required'); end if;
  begin
    update public.moims set
      name = v_name, intro = v_intro, capacity = v_cap, category_id = v_cat, topic_label = v_topic,
      cover_image_url = case when p ? 'cover_image_url' then nullif(p->>'cover_image_url', '') else cover_image_url end,
      join_mode = case when p ? 'join_mode' then p->>'join_mode' else join_mode end,
      lgu_id = case when p ? 'lgu_id' then btrim(p->>'lgu_id') else lgu_id end,
      updated_at = now()
    where id = p_moim;
  exception when unique_violation then
    perform public.moim__fail('moim_duplicate');
  end;
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
$function$;

-- ─────────────────────────────────────────────────────────────
-- B9 역할 변경: 전체 방 + 대상이 호스트가 아닌 일정 방만 (일정 호스트의 일정 방 방장 권한 유지)
-- ─────────────────────────────────────────────────────────────
create or replace function public.moim_member_role_set(p_actor uuid, p_moim uuid, p_target uuid, p_role text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  -- B9: 대상이 호스트인 일정 방은 제외 (그 방의 방장 = 일정 호스트, 설계 §3.3)
  for v_room in
    select r from public.moim__rooms_of(p_moim) r
     where not exists (select 1 from public.moim_schedules s where s.room_id = r and s.host_user_id = p_target)
  loop
    perform public.moim__room_member_role(v_room, p_target, p_role);
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'role_changed', p_target, jsonb_build_object('from', v_cur, 'to', p_role));
  return jsonb_build_object('ok', true);
end
$function$;

-- ─────────────────────────────────────────────────────────────
-- B10 가입 신청 답변 = 그 시점 질문 문장과 짝으로 저장 (질문을 고쳐도 답변이 다른 질문에 붙지 않게)
-- ─────────────────────────────────────────────────────────────
create or replace function public.moim_join(p_actor uuid, p_moim uuid, p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_m record;
  v_cur text;
  v_prof record;
  v_nick text;
  v_req uuid;
  v_answers jsonb;
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

  -- B10: [{question, answer}] — 답변 순서 = 질문 순서(sort_order 1부터)
  select coalesce(jsonb_agg(jsonb_build_object(
           'question', q.question,
           'answer', left(coalesce(case when jsonb_typeof(p->'answers') = 'array' then p->'answers'->>(q.sort_order - 1) end, ''), 1000)
         ) order by q.sort_order), '[]'::jsonb)
    into v_answers
    from public.moim_join_questions q where q.moim_id = p_moim;

  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio)
  values (p_moim, p_actor, 'member', 'pending', v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), coalesce(p->>'bio', ''))
  on conflict (moim_id, user_id) do update
    set status = 'pending', role = 'member', nickname = excluded.nickname, avatar_url = excluded.avatar_url, bio = excluded.bio, updated_at = now();
  insert into public.moim_join_requests (moim_id, user_id, answers)
  values (p_moim, p_actor, v_answers)
  returning id into v_req;
  perform public.moim__log(p_moim, p_actor, 'user', 'join_requested', v_req, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'status', 'pending', 'request_id', v_req);
end
$function$;

-- ─────────────────────────────────────────────────────────────
-- B12 위임 뒤 부모임장 상한: 이전 모임장이 부모임장이 될 자리가 없으면 위임 거부 (P8 + D6 둘 다 지킴)
-- ─────────────────────────────────────────────────────────────
create or replace function public.moim__assert_host_swap_cap(p_moim uuid, p_to uuid)
 returns void
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_max int;
  v_cnt int;
  v_to_is_co boolean;
begin
  select max_co_hosts into v_max from public.moim_policies where id = 1;
  if v_max is null then return; end if;
  select count(*) filter (where role = 'co_host'), coalesce(bool_or(user_id = p_to and role = 'co_host'), false)
    into v_cnt, v_to_is_co
    from public.moim_members where moim_id = p_moim and status = 'active';
  -- 위임 뒤 부모임장 수 = 지금 수 − (받는 사람이 부모임장이면 1) + 1(이전 모임장)
  if v_cnt - (case when v_to_is_co then 1 else 0 end) + 1 > v_max then
    perform public.moim__fail('moim_transfer_co_host_full');
  end if;
end
$function$;

create or replace function public.moim_host_transfer_request(p_actor uuid, p_moim uuid, p_to uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'transfer_host') then perform public.moim__fail('moim_forbidden'); end if;
  if p_actor = p_to then perform public.moim__fail('moim_cannot_target_self'); end if;
  if not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_to and status = 'active') then
    perform public.moim__fail('moim_target_not_member');
  end if;
  perform public.moim__assert_host_swap_cap(p_moim, p_to);
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, actor_id)
  values (p_moim, p_actor, p_to, 'direct', 'requested', p_actor) returning id into v_id;
  perform public.moim__log(p_moim, p_actor, 'user', 'host_transfer_requested', p_to, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'transfer_id', v_id);
end
$function$;

create or replace function public.moim_host_transfer_respond(p_actor uuid, p_transfer uuid, p_accept boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  perform public.moim__assert_host_swap_cap(v_t.moim_id, p_actor);
  perform public.moim__host_swap(v_t.moim_id, v_t.from_user_id, p_actor);
  update public.moim_host_transfers set status = 'done', decided_at = now() where id = p_transfer;
  perform public.moim__log(v_t.moim_id, p_actor, 'user', 'host_changed', p_actor, jsonb_build_object('from', v_t.from_user_id, 'kind', 'direct'));
  return jsonb_build_object('ok', true, 'accepted', true, 'moim_id', v_t.moim_id);
end
$function$;

create or replace function public.moim_admin_assign_host(p_admin uuid, p_moim uuid, p_to uuid, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_m record;
begin
  select * into v_m from public.moims where id = p_moim for update;
  if not found or v_m.status <> 'active' then perform public.moim__fail('moim_not_found'); end if;
  if p_to = v_m.host_user_id then perform public.moim__fail('moim_cannot_target_host'); end if;
  if not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_to and status = 'active') then
    perform public.moim__fail('moim_target_not_member');
  end if;
  perform public.moim__assert_host_swap_cap(p_moim, p_to);
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  perform public.moim__host_swap(p_moim, v_m.host_user_id, p_to);
  insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, reason, actor_id, decided_at)
  values (p_moim, v_m.host_user_id, p_to, 'admin', 'done', v_reason, p_admin, now());
  perform public.moim__admin_log(p_moim, p_admin, 'admin_host_assigned', p_to, v_reason,
    jsonb_build_object('host_user_id', v_m.host_user_id), jsonb_build_object('host_user_id', p_to));
  return jsonb_build_object('ok', true, 'moim_id', p_moim, 'from_user_id', v_m.host_user_id, 'notify_user_ids', public.moim__active_member_ids(p_moim));
end
$function$;

create or replace function public.moim_admin_host_request_decide(p_admin uuid, p_transfer uuid, p_approve boolean, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  perform public.moim__assert_host_swap_cap(v_t.moim_id, v_t.to_user_id);
  perform public.moim__host_swap(v_t.moim_id, v_t.from_user_id, v_t.to_user_id);
  update public.moim_host_transfers set status = 'done', decided_at = now() where id = p_transfer;
  perform public.moim__admin_log(v_t.moim_id, p_admin, 'admin_host_request_approved', v_t.to_user_id, v_reason,
    jsonb_build_object('host_user_id', v_t.from_user_id, 'host_last_login_at', v_last), jsonb_build_object('host_user_id', v_t.to_user_id));
  return jsonb_build_object('ok', true, 'approved', true, 'moim_id', v_t.moim_id, 'from_user_id', v_t.from_user_id,
    'to_user_id', v_t.to_user_id, 'requester_id', v_t.actor_id, 'notify_user_ids', public.moim__active_member_ids(v_t.moim_id));
end
$function$;

-- ─────────────────────────────────────────────────────────────
-- B13 모임 종료: 대기 멤버 행 정리(신청 만료와 같은 'cancelled')
-- ─────────────────────────────────────────────────────────────
create or replace function public.moim_close(p_actor uuid, p_moim uuid, p_confirm_name text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  update public.moim_members set status = 'cancelled', updated_at = now() where moim_id = p_moim and status = 'pending';
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  perform public.moim__writer_on();
  for v_room in select public.moim__rooms_of(p_moim) loop
    update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_room;
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'closed', null, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$function$;

-- ─────────────────────────────────────────────────────────────
-- D4 공지 게시판 쓰기·수정 = 공지 고정 권한(pin_notice) 하나로 판정 (설계 §5.2 「공지 작성·고정」 한 줄)
-- ─────────────────────────────────────────────────────────────
create or replace function public.moim_post_create(p_actor uuid, p_moim uuid, p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if v_board.kind = 'notice' then
    if not public.moim_actor_can(p_moim, p_actor, 'pin_notice') then perform public.moim__fail('moim_forbidden'); end if;
  elsif public.moim__role_rank(v_role) < public.moim__role_rank(v_board.write_min_role) then
    perform public.moim__fail('moim_forbidden');
  end if;
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
$function$;

create or replace function public.moim_post_update(p_actor uuid, p_post uuid, p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_po record;
  v_title text;
  v_body text;
  v_vis text;
begin
  select * into v_po from public.moim_posts where id = p_post for update;
  if not found or v_po.status <> 'active' then perform public.moim__fail('moim_post_not_found'); end if;
  if v_po.author_id is distinct from p_actor or public.moim_actor_role(v_po.moim_id, p_actor) is null then perform public.moim__fail('moim_forbidden'); end if;
  if (select platform_state from public.moims where id = v_po.moim_id) = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  if (select kind from public.moim_boards where id = v_po.board_id) = 'notice'
     and not public.moim_actor_can(v_po.moim_id, p_actor, 'pin_notice') then
    perform public.moim__fail('moim_forbidden');
  end if;
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
$function$;

-- ─────────────────────────────────────────────────────────────
-- B8 회원 탈퇴·영구 삭제 전 모임 정리 (설계 P8 순서 자동 위임 · 멤버 없으면 종료)
-- ─────────────────────────────────────────────────────────────
create or replace function public.moim_account_cleanup(p_user uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- 1) 모임장인 활성 모임 + 어드민이 삭제한 「활성이던」 모임(복구하면 활성으로 돌아감 — moim_admin_restore):
  --    부모임장(먼저 지정) → 운영진(먼저 지정) → 가장 오래된 멤버 순으로 위임, 없으면 종료
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
      -- 삭제된 모임: 상태는 그대로 두고 종료 시각만 남긴다 → 나중에 복구해도 「종료」로 돌아가 모임장 없는 활성 모임이 생기지 않는다
      update public.moims set closed_at = now(), updated_at = now() where id = v_m.id;
      perform public.moim__log(v_m.id, null, 'system', 'closed', null, jsonb_build_object('reason', 'account_withdrawal', 'host', p_user, 'deleted', true));
      v_closed := v_closed + 1;
    else
      update public.moims set status = 'closed', closed_at = now(), updated_at = now() where id = v_m.id;
      update public.moim_schedules set status = 'cancelled', updated_at = now() where moim_id = v_m.id and status in ('recruiting', 'full', 'closed');
      update public.moim_join_requests set status = 'expired', decided_at = now() where moim_id = v_m.id and status = 'pending';
      update public.moim_members set status = 'cancelled', updated_at = now() where moim_id = v_m.id and status = 'pending';
      perform public.moim__writer_on();
      for v_room in select public.moim__rooms_of(v_m.id) loop
        update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_room;
      end loop;
      perform public.moim__log(v_m.id, null, 'system', 'closed', null, jsonb_build_object('reason', 'account_withdrawal', 'host', p_user));
      v_closed := v_closed + 1;
    end if;
  end loop;

  -- 2) 모든 모임의 활성 멤버 → 나감(방 퇴장·일정 참여 취소 포함), 대기 멤버 → 취소
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

  -- 3) 대기 가입 신청 취소, 4) 대기 초대(받은 것 거절 · 보낸 것 취소)
  update public.moim_join_requests set status = 'cancelled', decided_at = now() where user_id = p_user and status = 'pending';
  update public.moim_invite_targets set status = 'declined', responded_at = now() where invitee_user_id = p_user and status = 'sent';
  update public.moim_invite_targets set status = 'cancelled', responded_at = now() where inviter_id = p_user and status = 'sent';

  -- handovers: 새 모임장이 생긴 모임 — 라우트가 전체 멤버에게 moim_host_changed 를 보낸다(설계 §7)
  return jsonb_build_object('ok', true, 'transferred', v_transferred, 'closed', v_closed, 'left', v_left, 'handovers', v_handovers);
end
$function$;

revoke all on function public.moim_account_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.moim_account_cleanup(uuid) to service_role;
revoke all on function public.moim__assert_host_swap_cap(uuid, uuid) from public, anon, authenticated;
revoke all on function public.moim__assert_questions_clean(jsonb) from public, anon, authenticated;
revoke all on function public.moim__question_banned_words() from public, anon, authenticated;

-- B8 FK: 영구 삭제가 모임 기록에 막히지 않게
--   소속·개인 설정 행 = 삭제와 함께 지움 / 작성 기록 = 남기고 사람 연결만 끊음(작성자 표시 「나간 멤버」, 설계 P5)
alter table public.moim_members drop constraint if exists moim_members_user_id_fkey,
  add constraint moim_members_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.moim_join_requests drop constraint if exists moim_join_requests_user_id_fkey,
  add constraint moim_join_requests_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.moim_bans drop constraint if exists moim_bans_user_id_fkey,
  add constraint moim_bans_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.moim_invite_targets drop constraint if exists moim_invite_targets_invitee_user_id_fkey,
  add constraint moim_invite_targets_invitee_user_id_fkey foreign key (invitee_user_id) references public.profiles(id) on delete cascade;
alter table public.moim_invite_targets drop constraint if exists moim_invite_targets_inviter_id_fkey,
  add constraint moim_invite_targets_inviter_id_fkey foreign key (inviter_id) references public.profiles(id) on delete cascade;
alter table public.moim_notification_prefs drop constraint if exists moim_notification_prefs_user_id_fkey,
  add constraint moim_notification_prefs_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.moim_schedule_participants drop constraint if exists moim_schedule_participants_user_id_fkey,
  add constraint moim_schedule_participants_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.moim_posts alter column author_id drop not null;
alter table public.moim_posts drop constraint if exists moim_posts_author_id_fkey,
  add constraint moim_posts_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.moim_comments alter column author_id drop not null;
alter table public.moim_comments drop constraint if exists moim_comments_author_id_fkey,
  add constraint moim_comments_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.moim_album_items alter column uploader_id drop not null;
alter table public.moim_album_items drop constraint if exists moim_album_items_uploader_id_fkey,
  add constraint moim_album_items_uploader_id_fkey foreign key (uploader_id) references public.profiles(id) on delete set null;
alter table public.moim_reports alter column reporter_id drop not null;
alter table public.moim_reports drop constraint if exists moim_reports_reporter_id_fkey,
  add constraint moim_reports_reporter_id_fkey foreign key (reporter_id) references public.profiles(id) on delete set null;
alter table public.moim_schedules alter column host_user_id drop not null;
alter table public.moim_schedules drop constraint if exists moim_schedules_host_user_id_fkey,
  add constraint moim_schedules_host_user_id_fkey foreign key (host_user_id) references public.profiles(id) on delete set null;
alter table public.moims alter column host_user_id drop not null;
alter table public.moims drop constraint if exists moims_host_user_id_fkey,
  add constraint moims_host_user_id_fkey foreign key (host_user_id) references public.profiles(id) on delete set null;
alter table public.moims alter column created_by drop not null;
alter table public.moims drop constraint if exists moims_created_by_fkey,
  add constraint moims_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

-- B8 보완 (독립 재감사): 작성자 계정이 영구 삭제된 댓글(author_id null)을 아무나 숨기지 못하게 — null 안전 비교
create or replace function public.moim_comment_remove(p_actor uuid, p_comment uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_c record;
begin
  select * into v_c from public.moim_comments where id = p_comment for update;
  if not found or v_c.status <> 'active' then perform public.moim__fail('moim_comment_not_found'); end if;
  if v_c.author_id is distinct from p_actor and not public.moim_actor_can(v_c.moim_id, p_actor, 'hide_post') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_comments set status = case when v_c.author_id = p_actor then 'deleted' else 'hidden' end, updated_at = now() where id = p_comment;
  update public.moim_posts set comment_count = greatest(comment_count - 1, 0) where id = v_c.post_id;
  return jsonb_build_object('ok', true);
end
$function$;

-- B8 보완 (독립 재감사): 활성 모임은 모임장이 반드시 있다 — 정리 함수를 거치지 않은 계정 삭제가 활성 모임의 모임장을 지우지 못하게
-- (모임장 계정 삭제는 moim_account_cleanup 으로 먼저 위임·종료해야 한다)
alter table public.moims drop constraint if exists moims_active_has_host;
alter table public.moims add constraint moims_active_has_host check (status <> 'active' or host_user_id is not null);
