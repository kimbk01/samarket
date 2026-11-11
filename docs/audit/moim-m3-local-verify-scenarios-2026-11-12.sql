\set ON_ERROR_STOP off
create table public._t4 (n serial, k text, v text);
grant all on public._t4, public._t4_n_seq to service_role;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
do $s$
declare
  u1 uuid := '00000000-0000-0000-0000-0000000000a1';
  u2 uuid := '00000000-0000-0000-0000-0000000000a2';
  u3 uuid := '00000000-0000-0000-0000-0000000000a3';
  cat uuid := (select id from public.moim_categories where slug = 'sports');
  r jsonb; mid uuid; room uuid; notice uuid; free uuid; custom uuid; p1 uuid; p2 uuid; c1 uuid; msg uuid := gen_random_uuid();
begin
  r := public.moim_create(u1, jsonb_build_object('name','M3 시험','category_id',cat));
  mid := (r->>'moim_id')::uuid; room := (r->>'room_id')::uuid;
  perform public.moim_join(u2, mid, '{}'::jsonb);
  select id into notice from moim_boards where moim_id = mid and kind = 'notice';
  select id into free from moim_boards where moim_id = mid and kind = 'free';

  -- 멤버는 공지 게시판에 못 씀, 자유 게시판은 씀
  begin perform public.moim_post_create(u2, mid, jsonb_build_object('board_id', notice, 'body', 'x')); insert into _t4(k,v) values ('member_notice','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('member_notice', sqlerrm); end;
  r := public.moim_post_create(u2, mid, jsonb_build_object('board_id', free, 'title', 't', 'body', '자유글', 'visibility', 'public'));
  p1 := (r->>'post_id')::uuid; insert into _t4(k,v) values ('member_free', r->>'board_kind');
  begin perform public.moim_post_create(u3, mid, jsonb_build_object('board_id', free, 'body', 'x')); insert into _t4(k,v) values ('nonmember_post','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('nonmember_post', sqlerrm); end;
  begin perform public.moim_post_create(u2, mid, jsonb_build_object('board_id', free, 'body', '')); insert into _t4(k,v) values ('empty_body','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('empty_body', sqlerrm); end;

  -- 공지 작성·고정 (모임장)
  r := public.moim_post_create(u1, mid, jsonb_build_object('board_id', notice, 'body', '공지'));
  p2 := (r->>'post_id')::uuid; insert into _t4(k,v) values ('host_notice', r->>'board_kind');
  perform public.moim_post_pin(u1, p2, true);
  insert into _t4(k,v) select 'pinned', is_pinned::text from moim_posts where id = p2;
  begin perform public.moim_post_pin(u1, p1, true); insert into _t4(k,v) values ('pin_free','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('pin_free', sqlerrm); end;
  begin perform public.moim_post_pin(u2, p2, false); insert into _t4(k,v) values ('member_unpin','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('member_unpin', sqlerrm); end;

  -- 보이는 범위
  insert into _t4(k,v) values ('visible_public_to_nonmember', public.moim_post_visible_to(p1, u3)::text);
  insert into _t4(k,v) values ('visible_members_to_nonmember', public.moim_post_visible_to(p2, u3)::text);

  -- 댓글
  begin perform public.moim_comment_create(u3, p1, 'hi'); insert into _t4(k,v) values ('nonmember_comment','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('nonmember_comment', sqlerrm); end;
  r := public.moim_comment_create(u1, p1, '댓글'); c1 := (r->>'comment_id')::uuid;
  insert into _t4(k,v) select 'comment', (r->>'post_author_id' = u2::text)::text || ' count=' || comment_count from moim_posts where id = p1;
  begin perform public.moim_comment_remove(u2, c1); insert into _t4(k,v) values ('member_remove_others_comment','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('member_remove_others_comment', sqlerrm); end;

  -- 수정·삭제·숨김
  begin perform public.moim_post_update(u1, p1, '{"body":"x"}'::jsonb); insert into _t4(k,v) values ('others_edit','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('others_edit', sqlerrm); end;
  perform public.moim_post_update(u2, p1, '{"body":"수정됨"}'::jsonb);
  insert into _t4(k,v) select 'edited', body from moim_posts where id = p1;
  r := public.moim_post_remove(u1, p1, '규칙');
  insert into _t4(k,v) values ('host_hides', (r->>'result') || ' status=' || (select status from moim_posts where id = p1));
  r := public.moim_post_remove(u1, p2, null);
  insert into _t4(k,v) values ('author_deletes', (r->>'result') || ' pinned=' || (select is_pinned::text from moim_posts where id = p2));

  -- 게시판 관리
  begin perform public.moim_board_upsert(u2, mid, '{"name":"사진"}'::jsonb); insert into _t4(k,v) values ('member_board','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('member_board', sqlerrm); end;
  r := public.moim_board_upsert(u1, mid, '{"name":"사진","write_min_role":"member"}'::jsonb); custom := (r->>'board_id')::uuid;
  insert into _t4(k,v) select 'custom_board', kind || ':' || name from moim_boards where id = custom;
  begin perform public.moim_board_upsert(u1, mid, jsonb_build_object('board_id', notice, 'name', 'x')); insert into _t4(k,v) values ('rename_system','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('rename_system', sqlerrm); end;
  perform public.moim_board_upsert(u1, mid, jsonb_build_object('board_id', custom, 'is_active', false));
  insert into _t4(k,v) select 'custom_inactive', (not is_active)::text from moim_boards where id = custom;

  -- 운영진 메모
  begin perform public.moim_member_note_set(u2, mid, u1, 'x'); insert into _t4(k,v) values ('member_note','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('member_note', sqlerrm); end;
  perform public.moim_member_note_set(u1, mid, u2, '성실함');
  insert into _t4(k,v) select 'note', body from moim_member_notes where moim_id = mid and target_user_id = u2;

  -- 신고
  r := public.moim_report_create(u3, mid, jsonb_build_object('target_type','moim','target_id',mid,'reason_code','commercial'));
  insert into _t4(k,v) values ('report_moim', r->>'ok');
  begin perform public.moim_report_create(u3, mid, jsonb_build_object('target_type','moim','target_id',mid,'reason_code','commercial')); insert into _t4(k,v) values ('report_dup','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('report_dup', sqlerrm); end;
  begin perform public.moim_report_create(u3, mid, jsonb_build_object('target_type','post','target_id',gen_random_uuid(),'reason_code','commercial')); insert into _t4(k,v) values ('report_foreign_target','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('report_foreign_target', sqlerrm); end;
  begin perform public.moim_report_create(u2, mid, jsonb_build_object('target_type','member','target_id',u2,'reason_code','abuse_hate')); insert into _t4(k,v) values ('report_self','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('report_self', sqlerrm); end;
  insert into community_messenger_messages (id, room_id) values (msg, room);
  r := public.moim_report_create(u2, mid, jsonb_build_object('target_type','chat_message','target_id',msg,'reason_code','abuse_hate'));
  insert into _t4(k,v) values ('report_chat_message', r->>'ok');

  -- 차단된 모임은 글쓰기 불가
  update moims set platform_state = 'blocked' where id = mid;
  begin perform public.moim_post_create(u1, mid, jsonb_build_object('board_id', free, 'body', 'x')); insert into _t4(k,v) values ('blocked_post','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('blocked_post', sqlerrm); end;
end
$s$;
reset role;
set role authenticated;
do $c$ begin
  begin perform public.moim_post_create(gen_random_uuid(), gen_random_uuid(), '{}'::jsonb); insert into _t4(k,v) values ('auth_exec','FAIL: allowed'); exception when others then insert into _t4(k,v) values ('auth_exec', sqlerrm); end;
end $c$;
reset role;
select n, k, v from public._t4 order by n;
