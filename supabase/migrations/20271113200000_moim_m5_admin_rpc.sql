-- =============================================================================
-- M5 — 모임 어드민(§8): 정보 수정 · 멤버 조치 · 모임장 지정 · 미접속 위임 요청 큐 · 콘텐츠 숨김/복구/삭제
--      · 제재(추천 제외·경고·차단) 적용/해제/만료 · 모임 삭제/복구 · 카테고리 · 운영 정책
-- Owner 2026-11-12 「M5 진행」 · 설계 docs/design/moim/moim-design-v1-2026-11-12.md §6 P8 · P14 · P15 · §8
--
-- 원칙 (M2~M4 와 같음)
--   · 서버(service_role) RPC 만. 어드민 권한(권한 키 moim / 삭제는 최고관리자)은 API 가 판정하고 p_admin 으로 넘긴다.
--   · 모든 어드민 쓰기는 사유 필수, moim_events(actor_kind='admin') 와 audit_logs 에 같은 트랜잭션으로 기록.
--   · 신고 → 제재 연결 · 신고 결과 알림은 M6.
--
-- 함께 고치는 기존 결함 (M5 가 같은 함수를 쓰기 때문)
--   · moim__host_swap: 일정 방까지 방장을 바꿔 일정 호스트가 다른 일정 방에서 방장 고유 인덱스 위반 → 모임 전체 방만 바꾼다.
--   · moim_host_transfer_respond: 어드민 큐로 가는 미접속 위임 요청(kind='inactive_request')을 후보자가 직접 수락할 수 있었음 → direct 만.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. 기존 함수 보정
-- -----------------------------------------------------------------------------
/** 모임장 교체 — 모임 전체 방만 (일정 방의 방장은 일정 호스트) */
create or replace function public.moim__host_swap(p_moim uuid, p_from uuid, p_to uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_room uuid;
begin
  if not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_to and status = 'active') then
    perform public.moim__fail('moim_target_not_member');
  end if;
  update public.moim_members set role = 'co_host', role_changed_at = now(), updated_at = now()
   where moim_id = p_moim and user_id = p_from and status = 'active' and role = 'host';
  update public.moim_members set role = 'host', role_changed_at = now(), updated_at = now()
   where moim_id = p_moim and user_id = p_to;
  update public.moims set host_user_id = p_to, updated_at = now() where id = p_moim;
  select main_room_id into v_room from public.moims where id = p_moim;
  -- 방장 고유 인덱스: 이전 방장을 먼저 내린다
  perform public.moim__room_member_role(v_room, p_from, 'co_host');
  perform public.moim__room_member_role(v_room, p_to, 'host');
end
$$;

