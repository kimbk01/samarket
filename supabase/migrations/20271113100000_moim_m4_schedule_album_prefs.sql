-- =============================================================================
-- M4 — 모임 일정(정모)·일정 채팅·출석·앨범·모임별 알림 설정
-- Owner 2026-11-12 「M4 진행」 · 설계 docs/design/moim/moim-design-v1-2026-11-12.md §6 P10 · P11 · §7
-- 원칙은 M2·M3 와 같다: 서버(service_role) RPC 만, 권한은 DB 에서.
--
-- 일정 관리권자 = 일정 호스트 + 모임장·부모임장 (설계 §5.2 「일정 참여자 승인·내보내기」)
-- 일정 종료 시점 = 끝나는 시간(ends_at). 없으면 시작한 날 필리핀 시간 자정 (예약 작업 moim_schedules_finish_due)
-- =============================================================================

begin;

alter table public.moim_schedules
  add column if not exists reminded_24h_at timestamptz null,
  add column if not exists reminded_1h_at timestamptz null,
  add column if not exists finished_at timestamptz null;

create index if not exists moim_schedules_due_idx on public.moim_schedules (status, starts_at) where status in ('recruiting', 'full', 'closed');

/** 모임별 알림 설정 (행이 없으면 기본값: 공지 켜짐 · 새 글 꺼짐 · 일정 켜짐 — 설계 §7 · D9) */
create table if not exists public.moim_notification_prefs (
  moim_id uuid not null references public.moims(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  notice boolean not null default true,
  posts boolean not null default false,
  schedules boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (moim_id, user_id)
);
alter table public.moim_notification_prefs enable row level security;
revoke all on public.moim_notification_prefs from anon, authenticated;
grant all on public.moim_notification_prefs to service_role;

-- -----------------------------------------------------------------------------
-- 도우미
-- -----------------------------------------------------------------------------
/** 일정을 관리할 수 있는가 — 일정 호스트(활성 멤버) 또는 모임장·부모임장 */
create or replace function public.moim__schedule_can_manage(p_schedule uuid, p_actor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.moim_schedules s
      join public.moims m on m.id = s.moim_id
     where s.id = p_schedule and m.status = 'active' and m.platform_state <> 'blocked'
       and public.moim_actor_role(s.moim_id, p_actor) is not null
       and (s.host_user_id = p_actor or public.moim__role_rank(public.moim_actor_role(s.moim_id, p_actor)) >= public.moim__role_rank('co_host'))
  );
$$;

create or replace function public.moim__schedule_refresh(p_schedule uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_s record;
  v_n int;
begin
  select * into v_s from public.moim_schedules where id = p_schedule;
  select count(*) into v_n from public.moim_schedule_participants where schedule_id = p_schedule and status = 'confirmed';
  update public.moim_schedules set
    confirmed_count = v_n,
    status = case
      when status in ('recruiting', 'full') and capacity is not null and v_n >= capacity then 'full'
      when status = 'full' and (capacity is null or v_n < capacity) then 'recruiting'
      else status end,
    updated_at = now()
  where id = p_schedule;
end
$$;

create or replace function public.moim__schedule_confirm(p_schedule uuid, p_user uuid, p_decided_by uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_s record;
  v_mem record;
begin
  select * into v_s from public.moim_schedules where id = p_schedule;
  select nickname, avatar_url into v_mem from public.moim_members where moim_id = v_s.moim_id and user_id = p_user;
  insert into public.moim_schedule_participants (schedule_id, user_id, status, decided_by, decided_at)
  values (p_schedule, p_user, 'confirmed', p_decided_by, case when p_decided_by is null then null else now() end)
  on conflict (schedule_id, user_id) do update
    set status = 'confirmed', decided_by = excluded.decided_by, decided_at = excluded.decided_at, updated_at = now();
  perform public.moim__room_member_activate(v_s.room_id, p_user, 'member', coalesce(v_mem.nickname, ''), v_mem.avatar_url);
  perform public.moim__schedule_refresh(p_schedule);
end
$$;

/** 시작 시간이 지난 일정은 참여·취소 불가 */
create or replace function public.moim__schedule_open_for_change(p_schedule uuid) returns record
language plpgsql volatile security definer set search_path = public as $$
declare v_s record;
begin
  select s.*, m.status as moim_status, m.platform_state into v_s
    from public.moim_schedules s join public.moims m on m.id = s.moim_id
   where s.id = p_schedule for update of s;
  if not found or v_s.moim_status <> 'active' then perform public.moim__fail('moim_schedule_not_found'); end if;
  if v_s.platform_state = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  if v_s.status in ('done', 'cancelled') then perform public.moim__fail('moim_schedule_finished'); end if;
  if v_s.starts_at <= now() then perform public.moim__fail('moim_schedule_started'); end if;
  return v_s;
end
$$;

-- -----------------------------------------------------------------------------
-- P10 일정
-- -----------------------------------------------------------------------------
create or replace function public.moim_schedule_create(p_actor uuid, p_moim uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_title text := btrim(coalesce(p->>'title', ''));
  v_starts timestamptz := nullif(p->>'starts_at', '')::timestamptz;
  v_ends timestamptz := nullif(p->>'ends_at', '')::timestamptz;
  v_cap int := nullif(p->>'capacity', '')::int;
  v_mode text := coalesce(nullif(p->>'join_mode', ''), 'first_come');
  v_mem record;
  v_room uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'create_schedule') then perform public.moim__fail('moim_forbidden'); end if;
  if v_title = '' or char_length(v_title) > 60 then perform public.moim__fail('moim_schedule_title_invalid'); end if;
  if v_starts is null or v_starts <= now() then perform public.moim__fail('moim_schedule_time_invalid'); end if;
  if v_ends is not null and v_ends < v_starts then perform public.moim__fail('moim_schedule_time_invalid'); end if;
  if v_cap is not null and v_cap < 2 then perform public.moim__fail('moim_capacity_invalid'); end if;
  if v_mode not in ('first_come', 'approval') then perform public.moim__fail('moim_join_mode_invalid'); end if;
  if char_length(coalesce(p->>'place_text', '')) > 120 or char_length(coalesce(p->>'description', '')) > 3000 then
    perform public.moim__fail('moim_schedule_too_long');
  end if;
  if jsonb_typeof(coalesce(p->'images', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'images', '[]'::jsonb)) > 10 then
    perform public.moim__fail('moim_post_images_invalid');
  end if;
  select nickname, avatar_url into v_mem from public.moim_members where moim_id = p_moim and user_id = p_actor;
  insert into public.moim_schedules (id, moim_id, host_user_id, title, starts_at, ends_at, place_text, place_lat, place_lng,
                                     description, images, capacity, join_mode, ask_motivation)
  values (v_id, p_moim, p_actor, v_title, v_starts, v_ends, btrim(coalesce(p->>'place_text', '')),
          nullif(p->>'place_lat', '')::double precision, nullif(p->>'place_lng', '')::double precision,
          btrim(coalesce(p->>'description', '')), coalesce(p->'images', '[]'::jsonb), v_cap, v_mode,
          v_mode = 'approval' and coalesce((p->>'ask_motivation')::boolean, false));
  v_room := public.moim__room_create('schedule', v_id, p_actor, v_title, v_mem.nickname, v_mem.avatar_url);
  update public.moim_schedules set room_id = v_room where id = v_id;
  insert into public.moim_schedule_participants (schedule_id, user_id, status) values (v_id, p_actor, 'confirmed');
  perform public.moim__schedule_refresh(v_id);
  update public.moims set last_activity_at = now() where id = p_moim;
  perform public.moim__log(p_moim, p_actor, 'user', 'schedule_created', v_id, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'schedule_id', v_id, 'room_id', v_room);
end
$$;

/** 일정 수정 — 관리권자. 정원은 확정 인원 아래로 못 줄임. 승인→선착순은 대기 신청이 없을 때만 */
create or replace function public.moim_schedule_update(p_actor uuid, p_schedule uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_s record;
  v_title text;
  v_starts timestamptz;
  v_ends timestamptz;
  v_cap int;
  v_mode text;
begin
  v_s := public.moim__schedule_open_for_change(p_schedule);
  if not public.moim__schedule_can_manage(p_schedule, p_actor) then perform public.moim__fail('moim_forbidden'); end if;
  v_title := case when p ? 'title' then btrim(coalesce(p->>'title', '')) else v_s.title end;
  v_starts := case when p ? 'starts_at' then nullif(p->>'starts_at', '')::timestamptz else v_s.starts_at end;
  v_ends := case when p ? 'ends_at' then nullif(p->>'ends_at', '')::timestamptz else v_s.ends_at end;
  v_cap := case when p ? 'capacity' then nullif(p->>'capacity', '')::int else v_s.capacity end;
  v_mode := case when p ? 'join_mode' then p->>'join_mode' else v_s.join_mode end;
  if v_title = '' or char_length(v_title) > 60 then perform public.moim__fail('moim_schedule_title_invalid'); end if;
  if v_starts is null or v_starts <= now() or (v_ends is not null and v_ends < v_starts) then perform public.moim__fail('moim_schedule_time_invalid'); end if;
  if v_cap is not null and (v_cap < 2 or v_cap < v_s.confirmed_count) then perform public.moim__fail('moim_capacity_invalid'); end if;
  if v_mode not in ('first_come', 'approval') then perform public.moim__fail('moim_join_mode_invalid'); end if;
  if v_s.join_mode = 'approval' and v_mode = 'first_come'
     and exists (select 1 from public.moim_schedule_participants where schedule_id = p_schedule and status = 'requested') then
    perform public.moim__fail('moim_schedule_pending_requests');
  end if;
  if char_length(coalesce(p->>'place_text', v_s.place_text)) > 120 or char_length(coalesce(p->>'description', v_s.description)) > 3000 then
    perform public.moim__fail('moim_schedule_too_long');
  end if;
  update public.moim_schedules set
    title = v_title, starts_at = v_starts, ends_at = v_ends, capacity = v_cap, join_mode = v_mode,
    ask_motivation = v_mode = 'approval' and case when p ? 'ask_motivation' then coalesce((p->>'ask_motivation')::boolean, false) else ask_motivation end,
    place_text = case when p ? 'place_text' then btrim(coalesce(p->>'place_text', '')) else place_text end,
    description = case when p ? 'description' then btrim(coalesce(p->>'description', '')) else description end,
    images = case when p ? 'images' then coalesce(p->'images', '[]'::jsonb) else images end,
    reminded_24h_at = case when v_starts <> v_s.starts_at then null else reminded_24h_at end,
    reminded_1h_at = case when v_starts <> v_s.starts_at then null else reminded_1h_at end,
    updated_at = now()
  where id = p_schedule;
  perform public.moim__schedule_refresh(p_schedule);
  if v_title <> v_s.title and v_s.room_id is not null then
    perform public.moim__writer_on();
    update public.community_messenger_rooms set title = left(v_title, 120), updated_at = now() where id = v_s.room_id;
  end if;
  perform public.moim__log(v_s.moim_id, p_actor, 'user', 'schedule_updated', p_schedule, p);
  return jsonb_build_object('ok', true);
end
$$;

/** 일정 취소 — 관리권자. 방 읽기 전용, 확정·신청자 목록 반환(알림용) */
create or replace function public.moim_schedule_cancel(p_actor uuid, p_schedule uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_s record;
  v_users jsonb;
begin
  select * into v_s from public.moim_schedules where id = p_schedule for update;
  if not found then perform public.moim__fail('moim_schedule_not_found'); end if;
  if v_s.status in ('done', 'cancelled') then perform public.moim__fail('moim_schedule_finished'); end if;
  if not public.moim__schedule_can_manage(p_schedule, p_actor) then perform public.moim__fail('moim_forbidden'); end if;
  select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_users
    from public.moim_schedule_participants where schedule_id = p_schedule and status in ('confirmed', 'requested') and user_id <> p_actor;
  update public.moim_schedules set status = 'cancelled', finished_at = now(), updated_at = now() where id = p_schedule;
  if v_s.room_id is not null then
    perform public.moim__writer_on();
    update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_s.room_id;
  end if;
  perform public.moim__log(v_s.moim_id, p_actor, 'user', 'schedule_cancelled', p_schedule, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'moim_id', v_s.moim_id, 'notify_user_ids', v_users, 'title', v_s.title);
end
$$;

/** 모집 마감·다시 열기 — 관리권자 */
create or replace function public.moim_schedule_set_closed(p_actor uuid, p_schedule uuid, p_closed boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_s record;
begin
  v_s := public.moim__schedule_open_for_change(p_schedule);
  if not public.moim__schedule_can_manage(p_schedule, p_actor) then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_schedules set status = case when p_closed then 'closed' else 'recruiting' end, updated_at = now() where id = p_schedule;
  perform public.moim__schedule_refresh(p_schedule);
  return jsonb_build_object('ok', true);
end
$$;

/** 일정 참여 — 선착순: 바로 확정 · 승인: 신청(지원 동기 8자 이상 선택) */
create or replace function public.moim_schedule_join(p_actor uuid, p_schedule uuid, p_motivation text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_s record;
  v_cur text;
  v_mot text := btrim(coalesce(p_motivation, ''));
begin
  v_s := public.moim__schedule_open_for_change(p_schedule);
  if public.moim_actor_role(v_s.moim_id, p_actor) is null then perform public.moim__fail('moim_not_member'); end if;
  select status into v_cur from public.moim_schedule_participants where schedule_id = p_schedule and user_id = p_actor;
  if v_cur = 'confirmed' then perform public.moim__fail('moim_schedule_already_joined'); end if;
  if v_cur = 'requested' then perform public.moim__fail('moim_already_pending'); end if;
  if v_cur = 'removed' then perform public.moim__fail('moim_join_not_allowed'); end if;
  if v_s.status = 'closed' then perform public.moim__fail('moim_schedule_closed'); end if;
  if v_s.capacity is not null and v_s.confirmed_count >= v_s.capacity then perform public.moim__fail('moim_full'); end if;
  if v_s.join_mode = 'first_come' then
    perform public.moim__schedule_confirm(p_schedule, p_actor, null);
    perform public.moim__log(v_s.moim_id, p_actor, 'user', 'schedule_joined', p_schedule, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'status', 'confirmed', 'room_id', v_s.room_id);
  end if;
  if v_s.ask_motivation and char_length(v_mot) < 8 then perform public.moim__fail('moim_schedule_motivation_required'); end if;
  insert into public.moim_schedule_participants (schedule_id, user_id, status, motivation)
  values (p_schedule, p_actor, 'requested', nullif(left(v_mot, 500), ''))
  on conflict (schedule_id, user_id) do update set status = 'requested', motivation = excluded.motivation, decided_by = null, decided_at = null, updated_at = now();
  perform public.moim__log(v_s.moim_id, p_actor, 'user', 'schedule_requested', p_schedule, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'status', 'requested', 'host_user_id', v_s.host_user_id, 'moim_id', v_s.moim_id, 'title', v_s.title);
end
$$;

/** 참여 취소(본인) — 호스트는 일정을 취소해야 한다 */
create or replace function public.moim_schedule_leave(p_actor uuid, p_schedule uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_s record;
  v_cur text;
begin
  v_s := public.moim__schedule_open_for_change(p_schedule);
  if v_s.host_user_id = p_actor then perform public.moim__fail('moim_schedule_host_cannot_leave'); end if;
  select status into v_cur from public.moim_schedule_participants where schedule_id = p_schedule and user_id = p_actor for update;
  if v_cur is null or v_cur not in ('confirmed', 'requested') then perform public.moim__fail('moim_schedule_not_joined'); end if;
  update public.moim_schedule_participants set status = 'cancelled', updated_at = now() where schedule_id = p_schedule and user_id = p_actor;
  if v_cur = 'confirmed' then perform public.moim__room_member_deactivate(v_s.room_id, p_actor); end if;
  perform public.moim__schedule_refresh(p_schedule);
  perform public.moim__log(v_s.moim_id, p_actor, 'user', 'schedule_left', p_schedule, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$$;

/** 참여 신청 승인·거절 — 관리권자 */
create or replace function public.moim_schedule_decide(p_actor uuid, p_schedule uuid, p_user uuid, p_approve boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_s record;
  v_cur text;
begin
  v_s := public.moim__schedule_open_for_change(p_schedule);
  if not public.moim__schedule_can_manage(p_schedule, p_actor) then perform public.moim__fail('moim_forbidden'); end if;
  select status into v_cur from public.moim_schedule_participants where schedule_id = p_schedule and user_id = p_user for update;
  if v_cur is distinct from 'requested' then perform public.moim__fail('moim_request_not_found'); end if;
  if p_approve then
    if public.moim_actor_role(v_s.moim_id, p_user) is null then perform public.moim__fail('moim_target_not_member'); end if;
    if v_s.capacity is not null and v_s.confirmed_count >= v_s.capacity then perform public.moim__fail('moim_full'); end if;
    perform public.moim__schedule_confirm(p_schedule, p_user, p_actor);
  else
    update public.moim_schedule_participants set status = 'rejected', decided_by = p_actor, decided_at = now(), updated_at = now()
     where schedule_id = p_schedule and user_id = p_user;
  end if;
  perform public.moim__log(v_s.moim_id, p_actor, 'user', case when p_approve then 'schedule_approved' else 'schedule_rejected' end, p_user,
                           jsonb_build_object('schedule_id', p_schedule));
  return jsonb_build_object('ok', true, 'moim_id', v_s.moim_id, 'title', v_s.title, 'approved', p_approve);
end
$$;

/** 일정 참여자 내보내기 — 관리권자. 내보낸 사람은 그 일정에 다시 참여 못 함 (당근 21676) */
create or replace function public.moim_schedule_remove_participant(p_actor uuid, p_schedule uuid, p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_s record;
  v_cur text;
begin
  v_s := public.moim__schedule_open_for_change(p_schedule);
  if not public.moim__schedule_can_manage(p_schedule, p_actor) then perform public.moim__fail('moim_forbidden'); end if;
  if p_user = p_actor or p_user = v_s.host_user_id then perform public.moim__fail('moim_cannot_target_self'); end if;
  select status into v_cur from public.moim_schedule_participants where schedule_id = p_schedule and user_id = p_user for update;
  if v_cur is null or v_cur not in ('confirmed', 'requested') then perform public.moim__fail('moim_schedule_not_joined'); end if;
  update public.moim_schedule_participants set status = 'removed', decided_by = p_actor, decided_at = now(), updated_at = now()
   where schedule_id = p_schedule and user_id = p_user;
  if v_cur = 'confirmed' then perform public.moim__room_member_deactivate(v_s.room_id, p_user); end if;
  perform public.moim__schedule_refresh(p_schedule);
  perform public.moim__log(v_s.moim_id, p_actor, 'user', 'schedule_participant_removed', p_user, jsonb_build_object('schedule_id', p_schedule));
  return jsonb_build_object('ok', true);
end
$$;

/** 출석 체크 — 관리권자, 시작 후에만, 확정 참여자만 */
create or replace function public.moim_schedule_attendance(p_actor uuid, p_schedule uuid, p_user uuid, p_attendance text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_s record;
begin
  select s.*, m.status moim_status into v_s from public.moim_schedules s join public.moims m on m.id = s.moim_id where s.id = p_schedule;
  if not found or v_s.moim_status <> 'active' or v_s.status = 'cancelled' then perform public.moim__fail('moim_schedule_not_found'); end if;
  if v_s.starts_at > now() then perform public.moim__fail('moim_schedule_not_started'); end if;
  if p_attendance not in ('unknown', 'present', 'absent') then perform public.moim__fail('moim_attendance_invalid'); end if;
  if not exists (
    select 1 from public.moim_schedules s where s.id = p_schedule
       and (s.host_user_id = p_actor or public.moim__role_rank(public.moim_actor_role(s.moim_id, p_actor)) >= public.moim__role_rank('co_host'))
       and public.moim_actor_role(s.moim_id, p_actor) is not null) then
    perform public.moim__fail('moim_forbidden');
  end if;
  update public.moim_schedule_participants set attendance = p_attendance, updated_at = now()
   where schedule_id = p_schedule and user_id = p_user and status = 'confirmed';
  if not found then perform public.moim__fail('moim_schedule_not_joined'); end if;
  return jsonb_build_object('ok', true);
end
$$;

/** 예약 작업: 끝난 일정 → done · 방 읽기 전용. 끝나는 시간이 없으면 시작한 날 필리핀 자정. 반환: 끝낸 일정과 확정 참여자 */
create or replace function public.moim_schedules_finish_due(p_limit int default 200) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_s record;
  v_out jsonb := '[]'::jsonb;
  v_users jsonb;
begin
  for v_s in
    select s.* from public.moim_schedules s
     where s.status in ('recruiting', 'full', 'closed')
       and coalesce(s.ends_at, (date_trunc('day', s.starts_at at time zone 'Asia/Manila') + interval '1 day') at time zone 'Asia/Manila') <= now()
     order by s.starts_at
     limit greatest(1, least(p_limit, 1000))
     for update skip locked
  loop
    update public.moim_schedules set status = 'done', finished_at = now(), updated_at = now() where id = v_s.id;
    if v_s.room_id is not null then
      perform public.moim__writer_on();
      update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_s.room_id;
    end if;
    select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_users
      from public.moim_schedule_participants where schedule_id = v_s.id and status = 'confirmed';
    perform public.moim__log(v_s.moim_id, null, 'system', 'schedule_done', v_s.id, '{}'::jsonb);
    v_out := v_out || jsonb_build_object('schedule_id', v_s.id, 'moim_id', v_s.moim_id, 'title', v_s.title, 'user_ids', v_users);
  end loop;
  return jsonb_build_object('ok', true, 'done', v_out);
end
$$;

/** 예약 작업: 리마인드 대상 표시 (24시간 전·1시간 전, 한 번씩). 반환: 일정·확정 참여자 */
create or replace function public.moim_schedules_claim_reminders(p_window text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
    if p_window = '24h' then
      update public.moim_schedules set reminded_24h_at = now() where id = v_s.id;
    else
      update public.moim_schedules set reminded_1h_at = now() where id = v_s.id;
    end if;
    select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_users
      from public.moim_schedule_participants where schedule_id = v_s.id and status = 'confirmed';
    v_out := v_out || jsonb_build_object('schedule_id', v_s.id, 'moim_id', v_s.moim_id, 'title', v_s.title, 'starts_at', v_s.starts_at, 'user_ids', v_users);
  end loop;
  return jsonb_build_object('ok', true, 'reminders', v_out);
end
$$;

-- -----------------------------------------------------------------------------
-- 앨범
-- -----------------------------------------------------------------------------
create or replace function public.moim_album_add(p_actor uuid, p_moim uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_url text;
  v_n int := 0;
  v_schedule uuid := nullif(p->>'schedule_id', '')::uuid;
  v_m record;
begin
  select status, platform_state into v_m from public.moims where id = p_moim;
  if not found or v_m.status <> 'active' then perform public.moim__fail('moim_not_found'); end if;
  if v_m.platform_state = 'blocked' then perform public.moim__fail('moim_blocked'); end if;
  if public.moim_actor_role(p_moim, p_actor) is null then perform public.moim__fail('moim_not_member'); end if;
  if jsonb_typeof(p->'urls') <> 'array' or jsonb_array_length(p->'urls') = 0 or jsonb_array_length(p->'urls') > 10 then
    perform public.moim__fail('moim_post_images_invalid');
  end if;
  if v_schedule is not null and not exists (select 1 from public.moim_schedules where id = v_schedule and moim_id = p_moim) then
    perform public.moim__fail('moim_schedule_not_found');
  end if;
  for v_url in select jsonb_array_elements_text(p->'urls') loop
    if v_url !~ '^https://' or char_length(v_url) > 1000 then perform public.moim__fail('moim_post_images_invalid'); end if;
    insert into public.moim_album_items (moim_id, uploader_id, url, schedule_id) values (p_moim, p_actor, v_url, v_schedule);
    v_n := v_n + 1;
  end loop;
  update public.moims set last_activity_at = now() where id = p_moim;
  return jsonb_build_object('ok', true, 'added', v_n);
end
$$;

/** 사진 삭제(올린 사람) · 숨김(운영진 hide_post) */
create or replace function public.moim_album_remove(p_actor uuid, p_item uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_i record;
begin
  select * into v_i from public.moim_album_items where id = p_item for update;
  if not found or v_i.status <> 'active' then perform public.moim__fail('moim_album_not_found'); end if;
  if v_i.uploader_id = p_actor and public.moim_actor_role(v_i.moim_id, p_actor) is not null then
    update public.moim_album_items set status = 'deleted', is_pinned = false where id = p_item;
    return jsonb_build_object('ok', true, 'result', 'deleted');
  end if;
  if not public.moim_actor_can(v_i.moim_id, p_actor, 'hide_post') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_album_items set status = 'hidden', is_pinned = false where id = p_item;
  perform public.moim__log(v_i.moim_id, p_actor, 'user', 'album_hidden', p_item, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'result', 'hidden');
end
$$;

/** 앨범 상단 고정 (최대 6장, 당근 14553) — pin_notice 권한 */
create or replace function public.moim_album_pin(p_actor uuid, p_item uuid, p_pinned boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_i record;
begin
  select * into v_i from public.moim_album_items where id = p_item for update;
  if not found or v_i.status <> 'active' then perform public.moim__fail('moim_album_not_found'); end if;
  if not public.moim_actor_can(v_i.moim_id, p_actor, 'pin_notice') then perform public.moim__fail('moim_forbidden'); end if;
  if p_pinned and not v_i.is_pinned and
     (select count(*) from public.moim_album_items where moim_id = v_i.moim_id and is_pinned and status = 'active') >= 6 then
    perform public.moim__fail('moim_pin_limit');
  end if;
  update public.moim_album_items set is_pinned = p_pinned where id = p_item;
  return jsonb_build_object('ok', true);
end
$$;

-- -----------------------------------------------------------------------------
-- 모임별 알림 설정 (멤버 본인)
-- -----------------------------------------------------------------------------
create or replace function public.moim_notification_prefs_set(p_actor uuid, p_moim uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if public.moim_actor_role(p_moim, p_actor) is null then perform public.moim__fail('moim_not_member'); end if;
  insert into public.moim_notification_prefs (moim_id, user_id, notice, posts, schedules)
  values (p_moim, p_actor,
          coalesce((p->>'notice')::boolean, true), coalesce((p->>'posts')::boolean, false), coalesce((p->>'schedules')::boolean, true))
  on conflict (moim_id, user_id) do update set
    notice = case when p ? 'notice' then (p->>'notice')::boolean else public.moim_notification_prefs.notice end,
    posts = case when p ? 'posts' then (p->>'posts')::boolean else public.moim_notification_prefs.posts end,
    schedules = case when p ? 'schedules' then (p->>'schedules')::boolean else public.moim_notification_prefs.schedules end,
    updated_at = now();
  return jsonb_build_object('ok', true);
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
       and p.proname in ('moim__schedule_can_manage', 'moim__schedule_refresh', 'moim__schedule_confirm', 'moim__schedule_open_for_change',
                         'moim_schedule_create', 'moim_schedule_update', 'moim_schedule_cancel', 'moim_schedule_set_closed',
                         'moim_schedule_join', 'moim_schedule_leave', 'moim_schedule_decide', 'moim_schedule_remove_participant',
                         'moim_schedule_attendance', 'moim_schedules_finish_due', 'moim_schedules_claim_reminders',
                         'moim_album_add', 'moim_album_remove', 'moim_album_pin', 'moim_notification_prefs_set')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end
$grant$;

commit;
