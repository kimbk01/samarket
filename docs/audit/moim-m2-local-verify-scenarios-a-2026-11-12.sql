\set ON_ERROR_STOP off
insert into public.moim_categories (slug, label_ko, label_en) values ('sports', '운동', 'Sports'), ('banned_cat', '금지', 'Banned');
update public.moim_categories set is_restricted = true where slug = 'banned_cat';

create table public._t (n serial, k text, v text);
grant all on public._t, public._t_n_seq to service_role;

set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);

do $s$
declare
  u1 uuid := '00000000-0000-0000-0000-0000000000a1';
  u2 uuid := '00000000-0000-0000-0000-0000000000a2';
  u3 uuid := '00000000-0000-0000-0000-0000000000a3';
  u4 uuid := '00000000-0000-0000-0000-0000000000a4';
  cat uuid := (select id from public.moim_categories where slug = 'sports');
  badcat uuid := (select id from public.moim_categories where slug = 'banned_cat');
  r jsonb; mid uuid; room uuid; req uuid; tr uuid; inv jsonb; it uuid; t timestamptz;
  procedure_note text;
  -- 기록
begin
  -- P1 개설 실패 케이스
  begin perform public.moim_create(u4, jsonb_build_object('name','x','category_id',cat)); insert into _t(k,v) values ('create_no_phone','FAIL: allowed'); exception when others then insert into _t(k,v) values ('create_no_phone', sqlerrm); end;
  begin perform public.moim_create(u2, jsonb_build_object('name','x','category_id',cat)); insert into _t(k,v) values ('create_no_address','FAIL: allowed'); exception when others then insert into _t(k,v) values ('create_no_address', sqlerrm); end;
  begin perform public.moim_create(u1, jsonb_build_object('name','x','category_id',badcat)); insert into _t(k,v) values ('create_restricted_cat','FAIL: allowed'); exception when others then insert into _t(k,v) values ('create_restricted_cat', sqlerrm); end;
  begin perform public.moim_create(u1, jsonb_build_object('name','x','category_id',cat,'questions',jsonb_build_array('a','b','c','d'))); insert into _t(k,v) values ('create_4_questions','FAIL: allowed'); exception when others then insert into _t(k,v) values ('create_4_questions', sqlerrm); end;

  -- P1 개설
  r := public.moim_create(u1, jsonb_build_object('name','BGC 배드민턴','intro','매주','category_id',cat,'join_mode','instant','capacity',3,'questions',jsonb_build_array('경력?')));
  mid := (r->>'moim_id')::uuid; room := (r->>'room_id')::uuid;
  insert into _t(k,v) values ('create', r::text);
  insert into _t(k,v) select 'room', format('type=%s owner_domain=%s ref_ok=%s discover=%s link=%s identity=%s title=%s owner_ok=%s', room_type, owner_domain, owner_ref_id = mid, is_discoverable, invite_link_enabled, identity_policy, title, owner_user_id = u1) from community_messenger_rooms where id = room;
  insert into _t(k,v) select 'host_cm', role || ' alias=' || (select identity_mode || ':' || display_name from community_messenger_room_profiles where room_id = room and user_id = u1) from community_messenger_participants where room_id = room and user_id = u1;
  insert into _t(k,v) select 'boards', string_agg(kind || ':' || write_min_role, ',' order by sort_order) from moim_boards where moim_id = mid;
  insert into _t(k,v) select 'members_count', member_count::text from moims where id = mid;
  begin perform public.moim_create(u1, jsonb_build_object('name','BGC 배드민턴','category_id',cat)); insert into _t(k,v) values ('create_duplicate','FAIL: allowed'); exception when others then insert into _t(k,v) values ('create_duplicate', sqlerrm); end;

  -- P3 바로 가입
  r := public.moim_join(u2, mid, '{"nickname":"민지"}'::jsonb);
  insert into _t(k,v) values ('join_u2', r->>'status');
  insert into _t(k,v) select 'u2_cm', role || ' left=' || coalesce(left_at::text,'null') || ' alias=' || (select display_name from community_messenger_room_profiles where room_id = room and user_id = u2) from community_messenger_participants where room_id = room and user_id = u2;
  begin perform public.moim_join(u2, mid, '{}'::jsonb); insert into _t(k,v) values ('join_twice','FAIL: allowed'); exception when others then insert into _t(k,v) values ('join_twice', sqlerrm); end;
  begin perform public.moim_join(u4, mid, '{}'::jsonb); insert into _t(k,v) values ('join_no_phone','FAIL: allowed'); exception when others then insert into _t(k,v) values ('join_no_phone', sqlerrm); end;

  -- 권한: 멤버가 모임장 내보내기 / 모임장 탈퇴
  begin perform public.moim_member_remove(u2, mid, u1, false, null); insert into _t(k,v) values ('member_kicks_host','FAIL: allowed'); exception when others then insert into _t(k,v) values ('member_kicks_host', sqlerrm); end;
  begin perform public.moim_leave(u1, mid); insert into _t(k,v) values ('host_leave','FAIL: allowed'); exception when others then insert into _t(k,v) values ('host_leave', sqlerrm); end;

  -- P7 역할 + P8 위임
  perform public.moim_member_role_set(u1, mid, u2, 'co_host');
  insert into _t(k,v) select 'u2_cohost_cm', role from community_messenger_participants where room_id = room and user_id = u2;
  r := public.moim_host_transfer_request(u1, mid, u2); tr := (r->>'transfer_id')::uuid;
  begin perform public.moim_host_transfer_respond(u3, tr, true); insert into _t(k,v) values ('transfer_wrong_user','FAIL: allowed'); exception when others then insert into _t(k,v) values ('transfer_wrong_user', sqlerrm); end;
  r := public.moim_host_transfer_respond(u2, tr, true);
  insert into _t(k,v) select 'transfer', format('accepted=%s host=%s u1_role=%s cm_owner=%s room_owner=%s u1_cm=%s', r->>'accepted',
      (select host_user_id = u2 from moims where id = mid),
      (select role from moim_members where moim_id = mid and user_id = u1),
      (select user_id = u2 from community_messenger_participants where room_id = room and role = 'owner' and left_at is null),
      (select owner_user_id = u2 from community_messenger_rooms where id = room),
      (select role from community_messenger_participants where room_id = room and user_id = u1));

  -- 정보 수정 (낙관적 잠금) + 방 이름 동기화
  begin perform public.moim_update_info(u2, mid, '{"name":"x"}'::jsonb, now() - interval '1 day'); insert into _t(k,v) values ('update_stale','FAIL: allowed'); exception when others then insert into _t(k,v) values ('update_stale', sqlerrm); end;
  select updated_at into t from moims where id = mid;
  perform public.moim_update_info(u2, mid, '{"join_mode":"approval","name":"BGC 배드민턴 클럽"}'::jsonb, t);
  insert into _t(k,v) select 'room_title_sync', title from community_messenger_rooms where id = room;

  -- P3 승인 가입 (u3) — 운영진 아닌 멤버 u1(co_host 로 강등됨)도 승인 가능해야(co_host >= staff)
  r := public.moim_join(u3, mid, '{"answers":["2년"],"nickname":"하늘"}'::jsonb);
  req := (r->>'request_id')::uuid;
  insert into _t(k,v) values ('join_u3', r->>'status');
  insert into _t(k,v) select 'u3_cm_before', coalesce((select role from community_messenger_participants where room_id = room and user_id = u3), 'none');
  r := public.moim_join_decide(u1, req, true, null);
  insert into _t(k,v) select 'u3_after_approve', (select status from moim_members where moim_id = mid and user_id = u3) || '/' || (select role from community_messenger_participants where room_id = room and user_id = u3 and left_at is null);
  insert into _t(k,v) select 'count_after_3', member_count::text from moims where id = mid;

  -- 정원 3 도달 → 가입 불가
  begin perform public.moim_join(u4, mid, '{}'::jsonb); insert into _t(k,v) values ('join_when_full','FAIL: allowed'); exception when others then insert into _t(k,v) values ('join_when_full', sqlerrm); end;

  -- P6 차단 → 재가입 불가 → 해제
  perform public.moim_member_remove(u2, mid, u3, true, '규칙 위반');
  insert into _t(k,v) select 'u3_banned', (select status from moim_members where moim_id = mid and user_id = u3) || ' cm_left=' || (select (left_at is not null)::text from community_messenger_participants where room_id = room and user_id = u3);
  begin perform public.moim_join(u3, mid, '{}'::jsonb); insert into _t(k,v) values ('banned_rejoin','FAIL: allowed'); exception when others then insert into _t(k,v) values ('banned_rejoin', sqlerrm); end;
  perform public.moim_member_unban(u2, mid, u3);

  -- P4 초대 링크 + 운영진 친구 초대(승인 생략)
  inv := public.moim_invite_link_create(u2, mid, null);
  insert into _t(k,v) values ('link_resolve', public.moim_invite_link_resolve(inv->>'token')->>'ok');
  perform public.moim_invite_link_revoke(u2, (inv->>'invite_id')::uuid);
  insert into _t(k,v) values ('link_after_revoke', public.moim_invite_link_resolve(inv->>'token')::text);
  r := public.moim_invite_send(u2, mid, u3); it := (r->>'invite_target_id')::uuid;
  r := public.moim_invite_respond(u3, it, true, '{}'::jsonb);
  insert into _t(k,v) select 'staff_invite', (r->>'status') || ' rejoin_count=' || (select rejoin_count from moim_members where moim_id = mid and user_id = u3) || ' cm=' || (select role from community_messenger_participants where room_id = room and user_id = u3 and left_at is null);

  -- 권한 설정
  perform public.moim_permissions_set(u2, mid, '{"remove_member":"staff"}'::jsonb);
  begin perform public.moim_permissions_set(u2, mid, '{"remove_member":"member"}'::jsonb); insert into _t(k,v) values ('perm_below_floor','FAIL: allowed'); exception when others then insert into _t(k,v) values ('perm_below_floor', sqlerrm); end;
  begin perform public.moim_permissions_set(u2, mid, '{"edit_info":"member"}'::jsonb); insert into _t(k,v) values ('perm_fixed','FAIL: allowed'); exception when others then insert into _t(k,v) values ('perm_fixed', sqlerrm); end;
  perform public.moim_member_role_set(u2, mid, u3, 'staff');
  insert into _t(k,v) values ('staff_can_remove_after_override', public.moim_actor_can(mid, u3, 'remove_member')::text);

  -- 모임 프로필 → 방 표시 이름
  perform public.moim_profile_update(u3, mid, '{"nickname":"하늘(초보)"}'::jsonb);
  insert into _t(k,v) select 'alias_sync', display_name from community_messenger_room_profiles where room_id = room and user_id = u3;
  insert into _t(k,v) select 'profile_history', count(*)::text from moim_member_profile_history where moim_id = mid and user_id = u3;

  -- P5 탈퇴 + P15 종료
  perform public.moim_leave(u3, mid);
  insert into _t(k,v) select 'u3_left', (select status from moim_members where moim_id = mid and user_id = u3) || ' cm_left=' || (select (left_at is not null)::text from community_messenger_participants where room_id = room and user_id = u3);
  begin perform public.moim_close(u2, mid, 'wrong'); insert into _t(k,v) values ('close_wrong_name','FAIL: allowed'); exception when others then insert into _t(k,v) values ('close_wrong_name', sqlerrm); end;
  perform public.moim_close(u2, mid, 'BGC 배드민턴 클럽');
  insert into _t(k,v) select 'closed', (select status from moims where id = mid) || ' readonly=' || (select is_readonly::text from community_messenger_rooms where id = room);
  begin perform public.moim_join(u4, mid, '{}'::jsonb); insert into _t(k,v) values ('join_closed','FAIL: allowed'); exception when others then insert into _t(k,v) values ('join_closed', sqlerrm); end;
  insert into _t(k,v) select 'events', string_agg(type, ',' order by id) from moim_events where moim_id = mid;
end
$s$;

reset role;
select n, k, v from public._t order by n;