create or replace function public.moim_host_transfer_respond(p_actor uuid, p_transfer uuid, p_accept boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
$$;

-- -----------------------------------------------------------------------------
-- 1. 도우미
-- -----------------------------------------------------------------------------
/** 사유 필수 (공백만 = 없음) */
create or replace function public.moim__admin_reason(p_reason text) returns text
language plpgsql immutable set search_path = public as $$
begin
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'moim_admin_reason_required' using errcode = 'P0001';
  end if;
  return left(btrim(p_reason), 500);
end
$$;

/** 어드민 기록 — moim_events + audit_logs */
create or replace function public.moim__admin_log(
  p_moim uuid, p_admin uuid, p_type text, p_target uuid, p_reason text, p_before jsonb, p_after jsonb
) returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if p_moim is not null then
    perform public.moim__log(p_moim, p_admin, 'admin', p_type, p_target,
      jsonb_build_object('reason', p_reason) || coalesce(case when p_after is null then null else jsonb_build_object('after', p_after) end, '{}'::jsonb));
  end if;
  insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  values ('admin', p_admin, 'moim', coalesce(coalesce(p_target, p_moim)::text, 'moim_policies'), 'moim.' || p_type,
          p_before, coalesce(p_after, '{}'::jsonb) || jsonb_build_object('reason', p_reason, 'moim_id', p_moim));
end
$$;

/** 모임 방 잠금/해제 — 잠금 해제는 모임 전체 방 + 진행 중 일정 방만 (끝난 일정 방은 읽기 전용 유지) */
create or replace function public.moim__rooms_set_locked(p_moim uuid, p_locked boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_room uuid;
begin
  perform public.moim__writer_on();
  if p_locked then
    for v_room in select public.moim__rooms_of(p_moim) loop
      update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_room and not is_readonly;
    end loop;
  else
    update public.community_messenger_rooms set is_readonly = false, updated_at = now()
     where is_readonly and (
       id = (select main_room_id from public.moims where id = p_moim)
       or id in (select room_id from public.moim_schedules where moim_id = p_moim and room_id is not null and status in ('recruiting', 'full', 'closed'))
     );
  end if;
end
$$;

/** 진행 중 제재로 platform_state 를 다시 계산한다. 차단 시작·해제 때 방 잠금도 맞춘다. 반환: 새 상태 */
create or replace function public.moim__platform_refresh(p_moim uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_m record;
  v_new text;
begin
  select status, platform_state into v_m from public.moims where id = p_moim for update;
  select case
           when bool_or(level = 'block') then 'blocked'
           when bool_or(level = 'warn') then 'warned'
           when bool_or(level = 'unlist') then 'unlisted'
           else 'normal' end
    into v_new
    from public.moim_sanctions
   where moim_id = p_moim and target_kind = 'moim' and level in ('unlist', 'warn', 'block')
     and revoked_at is null and starts_at <= now() and (ends_at is null or ends_at > now());
  v_new := coalesce(v_new, 'normal');
  if v_new is distinct from v_m.platform_state then
    update public.moims set platform_state = v_new, updated_at = now() where id = p_moim;
    if v_m.status = 'active' then
      if v_new = 'blocked' then
        perform public.moim__rooms_set_locked(p_moim, true);
      elsif v_m.platform_state = 'blocked' then
        perform public.moim__rooms_set_locked(p_moim, false);
      end if;
    end if;
  end if;
  return v_new;
end
$$;

/** 활성 멤버 id 목록 (알림용) */
create or replace function public.moim__active_member_ids(p_moim uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(user_id), '[]'::jsonb) from public.moim_members where moim_id = p_moim and status = 'active';
$$;

-- -----------------------------------------------------------------------------
-- 2. 사용자: 미접속 모임장 변경 요청 (P8) — 부모임장·운영진, 모임장 30일 이상 미접속
-- -----------------------------------------------------------------------------
create or replace function public.moim_host_inactive_request(p_actor uuid, p_moim uuid, p_to uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_m record;
  v_last timestamptz;
  v_id uuid;
begin
  select * into v_m from public.moims where id = p_moim for update;
  if not found or v_m.status <> 'active' then perform public.moim__fail('moim_not_found'); end if;
  if public.moim_actor_role(p_moim, p_actor) not in ('co_host', 'staff') or public.moim_actor_role(p_moim, p_actor) is null then
    perform public.moim__fail('moim_forbidden');
  end if;
  if p_to = v_m.host_user_id or not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_to and status = 'active') then
    perform public.moim__fail('moim_target_not_member');
  end if;
  select last_login_at into v_last from public.profiles where id = v_m.host_user_id;
  if v_last is not null and v_last > now() - interval '30 days' then perform public.moim__fail('moim_host_recently_active'); end if;
  if exists (select 1 from public.moim_host_transfers where moim_id = p_moim and status = 'requested') then
    perform public.moim__fail('moim_transfer_pending');
  end if;
  insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, reason, actor_id)
  values (p_moim, v_m.host_user_id, p_to, 'inactive_request', 'requested', left(nullif(btrim(coalesce(p_reason, '')), ''), 500), p_actor)
  returning id into v_id;
  perform public.moim__log(p_moim, p_actor, 'user', 'host_inactive_requested', p_to, jsonb_build_object('host_last_login_at', v_last));
  return jsonb_build_object('ok', true, 'transfer_id', v_id);
end
$$;

-- -----------------------------------------------------------------------------
-- 3. 어드민: 모임 정보 수정 (낙관적 잠금 · 사유 필수 · 모임장에게 알림)
-- -----------------------------------------------------------------------------
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
begin
  select * into v_m from public.moims where id = p_moim for update;
  if not found or v_m.status = 'deleted' then perform public.moim__fail('moim_not_found'); end if;
  if p_expected_updated_at is null or v_m.updated_at <> p_expected_updated_at then perform public.moim__fail('moim_conflict'); end if;
  v_before := jsonb_build_object('name', v_m.name, 'intro', v_m.intro, 'cover_image_url', v_m.cover_image_url, 'category_id', v_m.category_id,
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
  if p ? 'join_mode' and coalesce(p->>'join_mode', '') not in ('instant', 'approval') then perform public.moim__fail('moim_join_mode_invalid'); end if;
  if p ? 'lgu_id' and btrim(coalesce(p->>'lgu_id', '')) = '' then perform public.moim__fail('moim_region_required'); end if;
  update public.moims set
    name = v_name, intro = v_intro, capacity = v_cap, category_id = v_cat,
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

-- -----------------------------------------------------------------------------
-- 4. 어드민: 멤버 조치 (역할 · 내보내기 · 차단 · 차단 해제 · 모임장 지정)
-- -----------------------------------------------------------------------------
create or replace function public.moim_admin_member_role(p_admin uuid, p_moim uuid, p_user uuid, p_role text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
$$;

create or replace function public.moim_admin_member_remove(p_admin uuid, p_moim uuid, p_user uuid, p_ban boolean, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_t record;
  v_found boolean;
begin
  if not exists (select 1 from public.moims where id = p_moim and status <> 'deleted') then perform public.moim__fail('moim_not_found'); end if;
  select role, status into v_t from public.moim_members where moim_id = p_moim and user_id = p_user for update;
  v_found := found;
  if v_found and v_t.status = 'active' and v_t.role = 'host' then perform public.moim__fail('moim_cannot_target_host'); end if;
  if not p_ban and (not v_found or v_t.status not in ('active', 'pending')) then perform public.moim__fail('moim_target_not_member'); end if;
  if p_ban and not exists (select 1 from public.profiles where id = p_user) then perform public.moim__fail('moim_target_not_member'); end if;
  if v_found and (v_t.status in ('active', 'pending') or p_ban) then
    update public.moim_members
       set status = case when p_ban then 'banned' else 'kicked' end, role = 'member',
           left_at = case when v_t.status = 'active' then now() else left_at end,
           decided_by = p_admin, decided_at = now(), updated_at = now()
     where moim_id = p_moim and user_id = p_user;
    update public.moim_join_requests set status = 'rejected', decided_by = p_admin, decided_at = now()
     where moim_id = p_moim and user_id = p_user and status = 'pending';
    if v_t.status = 'active' then perform public.moim__deactivate_member(p_moim, p_user); end if;
  end if;
  if p_ban then
    insert into public.moim_bans (moim_id, user_id, banned_by, reason)
    select p_moim, p_user, p_admin, v_reason
     where not exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_user and released_at is null);
  end if;
  perform public.moim__admin_log(p_moim, p_admin, case when p_ban then 'admin_member_banned' else 'admin_member_removed' end, p_user, v_reason,
    case when v_found then jsonb_build_object('role', v_t.role, 'status', v_t.status) else null end, null);
  return jsonb_build_object('ok', true, 'was_active', coalesce(v_found and v_t.status = 'active', false));
end
$$;

create or replace function public.moim_admin_member_unban(p_admin uuid, p_moim uuid, p_user uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_id uuid;
begin
  update public.moim_bans set released_at = now(), released_by = p_admin
   where moim_id = p_moim and user_id = p_user and released_at is null returning id into v_id;
  if v_id is null then perform public.moim__fail('moim_ban_not_found'); end if;
  perform public.moim__admin_log(p_moim, p_admin, 'admin_member_unbanned', p_user, v_reason, null, null);
  return jsonb_build_object('ok', true);
end
$$;

/** 모임장 지정 (kind='admin'). 열린 위임 요청은 취소된다. 반환: 알림 대상(전체 멤버) */
create or replace function public.moim_admin_assign_host(p_admin uuid, p_moim uuid, p_to uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
$$;

/** 미접속 위임 요청 처리 — 승인 시 모임장이 최근 7일 안에 접속했으면 거부 */
create or replace function public.moim_admin_host_request_decide(p_admin uuid, p_transfer uuid, p_approve boolean, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
$$;

-- -----------------------------------------------------------------------------
-- 5. 어드민: 콘텐츠 숨김 · 복구 · 삭제 (글 · 댓글 · 사진), 일정 취소
--    삭제는 최고관리자만(API 판정). 삭제도 상태값만 바꾼다(행 삭제 없음).
-- -----------------------------------------------------------------------------
create or replace function public.moim_admin_content(p_admin uuid, p_type text, p_id uuid, p_action text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_moim uuid;
  v_status text;
  v_post uuid;
  v_new text;
  v_s record;
  v_users jsonb;
begin
  if p_type = 'schedule' then
    if p_action <> 'cancel' then perform public.moim__fail('moim_content_action_invalid'); end if;
    select * into v_s from public.moim_schedules where id = p_id for update;
    if not found then perform public.moim__fail('moim_content_not_found'); end if;
    if v_s.status in ('done', 'cancelled') then perform public.moim__fail('moim_schedule_finished'); end if;
    select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_users
      from public.moim_schedule_participants where schedule_id = p_id and status in ('confirmed', 'requested');
    update public.moim_schedules set status = 'cancelled', finished_at = now(), updated_at = now() where id = p_id;
    if v_s.room_id is not null then
      perform public.moim__writer_on();
      update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_s.room_id;
    end if;
    perform public.moim__admin_log(v_s.moim_id, p_admin, 'admin_schedule_cancelled', p_id, v_reason, jsonb_build_object('status', v_s.status), null);
    return jsonb_build_object('ok', true, 'moim_id', v_s.moim_id, 'title', v_s.title, 'notify_user_ids', v_users);
  end if;

  -- restore = 숨김 해제, undelete = 삭제 복구(최고관리자 — API 판정). 삭제된 항목은 restore 로 되살릴 수 없다.
  if p_action not in ('hide', 'restore', 'delete', 'undelete') then perform public.moim__fail('moim_content_action_invalid'); end if;
  v_new := case p_action when 'hide' then 'hidden' when 'delete' then 'deleted' else 'active' end;

  if p_type = 'post' then
    select moim_id, status into v_moim, v_status from public.moim_posts where id = p_id for update;
  elsif p_type = 'comment' then
    select moim_id, status, post_id into v_moim, v_status, v_post from public.moim_comments where id = p_id for update;
  elsif p_type = 'album' then
    select moim_id, status into v_moim, v_status from public.moim_album_items where id = p_id for update;
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
  return jsonb_build_object('ok', true, 'moim_id', v_moim, 'status', v_new);
end
$$;

-- -----------------------------------------------------------------------------
-- 6. 어드민: 제재 (추천 제외 · 경고 · 차단) — 적용 · 해제 · 만료
--    콘텐츠 숨김(content_hide)은 5번, 이용 제한(user_restrict)은 기존 커뮤니티 제재 경로. 신고 연결은 M6.
-- -----------------------------------------------------------------------------
create or replace function public.moim_admin_sanction_apply(
  p_admin uuid, p_moim uuid, p_level text, p_reason_code text, p_reason text, p_ends_at timestamptz
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_m record;
  v_id uuid;
  v_state text;
begin
  if p_level not in ('unlist', 'warn', 'block') then perform public.moim__fail('moim_sanction_level_invalid'); end if;
  if coalesce(p_reason_code, '') !~ '^[a-z_]{2,40}$' then perform public.moim__fail('moim_report_reason_invalid'); end if;
  if p_ends_at is not null and p_ends_at <= now() then perform public.moim__fail('moim_sanction_period_invalid'); end if;
  select * into v_m from public.moims where id = p_moim for update;
  if not found or v_m.status = 'deleted' then perform public.moim__fail('moim_not_found'); end if;
  insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, actor_id, ends_at)
  values (p_moim, 'moim', p_moim, p_level, p_reason_code, v_reason, p_admin, p_ends_at)
  returning id into v_id;
  v_state := public.moim__platform_refresh(p_moim);
  perform public.moim__admin_log(p_moim, p_admin, 'admin_sanction_applied', v_id, v_reason,
    jsonb_build_object('platform_state', v_m.platform_state),
    jsonb_build_object('platform_state', v_state, 'level', p_level, 'reason_code', p_reason_code, 'ends_at', p_ends_at));
  return jsonb_build_object('ok', true, 'sanction_id', v_id, 'platform_state', v_state, 'host_user_id', v_m.host_user_id,
    'notify_user_ids', case when p_level = 'block' then public.moim__active_member_ids(p_moim) else jsonb_build_array(v_m.host_user_id) end,
    'name', v_m.name);
end
$$;

create or replace function public.moim_admin_sanction_revoke(p_admin uuid, p_sanction uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
  return jsonb_build_object('ok', true, 'moim_id', v_s.moim_id, 'platform_state', v_state);
end
$$;

/** 예약 작업: 기간이 끝난 제재를 반영한다 (만료 = ends_at 경과, 행은 그대로) */
create or replace function public.moim_sanctions_expire_due(p_limit int default 200) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_moim uuid;
  v_out jsonb := '[]'::jsonb;
  v_state text;
begin
  for v_moim in
    select m.id from public.moims m
     where m.platform_state <> 'normal'
       and m.platform_state is distinct from (
         select case when bool_or(level = 'block') then 'blocked' when bool_or(level = 'warn') then 'warned'
                     when bool_or(level = 'unlist') then 'unlisted' else 'normal' end
           from public.moim_sanctions s
          where s.moim_id = m.id and s.target_kind = 'moim' and s.level in ('unlist', 'warn', 'block')
            and s.revoked_at is null and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now()))
     limit greatest(1, least(p_limit, 1000))
  loop
    v_state := public.moim__platform_refresh(v_moim);
    perform public.moim__log(v_moim, null, 'system', 'sanction_expired', null, jsonb_build_object('platform_state', v_state));
    v_out := v_out || jsonb_build_object('moim_id', v_moim, 'platform_state', v_state);
  end loop;
  return jsonb_build_object('ok', true, 'refreshed', v_out);
end
$$;

-- -----------------------------------------------------------------------------
-- 7. 어드민: 모임 삭제 · 복구 (최고관리자, 상태값만 — 행 삭제 없음)
-- -----------------------------------------------------------------------------
create or replace function public.moim_admin_delete(p_admin uuid, p_moim uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_m record;
begin
  select * into v_m from public.moims where id = p_moim for update;
  if not found then perform public.moim__fail('moim_not_found'); end if;
  if v_m.status = 'deleted' then perform public.moim__fail('moim_conflict'); end if;
  update public.moims set status = 'deleted', deleted_at = now(), deleted_by = p_admin, updated_at = now() where id = p_moim;
  update public.moim_schedules set status = 'cancelled', finished_at = now(), updated_at = now() where moim_id = p_moim and status in ('recruiting', 'full', 'closed');
  update public.moim_join_requests set status = 'expired', decided_at = now() where moim_id = p_moim and status = 'pending';
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  perform public.moim__rooms_set_locked(p_moim, true);
  perform public.moim__admin_log(p_moim, p_admin, 'admin_deleted', p_moim, v_reason, jsonb_build_object('status', v_m.status), jsonb_build_object('status', 'deleted'));
  return jsonb_build_object('ok', true);
end
$$;

/** 복구: 종료 기록이 있으면 종료 상태로, 아니면 운영 상태로. 운영 상태이고 차단이 아니면 방 잠금 해제. 취소된 일정은 되살리지 않는다. */
create or replace function public.moim_admin_restore(p_admin uuid, p_moim uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
  return jsonb_build_object('ok', true, 'status', v_status);
end
$$;

-- -----------------------------------------------------------------------------
-- 8. 어드민: 카테고리 · 운영 정책
-- -----------------------------------------------------------------------------
/** 사유 필수. p: {id?, slug, label_ko, label_en, sort_order, is_active, is_restricted, expected_updated_at?(수정 시 필수)} */
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
    insert into public.moim_categories (slug, label_ko, label_en, sort_order, is_active, is_restricted)
    values (v_slug, v_ko, v_en, coalesce((p->>'sort_order')::int, 0), coalesce((p->>'is_active')::boolean, true), coalesce((p->>'is_restricted')::boolean, false))
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
      updated_at = now()
    where id = v_id;
    v_out := v_id;
    perform public.moim__admin_log(null, p_admin, 'admin_category_updated', v_id, v_reason, to_jsonb(v_before), p);
  end if;
  return jsonb_build_object('ok', true, 'category_id', v_out, 'updated_at', (select updated_at from public.moim_categories where id = v_out));
end
$$;

/** 정책 저장 — p 에 있는 키만 바꾼다(값 null = 검사 안 함). 낙관적 잠금 */
create or replace function public.moim_admin_policies_save(p_admin uuid, p jsonb, p_expected_updated_at timestamptz, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_before public.moim_policies;
  v_key text;
  v_int_keys text[] := array['max_moims_per_user', 'max_capacity', 'max_co_hosts', 'max_staff', 'max_custom_boards', 'max_pinned_notices',
    'join_request_expire_days', 'closed_retention_days', 'schedule_room_archive_days', 'invite_resend_days', 'inactive_unlist_days',
    'name_min_len', 'name_max_len', 'intro_min_len', 'intro_max_len'];
  v_words text[];
  v_after public.moim_policies;
begin
  select * into v_before from public.moim_policies where id = 1 for update;
  if p_expected_updated_at is null or v_before.updated_at <> p_expected_updated_at then perform public.moim__fail('moim_conflict'); end if;
  for v_key in select jsonb_object_keys(p) loop
    if v_key <> 'banned_words' and not (v_key = any(v_int_keys)) then perform public.moim__fail('moim_policy_invalid'); end if;
    if v_key <> 'banned_words' and jsonb_typeof(p->v_key) not in ('number', 'null') then perform public.moim__fail('moim_policy_invalid'); end if;
  end loop;
  if p ? 'banned_words' then
    if jsonb_typeof(p->'banned_words') <> 'array' then perform public.moim__fail('moim_policy_invalid'); end if;
    select coalesce(array_agg(distinct left(btrim(w), 40)) filter (where btrim(w) <> ''), '{}') into v_words
      from jsonb_array_elements_text(p->'banned_words') w;
    if array_length(v_words, 1) > 500 then perform public.moim__fail('moim_policy_invalid'); end if;
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
$$;

-- 실행 권한: service_role 만
do $grant$
declare f record;
begin
  for f in
    select p.oid::regprocedure sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('moim__host_swap', 'moim_host_transfer_respond', 'moim__admin_reason', 'moim__admin_log', 'moim__rooms_set_locked',
                         'moim__platform_refresh', 'moim__active_member_ids', 'moim_host_inactive_request', 'moim_admin_update_info',
                         'moim_admin_member_role', 'moim_admin_member_remove', 'moim_admin_member_unban', 'moim_admin_assign_host',
                         'moim_admin_host_request_decide', 'moim_admin_content', 'moim_admin_sanction_apply', 'moim_admin_sanction_revoke',
                         'moim_sanctions_expire_due', 'moim_admin_delete', 'moim_admin_restore', 'moim_admin_category_save',
                         'moim_admin_policies_save')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end
$grant$;

commit;
