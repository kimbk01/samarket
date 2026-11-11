\set ON_ERROR_STOP off
insert into public.moim_categories (slug, label_ko, label_en) values ('sports', '운동', 'Sports') on conflict do nothing;
insert into public.profiles (id, nickname, phone_verified) values ('00000000-0000-0000-0000-0000000000c4', 'c4', true) on conflict do nothing;
create table public._t5 (n serial, k text, v text);
grant all on public._t5, public._t5_n_seq to service_role;
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false) \g /dev/null
do $s$
declare
  u1 uuid := '00000000-0000-0000-0000-0000000000a1';
  u2 uuid := '00000000-0000-0000-0000-0000000000a2';
  u3 uuid := '00000000-0000-0000-0000-0000000000a3';
  u4 uuid := '00000000-0000-0000-0000-0000000000c4';
  cat uuid := (select id from public.moim_categories where slug = 'sports');
  r jsonb; mid uuid; s1 uuid; s2 uuid; room1 uuid; a1 uuid; a2 uuid;
begin
  r := public.moim_create(u1, jsonb_build_object('name','M4 시험','category_id',cat));
  mid := (r->>'moim_id')::uuid;
  perform public.moim_join(u2, mid, '{}'::jsonb);
  perform public.moim_join(u3, mid, '{}'::jsonb);

  -- 만들기 검증
  begin perform public.moim_schedule_create(u4, mid, jsonb_build_object('title','x','starts_at', now() + interval '2 day')); insert into _t5(k,v) values ('nonmember_create','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('nonmember_create', sqlerrm); end;
  begin perform public.moim_schedule_create(u2, mid, jsonb_build_object('title','x','starts_at', now() - interval '1 hour')); insert into _t5(k,v) values ('past_time','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('past_time', sqlerrm); end;

  -- 선착순 일정 (정원 2) — 멤버 u2 가 만듦(기본 권한 멤버 누구나)
  r := public.moim_schedule_create(u2, mid, jsonb_build_object('title','토요 게임','starts_at', now() + interval '2 day','capacity',2,'join_mode','first_come'));
  s1 := (r->>'schedule_id')::uuid; room1 := (r->>'room_id')::uuid;
  insert into _t5(k,v) select 'room1', format('owner_ref=schedule:%s type=%s host_owner=%s', owner_ref_id = s1, room_type, owner_user_id = u2) from community_messenger_rooms where id = room1;
  insert into _t5(k,v) select 's1_after_create', status || ' confirmed=' || confirmed_count from moim_schedules where id = s1;
  r := public.moim_schedule_join(u3, s1, null);
  insert into _t5(k,v) select 'join_first_come', (r->>'status') || ' sched=' || status || ' cm=' || coalesce((select role from community_messenger_participants where room_id = room1 and user_id = u3 and left_at is null),'none') from moim_schedules where id = s1;
  begin perform public.moim_schedule_join(u1, s1, null); insert into _t5(k,v) values ('join_full','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('join_full', sqlerrm); end;
  begin perform public.moim_schedule_join(u4, s1, null); insert into _t5(k,v) values ('join_nonmember','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('join_nonmember', sqlerrm); end;
  begin perform public.moim_schedule_leave(u2, s1); insert into _t5(k,v) values ('host_leave','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('host_leave', sqlerrm); end;
  perform public.moim_schedule_leave(u3, s1);
  insert into _t5(k,v) select 'after_leave', status || ' confirmed=' || confirmed_count || ' cm_left=' || (select (left_at is not null)::text from community_messenger_participants where room_id = room1 and user_id = u3) from moim_schedules where id = s1;

  -- 관리: 모임장(u1)이 일정 수정 가능, 정원은 확정 인원 아래 불가
  perform public.moim_schedule_update(u1, s1, '{"title":"토요 게임 2"}'::jsonb);
  insert into _t5(k,v) select 'title_sync', title from community_messenger_rooms where id = room1;
  begin perform public.moim_schedule_update(u3, s1, '{"title":"x"}'::jsonb); insert into _t5(k,v) values ('member_update','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('member_update', sqlerrm); end;

  -- 승인제 일정 + 지원 동기
  r := public.moim_schedule_create(u1, mid, jsonb_build_object('title','레슨','starts_at', now() + interval '3 day','join_mode','approval','ask_motivation',true));
  s2 := (r->>'schedule_id')::uuid;
  begin perform public.moim_schedule_join(u3, s2, '짧음'); insert into _t5(k,v) values ('motivation_short','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('motivation_short', sqlerrm); end;
  r := public.moim_schedule_join(u3, s2, '자세 교정 받고 싶어요!');
  insert into _t5(k,v) values ('request', (r->>'status') || ' host=' || ((r->>'host_user_id')::uuid = u1)::text);
  begin perform public.moim_schedule_update(u1, s2, '{"join_mode":"first_come"}'::jsonb); insert into _t5(k,v) values ('mode_change_pending','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('mode_change_pending', sqlerrm); end;
  begin perform public.moim_schedule_decide(u2, s2, u3, true); insert into _t5(k,v) values ('member_decide','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('member_decide', sqlerrm); end;
  perform public.moim_schedule_decide(u1, s2, u3, true);
  insert into _t5(k,v) select 'approved', status from moim_schedule_participants where schedule_id = s2 and user_id = u3;
  perform public.moim_schedule_join(u2, s2, '저도 참여하고 싶어요');
  perform public.moim_schedule_remove_participant(u1, s2, u2);
  begin perform public.moim_schedule_join(u2, s2, '다시 참여하고 싶어요'); insert into _t5(k,v) values ('removed_rejoin','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('removed_rejoin', sqlerrm); end;

  -- 출석: 시작 전 불가
  begin perform public.moim_schedule_attendance(u1, s2, u3, 'present'); insert into _t5(k,v) values ('attendance_before','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('attendance_before', sqlerrm); end;

  -- 모임 탈퇴 → 다가오는 일정 참여 자동 취소 + 일정 방 퇴장
  perform public.moim_leave(u3, mid);
  insert into _t5(k,v) select 'leave_moim_cancels', status from moim_schedule_participants where schedule_id = s2 and user_id = u3;

  -- 리마인드 (24h 창): s1 은 2일 뒤라 아직, 시간을 당겨서 확인
  update moim_schedules set starts_at = now() + interval '20 hours' where id = s1;
  r := public.moim_schedules_claim_reminders('24h');
  insert into _t5(k,v) values ('reminder_24h', jsonb_array_length(r->'reminders')::text);
  r := public.moim_schedules_claim_reminders('24h');
  insert into _t5(k,v) values ('reminder_24h_again', jsonb_array_length(r->'reminders')::text);

  -- 종료 처리: 지난 일정(끝 시간 없음 → 그날 필리핀 자정)
  update moim_schedules set starts_at = now() - interval '2 day' where id = s1;
  r := public.moim_schedules_finish_due(100);
  insert into _t5(k,v) values ('finish_due', jsonb_array_length(r->'done')::text || ' status=' || (select status from moim_schedules where id = s1) || ' readonly=' || (select is_readonly::text from community_messenger_rooms where id = room1));
  perform public.moim_schedule_attendance(u2, s1, u2, 'present');
  insert into _t5(k,v) select 'attendance_after', attendance from moim_schedule_participants where schedule_id = s1 and user_id = u2;

  -- 일정 취소
  r := public.moim_schedule_cancel(u1, s2);
  insert into _t5(k,v) values ('cancel', (r->>'ok') || ' status=' || (select status from moim_schedules where id = s2));

  -- 앨범
  r := public.moim_album_add(u2, mid, jsonb_build_object('urls', jsonb_build_array('https://img/a.jpg','https://img/b.jpg'), 'schedule_id', s1));
  insert into _t5(k,v) values ('album_add', r->>'added');
  begin perform public.moim_album_add(u2, mid, jsonb_build_object('urls', jsonb_build_array('javascript:alert(1)'))); insert into _t5(k,v) values ('album_bad_url','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('album_bad_url', sqlerrm); end;
  begin perform public.moim_album_add(u4, mid, jsonb_build_object('urls', jsonb_build_array('https://img/c.jpg'))); insert into _t5(k,v) values ('album_nonmember','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('album_nonmember', sqlerrm); end;
  select id into a1 from moim_album_items where moim_id = mid order by created_at limit 1;
  begin perform public.moim_album_pin(u2, a1, true); insert into _t5(k,v) values ('member_pin','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('member_pin', sqlerrm); end;
  perform public.moim_album_pin(u1, a1, true);
  insert into _t5(k,v) select 'pinned', is_pinned::text from moim_album_items where id = a1;
  r := public.moim_album_remove(u1, a1);
  insert into _t5(k,v) values ('host_hides_photo', r->>'result');

  -- 알림 설정
  begin perform public.moim_notification_prefs_set(u4, mid, '{"posts":true}'::jsonb); insert into _t5(k,v) values ('prefs_nonmember','FAIL: allowed'); exception when others then insert into _t5(k,v) values ('prefs_nonmember', sqlerrm); end;
  perform public.moim_notification_prefs_set(u2, mid, '{"posts":true}'::jsonb);
  perform public.moim_notification_prefs_set(u2, mid, '{"notice":false}'::jsonb);
  insert into _t5(k,v) select 'prefs', format('notice=%s posts=%s schedules=%s', notice, posts, schedules) from moim_notification_prefs where moim_id = mid and user_id = u2;
end
$s$;
reset role;
select n, k, v from public._t5 order by n;
