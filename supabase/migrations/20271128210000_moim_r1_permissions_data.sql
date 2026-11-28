-- 모임 R1 — 권한·데이터 결함 (대감사 2026-11-28 A-01~A-20 · Owner 「구현 승인」 2026-11-28)
-- 설계: docs/audit/moim-r1-design-2026-11-28.md · 근거: docs/audit/moim-grand-audit-2026-11-28.md
-- 적용 전 운영 정의 백업: docs/audit/moim-r1-backup-definitions-2026-11-28.sql
-- 함수 본문에는 비 ASCII 주석을 넣지 않는다 (운영 적용 도구가 멈춤).


-- A-18: join request remembers the invite link it came from (usage_count is counted when the member is activated)
alter table public.moim_join_requests add column if not exists invite_id uuid references public.moim_invites(id) on delete set null;

-- A-20 (bundle2 B8): profile history rows go with the account; invite links keep the record without the person
alter table public.moim_member_profile_history drop constraint if exists moim_member_profile_history_user_id_fkey;
alter table public.moim_member_profile_history
  add constraint moim_member_profile_history_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.moim_invites alter column created_by drop not null;
alter table public.moim_invites drop constraint if exists moim_invites_created_by_fkey;
alter table public.moim_invites
  add constraint moim_invites_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;


-- A-10: one content rule for every moim write (same as moim_post_create / moim_update_info: policy banned words)
create or replace function public.moim__assert_text_clean(p_texts text[])
 returns void
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_words text[];
  v_word text;
  v_text text;
begin
  v_words := coalesce((select banned_words from public.moim_policies where id = 1), '{}'::text[]);
  foreach v_text in array coalesce(p_texts, '{}'::text[]) loop
    v_text := lower(coalesce(v_text, ''));
    if v_text = '' then continue; end if;
    foreach v_word in array v_words loop
      if btrim(coalesce(v_word, '')) <> '' and position(lower(btrim(v_word)) in v_text) > 0 then
        perform public.moim__fail('moim_banned_word');
      end if;
    end loop;
  end loop;
end
$function$;

