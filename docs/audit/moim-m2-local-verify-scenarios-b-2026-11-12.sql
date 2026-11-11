\set ON_ERROR_STOP off
insert into public.profiles (id, nickname, phone_verified, date_of_birth) values
  ('00000000-0000-0000-0000-0000000000a5', 'mem5', true, '1999-01-01'),
  ('00000000-0000-0000-0000-0000000000a6', 'mem6', true, '1995-01-01');
create table public._t2 (n serial, k text, v text);
grant all on public._t2, public._t2_n_seq to service_role, authenticated;

set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null

do $s$
declare
  u1 uuid := '00000000-0000-0000-0000-0000000000a1';
  u2 uuid := '00000000-0000-0000-0000-0000000000a2';
  u3 uuid := '00000000-0000-0000-0000-0000000000a3';
  u5 uuid := '00000000-0000-0000-0000-0000000000a5';
  u6 uuid := '00000000-0000-0000-0000-0000000000a6';
  cat uuid := (select id from public.moim_categories where slug = 'sports');
  r jsonb; mid uuid; room uuid; mid2 uuid; plain uuid := gen_random_uuid();
begin
  -- A. 정원
  r := public.moim_create(u1, jsonb_build_object('name','정원 시험','category_id',cat,'capacity',2));
  mid := (r->>'moim_id')::uuid; room := (r->>'room_id')::uuid;
  perform public.moim_join(u5, mid, '{}'::jsonb);
  begin perform public.moim_join(u6, mid, '{}'::jsonb); insert into _t2(k,v) values ('A_full','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('A_full', sqlerrm); end;

  -- E. 연령 (2000년 이후 출생만)
  r := public.moim_create(u1, jsonb_build_object('name','연령 시험','category_id',cat,'age_min_birth_year',2000));
  mid2 := (r->>'moim_id')::uuid;
  begin perform public.moim_join(u2, mid2, '{}'::jsonb); insert into _t2(k,v) values ('E_no_dob','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('E_no_dob', sqlerrm); end;
  begin perform public.moim_join(u5, mid2, '{}'::jsonb); insert into _t2(k,v) values ('E_too_old','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('E_too_old', sqlerrm); end;
  insert into _t2(k,v) values ('E_ok', public.moim_join(u3, mid2, '{}'::jsonb)->>'status');

  -- F. 경고 상태: 위임 불가 / 차단 상태: 종료만
  update public.moims set platform_state = 'warned' where id = mid2;
  begin perform public.moim_host_transfer_request(u1, mid2, u3); insert into _t2(k,v) values ('F_warn_transfer','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('F_warn_transfer', sqlerrm); end;
  update public.moims set platform_state = 'blocked' where id = mid2;
  begin perform public.moim_invite_link_create(u1, mid2, null); insert into _t2(k,v) values ('F_block_link','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('F_block_link', sqlerrm); end;
  insert into _t2(k,v) values ('F_block_close_allowed', public.moim_actor_can(mid2, u1, 'close')::text);

  -- 재가입 횟수: 차단 → 해제 → 재가입
  perform public.moim_member_remove(u1, mid, u5, true, null);
  perform public.moim_member_unban(u1, mid, u5);
  perform public.moim_join(u5, mid, '{}'::jsonb);
  insert into _t2(k,v) select 'rejoin_after_ban', rejoin_count::text from moim_members where moim_id = mid and user_id = u5;

  -- B. 메신저 쪽 쓰기 (service_role, 모임 RPC 밖 = 쓰기 표시 없음)
  perform set_config('dibay.moim_writer', '', true);
  begin update community_messenger_participants set left_at = now() where room_id = room and user_id = u5; insert into _t2(k,v) values ('B_leave','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('B_leave', sqlerrm); end;
  begin update community_messenger_participants set role = 'admin' where room_id = room and user_id = u5; insert into _t2(k,v) values ('B_role','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('B_role', sqlerrm); end;
  begin insert into community_messenger_participants (room_id, user_id, role) values (room, u6, 'member'); insert into _t2(k,v) values ('B_insert','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('B_insert', sqlerrm); end;
  begin update community_messenger_rooms set title = 'x' where id = room; insert into _t2(k,v) values ('B_title','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('B_title', sqlerrm); end;
  begin update community_messenger_rooms set owner_user_id = u5 where id = room; insert into _t2(k,v) values ('B_owner','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('B_owner', sqlerrm); end;
  begin update community_messenger_rooms set deleted_at = now() where id = room; insert into _t2(k,v) values ('B_delete','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('B_delete', sqlerrm); end;
  begin update community_messenger_rooms set owner_domain = null, owner_ref_id = null where id = room; insert into _t2(k,v) values ('B_unown','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('B_unown', sqlerrm); end;
  begin insert into community_messenger_group_invite_links (room_id, token) values (room, 't'); insert into _t2(k,v) values ('B_invite_link','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('B_invite_link', sqlerrm); end;
  begin insert into community_messenger_group_join_requests (room_id, user_id) values (room, u6); insert into _t2(k,v) values ('B_join_request','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('B_join_request', sqlerrm); end;
  begin insert into community_messenger_group_bans (room_id, user_id) values (room, u5); insert into _t2(k,v) values ('B_room_ban','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('B_room_ban', sqlerrm); end;
  begin
    insert into community_messenger_rooms (room_type, visibility, join_policy, chat_domain, domain_identity, domain_identity_key, owner_domain, owner_ref_id)
    values ('private_group', 'private', 'invite_only', 'group', 'group:fake', 'group:fake', 'moim', mid);
    insert into _t2(k,v) values ('B_fake_moim_room','FAIL: allowed');
  exception when others then insert into _t2(k,v) values ('B_fake_moim_room', sqlerrm); end;
  begin update community_messenger_participants set is_muted = true, unread_count = 0, last_read_at = now() where room_id = room and user_id = u5; insert into _t2(k,v) values ('B_mute_read_ok','yes'); exception when others then insert into _t2(k,v) values ('B_mute_read_ok', sqlerrm); end;
  begin update community_messenger_rooms set notice_text = '공지', last_message = 'hi', last_message_at = now() where id = room; insert into _t2(k,v) values ('B_notice_lastmsg_ok','yes'); exception when others then insert into _t2(k,v) values ('B_notice_lastmsg_ok', sqlerrm); end;

  -- D. 일반 그룹방(모임 아님)은 영향 없음
  insert into community_messenger_rooms (id, room_type, visibility, join_policy, chat_domain, domain_identity, domain_identity_key, owner_user_id, title)
  values (plain, 'private_group', 'private', 'invite_only', 'group', 'group:' || plain, 'group:' || plain, u1, 'plain');
  insert into community_messenger_participants (room_id, user_id, role) values (plain, u1, 'owner'), (plain, u2, 'member');
  update community_messenger_participants set left_at = now() where room_id = plain and user_id = u2;
  update community_messenger_rooms set title = 'plain2', owner_user_id = u1 where id = plain;
  insert into community_messenger_group_invite_links (room_id, token) values (plain, 't2');
  insert into _t2(k,v) values ('D_plain_room_ok', 'yes');
end
$s$;
reset role;

-- C. 로그인 회원(authenticated) 세션
set role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a5"}', false) \g /dev/null
do $c$
declare room uuid;
begin
  begin perform public.moim_join('00000000-0000-0000-0000-0000000000a5', gen_random_uuid(), '{}'::jsonb); insert into _t2(k,v) values ('C_exec_rpc','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('C_exec_rpc', sqlerrm); end;
  begin perform 1 from public.moims limit 1; insert into _t2(k,v) values ('C_select_moims','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('C_select_moims', sqlerrm); end;
  begin perform public.moim_actor_can(gen_random_uuid(), gen_random_uuid(), 'close'); insert into _t2(k,v) values ('C_exec_can','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('C_exec_can', sqlerrm); end;
  select room_id into room from public.community_messenger_participants where user_id = '00000000-0000-0000-0000-0000000000a5' and left_at is null limit 1;
  begin update public.community_messenger_participants set unread_count = 0, last_read_at = now(), is_muted = false where room_id = room and user_id = '00000000-0000-0000-0000-0000000000a5'; insert into _t2(k,v) values ('C_mark_read_ok', 'yes rows=' || (select count(*) from public.community_messenger_participants where room_id = room and user_id = '00000000-0000-0000-0000-0000000000a5')); exception when others then insert into _t2(k,v) values ('C_mark_read_ok', sqlerrm); end;
  begin update public.community_messenger_participants set left_at = now() where room_id = room and user_id = '00000000-0000-0000-0000-0000000000a5'; insert into _t2(k,v) values ('C_self_leave','FAIL: allowed'); exception when others then insert into _t2(k,v) values ('C_self_leave', sqlerrm); end;
end
$c$;
reset role;
select n, k, v from public._t2 order by n;
