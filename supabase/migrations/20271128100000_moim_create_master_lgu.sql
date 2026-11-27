-- 모임 개설 — 활동 동네(대표 주소 시/군 LGU) 판정 보완 (2026-11-27 모임 전체 감사 A1)
--
-- 결함: 대표 주소 행의 canonical_lgu_id 가 비어 있으면(운영 2026-11-27: 대표 주소 62명 중 26명)
--       주소가 있어도 'moim_address_required'(「대표 주소를 먼저 등록해 주세요」)로 거부했다.
--       주소 위치 단일 정의(lib/addresses/address-location-ssot.server.ts deriveAddressLocation)로는 26건 중 25건이 시/군 확정.
-- 수정: 저장된 LGU 가 있으면 그 값(변경 없음). 비어 있을 때만 서버가 같은 단일 정의로 판정해 넘긴 p->>'master_lgu_id' 를 쓴다.
--       대표 주소가 없거나 서버 값이 없으면 'moim_address_required'(이전과 같음), 서버 값 형식이 틀리면 'moim_address_city_unresolved'.
--       시/군을 정할 수 없는 주소는 서버(app/api/moim/route.ts)가 RPC 전에 'moim_address_city_unresolved' 로 거절한다.
--       적용 순서: 이 함수는 서버 값이 없는 요청에 이전과 똑같이 동작하므로 DB 적용 → 코드 병합 순서로 화면 공백 없음.
--       이 함수는 service_role 만 실행한다(m2 grant). master_lgu_id 는 요청 본문이 아니라 서버가 채운다(app/api/moim/route.ts).
-- 그 밖의 본문은 운영 현재 정의(20271113600000_moim_category_custom_topic.sql, 운영 md5 eee5980a25035205b19982008ecce9a1)와 같다.

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
$function$;