-- A-10: images = json array of at most 10 https urls (same rule as moim_album_add)
create or replace function public.moim__assert_images(p_images jsonb)
 returns void
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  v_url jsonb;
begin
  if p_images is null then return; end if;
  if jsonb_typeof(p_images) <> 'array' or jsonb_array_length(p_images) > 10 then
    perform public.moim__fail('moim_post_images_invalid');
  end if;
  for v_url in select * from jsonb_array_elements(p_images) loop
    if jsonb_typeof(v_url) <> 'string' or (v_url #>> '{}') !~ '^https://' or char_length(v_url #>> '{}') > 1000 then
      perform public.moim__fail('moim_post_images_invalid');
    end if;
  end loop;
end
$function$;

-- A-02: highest min_role an adjustable action may be set to (design 5.2: only the "(adjust)" cells move)
create or replace function public.moim_permission_ceiling(p_action text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case p_action
    when 'decide_join' then 'co_host'
    when 'manage_invite_link' then 'co_host'
    when 'pin_notice' then 'co_host'
    when 'send_invite' then 'staff'
    when 'create_schedule' then 'staff'
    when 'write_note' then 'host'
    else null end;
$function$;

-- A-06: messenger role in every room the member is in = current moim role (schedule rooms the member hosts keep owner)
create or replace function public.moim__sync_member_rooms(p_moim uuid, p_user uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text;
  v_room uuid;
  v_main uuid;
begin
  select role into v_role from public.moim_members where moim_id = p_moim and user_id = p_user and status = 'active';
  if v_role is null then return; end if;
  select main_room_id into v_main from public.moims where id = p_moim;
  for v_room in
    select r from public.moim__rooms_of(p_moim) r
     where not exists (select 1 from public.moim_schedules s where s.room_id = r and s.host_user_id = p_user)
  loop
    -- schedule rooms keep exactly one owner (the schedule host): the moim host is admin there
    perform public.moim__room_member_role(v_room, p_user,
      case when v_room is distinct from v_main and v_role = 'host' then 'co_host' else v_role end);
  end loop;
end
$function$;

-- A-04 / A-08: one cleanup list for every path that ends a moim (close, admin delete, account cleanup close)
create or replace function public.moim__close_cleanup(p_moim uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.moim_schedules set status = 'cancelled', finished_at = coalesce(finished_at, now()), updated_at = now()
   where moim_id = p_moim and status in ('recruiting', 'full', 'closed');
  update public.moim_join_requests set status = 'expired', decided_at = now() where moim_id = p_moim and status = 'pending';
  update public.moim_members set status = 'cancelled', updated_at = now() where moim_id = p_moim and status = 'pending';
  update public.moim_host_transfers set status = 'cancelled', decided_at = now() where moim_id = p_moim and status = 'requested';
  update public.moim_invite_targets set status = 'expired', responded_at = now() where moim_id = p_moim and status = 'sent';
end
$function$;

-- A-01 / A-07 / A-08: what a member leaves behind when they stop being active
create or replace function public.moim__release_member(p_moim uuid, p_user uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_host uuid;
  v_s record;
  v_mem record;
begin
  update public.moim_host_transfers set status = 'cancelled', decided_at = now()
   where moim_id = p_moim and status = 'requested' and (to_user_id = p_user or from_user_id = p_user);
  update public.moim_invite_targets set status = 'cancelled', responded_at = now()
   where moim_id = p_moim and inviter_id = p_user and status = 'sent';
  select host_user_id into v_host from public.moims where id = p_moim;
  if v_host is null or v_host = p_user then return; end if;
  select nickname, avatar_url into v_mem from public.moim_members where moim_id = p_moim and user_id = v_host;
  for v_s in
    select * from public.moim_schedules
     where moim_id = p_moim and host_user_id = p_user and status in ('recruiting', 'full', 'closed') and starts_at > now()
     for update
  loop
    update public.moim_schedules set host_user_id = v_host, updated_at = now() where id = v_s.id;
    insert into public.moim_schedule_participants (schedule_id, user_id, status)
    values (v_s.id, v_host, 'confirmed')
    on conflict (schedule_id, user_id) do update set status = 'confirmed', updated_at = now();
    if v_s.room_id is not null then
      perform public.moim__room_member_role(v_s.room_id, p_user, 'member');
      perform public.moim__room_member_activate(v_s.room_id, v_host, 'host', coalesce(v_mem.nickname, ''), v_mem.avatar_url);
      perform public.moim__room_member_role(v_s.room_id, v_host, 'host');
    end if;
    perform public.moim__schedule_refresh(v_s.id);
    perform public.moim__log(p_moim, null, 'system', 'schedule_host_reassigned', v_s.id, jsonb_build_object('from', p_user, 'to', v_host));
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION public.moim__deactivate_member(p_moim uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_room uuid;
  v_ids uuid[];
  v_s uuid;
begin
  perform public.moim__release_member(p_moim, p_user);
  for v_room in select public.moim__rooms_of(p_moim) loop
    perform public.moim__room_member_deactivate(v_room, p_user);
  end loop;
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
  if not exists (select 1 from public.moim_members where moim_id = v_t.moim_id and user_id = p_actor and status = 'active'
                   and joined_at is not null and joined_at <= v_t.created_at) then
    perform public.moim__fail('moim_transfer_stale');
  end if;
  if (select platform_state from public.moims where id = v_t.moim_id) in ('warned', 'blocked') then perform public.moim__fail('moim_transfer_blocked_by_warning'); end if;
  perform public.moim__assert_host_swap_cap(v_t.moim_id, p_actor);
  perform public.moim__host_swap(v_t.moim_id, v_t.from_user_id, p_actor);
  update public.moim_host_transfers set status = 'done', decided_at = now() where id = p_transfer;
  perform public.moim__log(v_t.moim_id, p_actor, 'user', 'host_changed', p_actor, jsonb_build_object('from', v_t.from_user_id, 'kind', 'direct'));
  return jsonb_build_object('ok', true, 'accepted', true, 'moim_id', v_t.moim_id);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_member_unban(p_actor uuid, p_moim uuid, p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'ban_member') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_bans set released_at = now(), released_by = p_actor
   where moim_id = p_moim and user_id = p_target and released_at is null returning id into v_id;
  if v_id is null then perform public.moim__fail('moim_ban_not_found'); end if;
  update public.moim_members set status = 'kicked', updated_at = now() where moim_id = p_moim and user_id = p_target and status = 'banned';
  perform public.moim__log(p_moim, p_actor, 'user', 'member_unbanned', p_target, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_admin_member_unban(p_admin uuid, p_moim uuid, p_user uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reason text := public.moim__admin_reason(p_reason);
  v_id uuid;
begin
  update public.moim_bans set released_at = now(), released_by = p_admin
   where moim_id = p_moim and user_id = p_user and released_at is null returning id into v_id;
  if v_id is null then perform public.moim__fail('moim_ban_not_found'); end if;
  update public.moim_members set status = 'kicked', updated_at = now() where moim_id = p_moim and user_id = p_user and status = 'banned';
  perform public.moim__admin_log(p_moim, p_admin, 'admin_member_unbanned', p_user, v_reason, null, null);
  return jsonb_build_object('ok', true);
end
$function$;

-- A-03 safety: released bans whose member row still says banned (production 0 rows on 2026-11-28)
update public.moim_members m set status = 'kicked', updated_at = now()
 where m.status = 'banned'
   and not exists (select 1 from public.moim_bans b where b.moim_id = m.moim_id and b.user_id = m.user_id and b.released_at is null);

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
  perform public.moim__close_cleanup(p_moim);
  perform public.moim__writer_on();
  for v_room in select public.moim__rooms_of(p_moim) loop
    update public.community_messenger_rooms set is_readonly = true, updated_at = now() where id = v_room;
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'closed', null, '{}'::jsonb);
  return jsonb_build_object('ok', true);
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
begin
  select * into v_m from public.moims where id = p_moim for update;
  if not found then perform public.moim__fail('moim_not_found'); end if;
  if v_m.status = 'deleted' then perform public.moim__fail('moim_conflict'); end if;
  update public.moims set status = 'deleted', deleted_at = now(), deleted_by = p_admin, updated_at = now() where id = p_moim;
  perform public.moim__close_cleanup(p_moim);
  perform public.moim__rooms_set_locked(p_moim, true);
  perform public.moim__admin_log(p_moim, p_admin, 'admin_deleted', p_moim, v_reason, jsonb_build_object('status', v_m.status), jsonb_build_object('status', 'deleted'));
  return jsonb_build_object('ok', true);
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
CREATE OR REPLACE FUNCTION public.moim_permissions_set(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text;
  v_val text;
  v_def record;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'edit_info') then perform public.moim__fail('moim_forbidden'); end if;
  for v_key, v_val in select key, value #>> '{}' from jsonb_each(coalesce(p, '{}'::jsonb)) loop
    select * into v_def from public.moim_permission_defaults() d where d.action = v_key;
    if not found or not v_def.adjustable then perform public.moim__fail('moim_permission_not_adjustable'); end if;
    if v_val not in ('host', 'co_host', 'staff', 'member') or public.moim__role_rank(v_val) < public.moim__role_rank(v_def.floor_role)
       or public.moim__role_rank(v_val) > public.moim__role_rank(coalesce(public.moim_permission_ceiling(v_key), v_def.default_min_role)) then
      perform public.moim__fail('moim_permission_value_invalid');
    end if;
    insert into public.moim_permissions (moim_id, action, min_role, updated_by) values (p_moim, v_key, v_val, p_actor)
    on conflict (moim_id, action) do update set min_role = excluded.min_role, updated_at = now(), updated_by = p_actor;
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'permissions_updated', null, p);
  return jsonb_build_object('ok', true);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_actor_can(p_moim uuid, p_actor uuid, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_min text;
  v_def record;
  v_m record;
begin
  select status, platform_state into v_m from public.moims where id = p_moim;
  if not found or v_m.status <> 'active' then
    return false;
  end if;
  if v_m.platform_state = 'blocked' and p_action <> 'close' then
    return false;
  end if;
  if v_m.platform_state = 'warned' and p_action = 'transfer_host' then
    return false;
  end if;
  v_role := public.moim_actor_role(p_moim, p_actor);
  if v_role is null then
    return false;
  end if;
  select * into v_def from public.moim_permission_defaults() d where d.action = p_action;
  if not found then
    return false;
  end if;
  v_min := v_def.default_min_role;
  if v_def.adjustable then
    select coalesce(p.min_role, v_min) into v_min from public.moim_permissions p where p.moim_id = p_moim and p.action = p_action;
    v_min := coalesce(v_min, v_def.default_min_role);
    if public.moim__role_rank(v_min) > public.moim__role_rank(coalesce(public.moim_permission_ceiling(p_action), v_def.default_min_role)) then
      v_min := coalesce(public.moim_permission_ceiling(p_action), v_def.default_min_role);
    end if;
  end if;
  return public.moim__role_rank(v_role) >= public.moim__role_rank(v_min);
end
$function$;
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
  perform public.moim__sync_member_rooms(p_moim, p_target);
  perform public.moim__log(p_moim, p_actor, 'user', 'role_changed', p_target, jsonb_build_object('from', v_cur, 'to', p_role));
  return jsonb_build_object('ok', true);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim__host_swap(p_moim uuid, p_from uuid, p_to uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.moim__room_member_role(v_room, p_from, 'co_host');
  perform public.moim__room_member_role(v_room, p_to, 'host');
  perform public.moim__sync_member_rooms(p_moim, p_from);
  perform public.moim__sync_member_rooms(p_moim, p_to);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim__schedule_confirm(p_schedule uuid, p_user uuid, p_decided_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.moim__room_member_activate(v_s.room_id, p_user,
    case when v_s.host_user_id = p_user then 'host'
         when public.moim_actor_role(v_s.moim_id, p_user) = 'host' then 'co_host'
         else coalesce(public.moim_actor_role(v_s.moim_id, p_user), 'member') end,
    coalesce(v_mem.nickname, ''), v_mem.avatar_url);
  perform public.moim__schedule_refresh(p_schedule);
end
$function$;
drop function if exists public.moim_admin_member_role(uuid, uuid, uuid, text, text);
CREATE OR REPLACE FUNCTION public.moim_admin_member_role(p_admin uuid, p_moim uuid, p_user uuid, p_role text, p_reason text, p_expected_role text DEFAULT NULL::text)
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
  if p_expected_role is not null and p_expected_role <> v_cur then perform public.moim__fail('moim_conflict'); end if;
  if v_cur = p_role then return jsonb_build_object('ok', true, 'changed', false); end if;
  if p_role in ('co_host', 'staff') and (
       select case p_role when 'co_host' then max_co_hosts else max_staff end from public.moim_policies where id = 1
     ) <= (select count(*) from public.moim_members where moim_id = p_moim and status = 'active' and role = p_role) then
    perform public.moim__fail('moim_role_limit');
  end if;
  update public.moim_members set role = p_role, role_changed_at = now(), updated_at = now() where moim_id = p_moim and user_id = p_user;
  perform public.moim__sync_member_rooms(p_moim, p_user);
  perform public.moim__admin_log(p_moim, p_admin, 'admin_role_changed', p_user, v_reason, jsonb_build_object('role', v_cur), jsonb_build_object('role', p_role));
  return jsonb_build_object('ok', true, 'changed', true);
end
$function$;
drop function if exists public.moim_admin_assign_host(uuid, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.moim_admin_assign_host(p_admin uuid, p_moim uuid, p_to uuid, p_reason text, p_expected_host uuid DEFAULT NULL::uuid)
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
  if p_expected_host is not null and p_expected_host is distinct from v_m.host_user_id then perform public.moim__fail('moim_conflict'); end if;
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
drop function if exists public.moim_admin_sanction_apply(uuid, uuid, text, text, text, timestamp with time zone);
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
  if coalesce(p_reason_code, '') !~ '^[a-z_]{2,40}$' then perform public.moim__fail('moim_report_reason_invalid'); end if;
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
  if v_board.kind = 'notice' then
    if not public.moim_actor_can(p_moim, p_actor, 'pin_notice') then perform public.moim__fail('moim_forbidden'); end if;
  elsif public.moim__role_rank(v_role) < public.moim__role_rank(v_board.write_min_role) then
    perform public.moim__fail('moim_forbidden');
  end if;
  if v_vis not in ('members', 'public') then perform public.moim__fail('moim_visibility_invalid'); end if;
  if v_body = '' then perform public.moim__fail('moim_post_body_required'); end if;
  if char_length(v_title) > 120 or char_length(v_body) > 10000 then perform public.moim__fail('moim_post_too_long'); end if;
  perform public.moim__assert_images(coalesce(p->'images', '[]'::jsonb));
  perform public.moim__assert_text_clean(array[v_title, v_body]);
  insert into public.moim_posts (moim_id, board_id, author_id, title, body, images, visibility)
  values (p_moim, v_board.id, p_actor, v_title, v_body, coalesce(p->'images', '[]'::jsonb), v_vis)
  returning id into v_id;
  update public.moims set last_activity_at = now() where id = p_moim;
  perform public.moim__log(p_moim, p_actor, 'user', 'post_created', v_id, jsonb_build_object('board_kind', v_board.kind));
  return jsonb_build_object('ok', true, 'post_id', v_id, 'board_kind', v_board.kind);
end
$function$;
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
  if p ? 'images' then perform public.moim__assert_images(coalesce(p->'images', '[]'::jsonb)); end if;
  perform public.moim__assert_text_clean(array[v_title, v_body]);
  update public.moim_posts set title = v_title, body = v_body, visibility = v_vis,
    images = case when p ? 'images' then coalesce(p->'images', '[]'::jsonb) else images end, updated_at = now()
  where id = p_post;
  perform public.moim__log(v_po.moim_id, p_actor, 'user', 'post_updated', p_post, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_schedule_create(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.moim__assert_images(coalesce(p->'images', '[]'::jsonb));
  perform public.moim__assert_text_clean(array[v_title, p->>'place_text', p->>'description']);
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
$function$;
CREATE OR REPLACE FUNCTION public.moim_schedule_update(p_actor uuid, p_schedule uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p ? 'images' then perform public.moim__assert_images(coalesce(p->'images', '[]'::jsonb)); end if;
  perform public.moim__assert_text_clean(array[v_title,
    case when p ? 'place_text' then p->>'place_text' end, case when p ? 'description' then p->>'description' end]);
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
$function$;
CREATE OR REPLACE FUNCTION public.moim_board_upsert(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := nullif(p->>'board_id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_role text := coalesce(nullif(p->>'write_min_role', ''), 'member');
  v_max int;
  v_kind text;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'manage_boards') then perform public.moim__fail('moim_forbidden'); end if;
  if v_role not in ('host', 'co_host', 'staff', 'member') then perform public.moim__fail('moim_role_invalid'); end if;
  if v_id is null then
    if v_name = '' or char_length(v_name) > 30 then perform public.moim__fail('moim_board_name_invalid'); end if;
    perform public.moim__assert_text_clean(array[v_name]);
    select max_custom_boards into v_max from public.moim_policies where id = 1;
    if v_max is not null and (select count(*) from public.moim_boards where moim_id = p_moim and kind = 'custom' and is_active) >= v_max then
      perform public.moim__fail('moim_board_limit');
    end if;
    insert into public.moim_boards (moim_id, kind, name, write_min_role, sort_order)
    values (p_moim, 'custom', v_name, v_role, coalesce((select max(sort_order) from public.moim_boards where moim_id = p_moim), 0) + 1)
    returning id into v_id;
  else
    select kind into v_kind from public.moim_boards where id = v_id and moim_id = p_moim;
    if v_kind is null then perform public.moim__fail('moim_board_not_found'); end if;
    if v_kind <> 'custom' and (p ? 'name' or p ? 'is_active') then perform public.moim__fail('moim_board_system_fixed'); end if;
    if p ? 'name' and (v_name = '' or char_length(v_name) > 30) then perform public.moim__fail('moim_board_name_invalid'); end if;
    if p ? 'name' then perform public.moim__assert_text_clean(array[v_name]); end if;
    update public.moim_boards set
      name = case when p ? 'name' then v_name else name end,
      write_min_role = case when p ? 'write_min_role' and v_kind <> 'notice' then v_role else write_min_role end,
      is_active = case when p ? 'is_active' then (p->>'is_active')::boolean else is_active end
    where id = v_id;
  end if;
  perform public.moim__log(p_moim, p_actor, 'user', 'board_saved', v_id, p);
  return jsonb_build_object('ok', true, 'board_id', v_id);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_profile_update(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mem record;
  v_nick text;
  v_room uuid;
begin
  select * into v_mem from public.moim_members where moim_id = p_moim and user_id = p_actor and status = 'active' for update;
  if not found then perform public.moim__fail('moim_not_member'); end if;
  v_nick := case when p ? 'nickname' then btrim(coalesce(p->>'nickname', '')) else v_mem.nickname end;
  if v_nick = '' or char_length(v_nick) > 40 then perform public.moim__fail('moim_nickname_invalid'); end if;
  perform public.moim__assert_text_clean(array[v_nick, case when p ? 'bio' then p->>'bio' end]);
  insert into public.moim_member_profile_history (moim_id, user_id, nickname, avatar_url, bio)
  values (p_moim, p_actor, v_mem.nickname, v_mem.avatar_url, v_mem.bio);
  update public.moim_members set
    nickname = v_nick,
    avatar_url = case when p ? 'avatar_url' then nullif(p->>'avatar_url', '') else avatar_url end,
    bio = case when p ? 'bio' then left(coalesce(p->>'bio', ''), 300) else bio end,
    updated_at = now()
  where moim_id = p_moim and user_id = p_actor;
  perform public.moim__writer_on();
  for v_room in select public.moim__rooms_of(p_moim) loop
    update public.community_messenger_room_profiles
       set display_name = left(v_nick, 40),
           avatar_url = (select avatar_url from public.moim_members where moim_id = p_moim and user_id = p_actor),
           updated_at = now()
     where room_id = v_room and user_id = p_actor;
  end loop;
  perform public.moim__log(p_moim, p_actor, 'user', 'profile_updated', p_actor, '{}'::jsonb);
  return jsonb_build_object('ok', true);
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
  return jsonb_build_object('ok', true, 'status', 'pending', 'request_id', v_req);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim__activate_member(p_moim uuid, p_user uuid, p_nickname text, p_avatar text, p_bio text, p_invited_by uuid, p_decided_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_was_member boolean;
  v_room uuid;
begin
  select joined_at is not null into v_was_member from public.moim_members where moim_id = p_moim and user_id = p_user;
  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio, joined_at, invited_by, decided_by, decided_at)
  values (p_moim, p_user, 'member', 'active', p_nickname, p_avatar, coalesce(p_bio, ''), now(), p_invited_by, p_decided_by, case when p_decided_by is null then null else now() end)
  on conflict (moim_id, user_id) do update
    set role = 'member', status = 'active', nickname = excluded.nickname, avatar_url = excluded.avatar_url, bio = excluded.bio,
        joined_at = now(), left_at = null, invited_by = coalesce(excluded.invited_by, public.moim_members.invited_by), decided_by = excluded.decided_by,
        decided_at = excluded.decided_at,
        rejoin_count = public.moim_members.rejoin_count + case when coalesce(v_was_member, false) then 1 else 0 end,
        updated_at = now();
  select main_room_id into v_room from public.moims where id = p_moim;
  perform public.moim__room_member_activate(v_room, p_user, 'member', p_nickname, p_avatar);
  perform public.moim__refresh_count(p_moim);
  update public.moims set last_activity_at = now() where id = p_moim;
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_join_decide(p_actor uuid, p_request uuid, p_approve boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_r record;
  v_mem record;
begin
  select * into v_r from public.moim_join_requests where id = p_request for update;
  if not found or v_r.status <> 'pending' then perform public.moim__fail('moim_request_not_found'); end if;
  if not public.moim_actor_can(v_r.moim_id, p_actor, 'decide_join') then perform public.moim__fail('moim_forbidden'); end if;
  if p_approve then
    perform public.moim__assert_joinable(v_r.moim_id, v_r.user_id);
    select nickname, avatar_url, bio into v_mem from public.moim_members where moim_id = v_r.moim_id and user_id = v_r.user_id;
    perform public.moim__activate_member(v_r.moim_id, v_r.user_id, v_mem.nickname, v_mem.avatar_url, v_mem.bio, null, p_actor);
    update public.moim_join_requests set status = 'approved', decided_by = p_actor, decided_at = now() where id = p_request;
    if v_r.invite_id is not null then update public.moim_invites set usage_count = usage_count + 1 where id = v_r.invite_id; end if;
    perform public.moim__log(v_r.moim_id, p_actor, 'user', 'join_approved', v_r.user_id, '{}'::jsonb);
  else
    update public.moim_join_requests set status = 'rejected', reason = left(p_reason, 500), decided_by = p_actor, decided_at = now() where id = p_request;
    update public.moim_members set status = 'rejected', decided_by = p_actor, decided_at = now(), updated_at = now()
     where moim_id = v_r.moim_id and user_id = v_r.user_id and status = 'pending';
    perform public.moim__log(v_r.moim_id, p_actor, 'user', 'join_rejected', v_r.user_id, jsonb_build_object('reason', left(p_reason, 500)));
  end if;
  return jsonb_build_object('ok', true, 'moim_id', v_r.moim_id, 'user_id', v_r.user_id, 'approved', p_approve);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_invite_respond(p_actor uuid, p_invite_target uuid, p_accept boolean, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t record;
  v_inviter_role text;
  v_prof record;
  v_nick text;
  v_res jsonb;
begin
  select * into v_t from public.moim_invite_targets where id = p_invite_target for update;
  if not found or v_t.invitee_user_id <> p_actor or v_t.status <> 'sent' then perform public.moim__fail('moim_invite_not_found'); end if;
  if not p_accept then
    update public.moim_invite_targets set status = 'declined', responded_at = now() where id = p_invite_target;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
  v_inviter_role := public.moim_actor_role(v_t.moim_id, v_t.inviter_id);
  update public.moim_invite_targets set status = 'accepted', responded_at = now() where id = p_invite_target;
  if v_inviter_role is not null and public.moim__role_rank(v_inviter_role) >= public.moim__role_rank('staff') then
    perform public.moim__assert_joinable(v_t.moim_id, p_actor);
    if exists (select 1 from public.moim_members where moim_id = v_t.moim_id and user_id = p_actor and status = 'active') then
      perform public.moim__fail('moim_already_member');
    end if;
    select nickname, avatar_url into v_prof from public.profiles where id = p_actor;
    v_nick := btrim(coalesce(nullif(p->>'nickname', ''), v_prof.nickname, ''));
    if v_nick = '' then perform public.moim__fail('moim_nickname_required'); end if;
    if char_length(v_nick) > 40 then perform public.moim__fail('moim_nickname_invalid'); end if;
    perform public.moim__assert_text_clean(array[v_nick, p->>'bio']);
    with a as (
      update public.moim_join_requests set status = 'approved', decided_by = v_t.inviter_id, decided_at = now()
       where moim_id = v_t.moim_id and user_id = p_actor and status = 'pending'
      returning invite_id
    )
    update public.moim_invites set usage_count = usage_count + 1 where id in (select invite_id from a where invite_id is not null);
    perform public.moim__activate_member(v_t.moim_id, p_actor, v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), left(p->>'bio', 300), v_t.inviter_id, v_t.inviter_id);
    perform public.moim__log(v_t.moim_id, p_actor, 'user', 'member_joined', p_actor, jsonb_build_object('via', 'staff_invite'));
    return jsonb_build_object('ok', true, 'status', 'active', 'moim_id', v_t.moim_id);
  end if;
  v_res := public.moim_join(p_actor, v_t.moim_id, p);
  update public.moim_members set invited_by = v_t.inviter_id where moim_id = v_t.moim_id and user_id = p_actor;
  return v_res || jsonb_build_object('moim_id', v_t.moim_id);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_invite_send(p_actor uuid, p_moim uuid, p_invitee uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pol public.moim_policies;
  v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'send_invite') then perform public.moim__fail('moim_forbidden'); end if;
  if p_actor = p_invitee then perform public.moim__fail('moim_cannot_target_self'); end if;
  if exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_invitee and status in ('active', 'pending')) then
    perform public.moim__fail('moim_already_member');
  end if;
  if exists (select 1 from public.moim_bans where moim_id = p_moim and user_id = p_invitee and released_at is null) then
    perform public.moim__fail('moim_join_not_allowed');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('moim_invite:' || p_moim::text || ':' || p_invitee::text, 0));
  select * into v_pol from public.moim_policies where id = 1;
  if v_pol.invite_resend_days is not null and exists (
       select 1 from public.moim_invite_targets
        where moim_id = p_moim and invitee_user_id = p_invitee
          and created_at > now() - make_interval(days => v_pol.invite_resend_days)) then
    perform public.moim__fail('moim_invite_too_soon');
  end if;
  insert into public.moim_invite_targets (moim_id, inviter_id, invitee_user_id) values (p_moim, p_actor, p_invitee) returning id into v_id;
  perform public.moim__log(p_moim, p_actor, 'user', 'invite_sent', p_invitee, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'invite_target_id', v_id);
end
$function$;
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
  if v_cat is distinct from v_m.category_id then
    if not exists (select 1 from public.moim_categories where id = v_cat and is_active and not is_restricted) then perform public.moim__fail('moim_category_invalid'); end if;
  elsif not exists (select 1 from public.moim_categories where id = v_cat) then
    perform public.moim__fail('moim_category_invalid');
  end if;
  if p ? 'join_mode' and coalesce(p->>'join_mode', '') not in ('instant', 'approval') then perform public.moim__fail('moim_join_mode_invalid'); end if;
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
  perform public.moim__assert_questions_clean(p->'questions');
  if v_cat is distinct from v_m.category_id then
    if not exists (select 1 from public.moim_categories where id = v_cat and is_active and not is_restricted) then perform public.moim__fail('moim_category_invalid'); end if;
  elsif not exists (select 1 from public.moim_categories where id = v_cat) then
    perform public.moim__fail('moim_category_invalid');
  end if;
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
CREATE OR REPLACE FUNCTION public.moim_schedule_rooms_archive_due(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_days int;
  v_s record;
  v_n int := 0;
begin
  select schedule_room_archive_days into v_days from public.moim_policies where id = 1;
  if v_days is null then return jsonb_build_object('ok', true, 'archived', 0, 'policy', null); end if;
  for v_s in
    select s.* from public.moim_schedules s
     where s.status in ('done', 'cancelled') and s.room_archived_at is null
       and coalesce(s.finished_at, s.updated_at) <= now() - make_interval(days => v_days)
     order by coalesce(s.finished_at, s.updated_at)
     limit greatest(1, least(p_limit, 1000))
     for update skip locked
  loop
    if v_s.room_id is not null then perform public.moim__rooms_archive(array[v_s.room_id]); end if;
    update public.moim_schedules set room_archived_at = now() where id = v_s.id;
    perform public.moim__log(v_s.moim_id, null, 'system', 'schedule_room_archived', v_s.id, jsonb_build_object('days', v_days));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'archived', v_n, 'policy', v_days);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_schedules_finish_due(p_limit integer DEFAULT 200)
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
    if exists (select 1 from public.moims m where m.id = v_s.moim_id and m.status = 'active' and m.platform_state <> 'blocked') then
      select coalesce(jsonb_agg(user_id), '[]'::jsonb) into v_users
        from public.moim_schedule_participants where schedule_id = v_s.id and status = 'confirmed';
    else
      v_users := '[]'::jsonb;
    end if;
    perform public.moim__log(v_s.moim_id, null, 'system', 'schedule_done', v_s.id, '{}'::jsonb);
    v_out := v_out || jsonb_build_object('schedule_id', v_s.id, 'moim_id', v_s.moim_id, 'title', v_s.title, 'user_ids', v_users);
  end loop;
  return jsonb_build_object('ok', true, 'done', v_out);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_schedule_attendance(p_actor uuid, p_schedule uuid, p_user uuid, p_attendance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_s record;
begin
  select s.*, m.status moim_status into v_s from public.moim_schedules s join public.moims m on m.id = s.moim_id where s.id = p_schedule;
  if not found or v_s.moim_status <> 'active' or v_s.status = 'cancelled' then perform public.moim__fail('moim_schedule_not_found'); end if;
  if v_s.starts_at > now() then perform public.moim__fail('moim_schedule_not_started'); end if;
  if p_attendance not in ('unknown', 'present', 'absent') then perform public.moim__fail('moim_attendance_invalid'); end if;
  if not public.moim__schedule_can_manage(p_schedule, p_actor) then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_schedule_participants set attendance = p_attendance, updated_at = now()
   where schedule_id = p_schedule and user_id = p_user and status = 'confirmed';
  if not found then perform public.moim__fail('moim_schedule_not_joined'); end if;
  perform public.moim__log(v_s.moim_id, p_actor, 'user', 'attendance_set', p_schedule, jsonb_build_object('user_id', p_user, 'attendance', p_attendance));
  return jsonb_build_object('ok', true);
end
$function$;
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
  if v_c.author_id is distinct from p_actor and not public.moim_actor_can(v_c.moim_id, p_actor, 'hide_post') then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_comments set status = case when v_c.author_id = p_actor then 'deleted' else 'hidden' end, updated_at = now() where id = p_comment;
  update public.moim_posts set comment_count = greatest(comment_count - 1, 0) where id = v_c.post_id;
  perform public.moim__log(v_c.moim_id, p_actor, 'user', case when v_c.author_id = p_actor then 'comment_deleted' else 'comment_hidden' end, p_comment, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_album_pin(p_actor uuid, p_item uuid, p_pinned boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.moim__log(v_i.moim_id, p_actor, 'user', case when p_pinned then 'album_pinned' else 'album_unpinned' end, p_item, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_schedule_set_closed(p_actor uuid, p_schedule uuid, p_closed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_s record;
begin
  v_s := public.moim__schedule_open_for_change(p_schedule);
  if not public.moim__schedule_can_manage(p_schedule, p_actor) then perform public.moim__fail('moim_forbidden'); end if;
  update public.moim_schedules set status = case when p_closed then 'closed' else 'recruiting' end, updated_at = now() where id = p_schedule;
  perform public.moim__schedule_refresh(p_schedule);
  perform public.moim__log(v_s.moim_id, p_actor, 'user', case when p_closed then 'schedule_closed' else 'schedule_reopened' end, p_schedule, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end
$function$;
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
  if char_length(v_nick) > 40 then perform public.moim__fail('moim_nickname_invalid'); end if;
  perform public.moim__assert_text_clean(array[v_nick, p->>'bio']);
  begin
    insert into public.moims (id, name, intro, cover_image_url, category_id, topic_label, lgu_id, join_mode, capacity,
                              age_min_birth_year, age_max_birth_year, host_user_id, created_by)
    values (v_id, v_name, v_intro, nullif(p->>'cover_image_url', ''), v_cat.id, v_topic, v_lgu, v_join, v_cap,
            nullif(p->>'age_min_birth_year', '')::int, nullif(p->>'age_max_birth_year', '')::int, p_actor, p_actor);
  exception when unique_violation then
    perform public.moim__fail('moim_duplicate');
  end;
  insert into public.moim_members (moim_id, user_id, role, status, nickname, avatar_url, bio, joined_at)
  values (v_id, p_actor, 'host', 'active', v_nick, coalesce(nullif(p->>'avatar_url', ''), v_prof.avatar_url), left(coalesce(p->>'bio', ''), 300), now());
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
  if nullif(p->>'cover_image_url', '') is not null then
    perform public.moim__writer_on();
    update public.community_messenger_rooms set avatar_url = nullif(p->>'cover_image_url', ''), updated_at = now() where id = v_room;
  end if;
  perform public.moim__log(v_id, p_actor, 'user', 'created', null, jsonb_build_object('join_mode', v_join));
  return jsonb_build_object('ok', true, 'moim_id', v_id, 'room_id', v_room);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_schedule_join(p_actor uuid, p_schedule uuid, p_motivation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.moim__assert_text_clean(array[v_mot]);
  insert into public.moim_schedule_participants (schedule_id, user_id, status, motivation)
  values (p_schedule, p_actor, 'requested', nullif(left(v_mot, 500), ''))
  on conflict (schedule_id, user_id) do update set status = 'requested', motivation = excluded.motivation, decided_by = null, decided_at = null, updated_at = now();
  perform public.moim__log(v_s.moim_id, p_actor, 'user', 'schedule_requested', p_schedule, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'status', 'requested', 'host_user_id', v_s.host_user_id, 'moim_id', v_s.moim_id, 'title', v_s.title);
end
$function$;
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
  return jsonb_build_object('ok', true, 'comment_id', v_id, 'post_author_id', v_po.author_id, 'moim_id', v_po.moim_id);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_album_add(p_actor uuid, p_moim uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform public.moim__log(p_moim, p_actor, 'user', 'album_added', v_schedule, jsonb_build_object('count', v_n));
  return jsonb_build_object('ok', true, 'added', v_n);
end
$function$;
CREATE OR REPLACE FUNCTION public.moim_member_note_set(p_actor uuid, p_moim uuid, p_target uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not public.moim_actor_can(p_moim, p_actor, 'write_note') then perform public.moim__fail('moim_forbidden'); end if;
  if not exists (select 1 from public.moim_members where moim_id = p_moim and user_id = p_target) then perform public.moim__fail('moim_target_not_member'); end if;
  if btrim(coalesce(p_body, '')) = '' then
    delete from public.moim_member_notes where moim_id = p_moim and target_user_id = p_target;
    perform public.moim__log(p_moim, p_actor, 'user', 'note_deleted', p_target, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'deleted', true);
  end if;
  select id into v_id from public.moim_member_notes where moim_id = p_moim and target_user_id = p_target order by created_at limit 1;
  if v_id is null then
    insert into public.moim_member_notes (moim_id, target_user_id, author_user_id, body) values (p_moim, p_target, p_actor, left(btrim(p_body), 1000)) returning id into v_id;
  else
    update public.moim_member_notes set body = left(btrim(p_body), 1000), author_user_id = p_actor, updated_at = now() where id = v_id;
  end if;
  perform public.moim__log(p_moim, p_actor, 'user', 'note_set', p_target, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'note_id', v_id);
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
  if v_reason !~ '^[a-z_]{2,40}$' then perform public.moim__fail('moim_report_reason_invalid'); end if;
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

revoke all on function public.moim__assert_text_clean(text[]) from public, anon, authenticated;
revoke all on function public.moim__assert_images(jsonb) from public, anon, authenticated;
revoke all on function public.moim_permission_ceiling(text) from public, anon, authenticated;
revoke all on function public.moim__sync_member_rooms(uuid, uuid) from public, anon, authenticated;
revoke all on function public.moim__close_cleanup(uuid) from public, anon, authenticated;
revoke all on function public.moim__release_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.moim_admin_member_role(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.moim_admin_assign_host(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.moim_admin_sanction_apply(uuid, uuid, text, text, text, timestamp with time zone, uuid) from public, anon, authenticated;
grant execute on function public.moim__assert_text_clean(text[]) to service_role;
grant execute on function public.moim__assert_images(jsonb) to service_role;
grant execute on function public.moim_permission_ceiling(text) to service_role;
grant execute on function public.moim__sync_member_rooms(uuid, uuid) to service_role;
grant execute on function public.moim__close_cleanup(uuid) to service_role;
grant execute on function public.moim__release_member(uuid, uuid) to service_role;
grant execute on function public.moim_admin_member_role(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.moim_admin_assign_host(uuid, uuid, uuid, text, uuid) to service_role;
grant execute on function public.moim_admin_sanction_apply(uuid, uuid, text, text, text, timestamp with time zone, uuid) to service_role;

