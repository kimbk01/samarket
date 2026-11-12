-- 모임 카테고리 「기타」 직접 주제 (Owner 2026-11-12 「권장안으로 구현」 — docs/design/moim/moim-category-dropdown-custom-topic-2026-11-12.md §3·§4)
-- 카테고리에 「직접 주제 입력」 표시(allow_custom_topic) → 그 카테고리 모임은 모임장이 주제(topic_label)를 직접 적는다.
-- 주제 검사(서버): 필수 · 2~20자 · 공백 정리 · 운영 금칙어 · 이미 있는 카테고리 이름(ko·en, 대소문자·공백 무시)과 같으면 거부.
-- 다른 카테고리로 바꾸면 주제는 비운다. 모임 0개(2026-11-12 조회) → 이전 데이터 채우기 없음.
begin;

alter table public.moim_categories add column if not exists allow_custom_topic boolean not null default false;
alter table public.moims add column if not exists topic_label text null;
alter table public.moims drop constraint if exists moims_topic_label_len;
alter table public.moims add constraint moims_topic_label_len check (topic_label is null or char_length(topic_label) between 2 and 20);

update public.moim_categories set allow_custom_topic = true, updated_at = now() where slug = 'etc' and allow_custom_topic = false;

/** 주제 확정 — 카테고리가 직접 주제를 받지 않으면 NULL, 받으면 검사 후 정리한 값. 실패 시 예외 */
create or replace function public.moim__topic_resolve(p_category uuid, p_raw text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_allow boolean;
  v_topic text := btrim(regexp_replace(coalesce(p_raw, ''), '\s+', ' ', 'g'));
  v_key text;
  v_word text;
begin
  select allow_custom_topic into v_allow from public.moim_categories where id = p_category;
  if not coalesce(v_allow, false) then return null; end if;
  if v_topic = '' then perform public.moim__fail('moim_topic_required'); end if;
  if char_length(v_topic) < 2 or char_length(v_topic) > 20 then perform public.moim__fail('moim_topic_length'); end if;
  foreach v_word in array coalesce((select banned_words from public.moim_policies where id = 1), '{}') loop
    if v_word <> '' and position(lower(v_word) in lower(v_topic)) > 0 then perform public.moim__fail('moim_banned_word'); end if;
  end loop;
  v_key := lower(regexp_replace(v_topic, '\s', '', 'g'));
  if exists (select 1 from public.moim_categories c
              where c.is_active
                and (lower(regexp_replace(c.label_ko, '\s', '', 'g')) = v_key or lower(regexp_replace(c.label_en, '\s', '', 'g')) = v_key)) then
    perform public.moim__fail('moim_topic_matches_category');
  end if;
  return v_topic;
end
$$;

create or replace function public.moim_create(p_actor uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
  if v_lgu is null or btrim(v_lgu) = '' then perform public.moim__fail('moim_address_required'); end if;

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
$$;

create or replace function public.moim_update_info(p_actor uuid, p_moim uuid, p jsonb, p_expected_updated_at timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
$$;

create or replace function public.moim_admin_update_info(p_admin uuid, p_moim uuid, p jsonb, p_expected_updated_at timestamptz, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
$$;

create or replace function public.moim_admin_category_save(p_admin uuid, p jsonb, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_slug text := btrim(coalesce(p->>'slug', ''));
  v_ko text := btrim(coalesce(p->>'label_ko', ''));
  v_en text := btrim(coalesce(p->>'label_en', ''));
  v_before record;
  v_out uuid;
begin
  if v_slug !~ '^[a-z0-9_]{2,40}$' then perform public.moim__fail('moim_category_slug_invalid'); end if;
  if char_length(v_ko) not between 1 and 40 or char_length(v_en) not between 1 and 40 then perform public.moim__fail('moim_category_label_invalid'); end if;
  if exists (select 1 from public.moim_categories where slug = v_slug and id is distinct from v_id) then perform public.moim__fail('moim_category_slug_taken'); end if;
  if v_id is null then
    insert into public.moim_categories (slug, label_ko, label_en, sort_order, is_active, is_restricted, allow_custom_topic)
    values (v_slug, v_ko, v_en, coalesce((p->>'sort_order')::int, 0), coalesce((p->>'is_active')::boolean, true), coalesce((p->>'is_restricted')::boolean, false), coalesce((p->>'allow_custom_topic')::boolean, false))
    returning id into v_out;
    perform public.moim__admin_log(null, p_admin, 'admin_category_created', v_out, v_reason, null, p);
  else
    select * into v_before from public.moim_categories where id = v_id for update;
    if not found then perform public.moim__fail('moim_category_invalid'); end if;
    if nullif(p->>'expected_updated_at', '')::timestamptz is distinct from v_before.updated_at then perform public.moim__fail('moim_conflict'); end if;
    update public.moim_categories set
      slug = v_slug, label_ko = v_ko, label_en = v_en,
      sort_order = coalesce((p->>'sort_order')::int, sort_order),
      is_active = coalesce((p->>'is_active')::boolean, is_active),
      is_restricted = coalesce((p->>'is_restricted')::boolean, is_restricted),
      allow_custom_topic = coalesce((p->>'allow_custom_topic')::boolean, allow_custom_topic),
      updated_at = now()
    where id = v_id;
    v_out := v_id;
    perform public.moim__admin_log(null, p_admin, 'admin_category_updated', v_id, v_reason, to_jsonb(v_before), p);
  end if;
  return jsonb_build_object('ok', true, 'category_id', v_out, 'updated_at', (select updated_at from public.moim_categories where id = v_out));
end
$$;

-- 실행 권한: service_role 만 (기존 함수는 create or replace 로 권한 유지 — 같은 규칙으로 다시 고정)
do $grant$
declare f record;
begin
  for f in
    select p.oid::regprocedure sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('moim__topic_resolve', 'moim_create', 'moim_update_info', 'moim_admin_update_info', 'moim_admin_category_save')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end
$grant$;

commit;
