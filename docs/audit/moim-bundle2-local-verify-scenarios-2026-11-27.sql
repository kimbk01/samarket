-- 모임 2번 묶음 로컬 임시 Postgres 17 검증 시나리오 (2026-11-27). 운영 정의와 md5 동일한 로컬 DB 에서 수정 전(마이그레이션 20271128110000 제외)·후 같은 스크립트를 실행.
-- 결과 기록: PR 본문. E5 동시 개설은 moim-bundle2-local-verify-e5-2026-11-27.sh
-- 모임 2번 묶음 시나리오 (로컬 임시 DB 전용 · 수정 전/후 같은 스크립트)
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
create temp table ids(k text primary key, v uuid);
create or replace function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
create or replace function pg_temp.r(label text, q text) returns text language plpgsql as $$
declare v text;
begin
  begin execute q into v; exception when others then return label || ' => ERROR ' || sqlerrm; end;
  return label || ' => ' || coalesce(v, 'NULL');
end $$;

insert into public.moim_categories (id, slug, label_ko, label_en, sort_order, is_active, is_restricted, allow_custom_topic)
values ('11111111-0000-0000-0000-000000000001', 'sports', '운동', 'Sports', 1, true, false, false) on conflict do nothing;
update public.moim_policies set max_co_hosts = 2, max_staff = 5, name_min_len = 2, intro_min_len = 10, banned_words = '{}' where id = 1;
insert into public.profiles (id, nickname, phone_verified)
select ('bbbbbbbb-0000-0000-0000-00000000000' || i)::uuid, 'b' || i, true from generate_series(1, 9) i;
insert into public.user_addresses (user_id, canonical_lgu_id, is_default_master, is_active)
select ('bbbbbbbb-0000-0000-0000-00000000000' || i)::uuid, '1381300000', true, true from generate_series(1, 9) i;
insert into ids select 'b' || i, ('bbbbbbbb-0000-0000-0000-00000000000' || i)::uuid from generate_series(1, 9) i;

-- M1: b1 모임장(바로 가입), b2~b6 가입, b2·b3 부모임장, b4 운영진
insert into ids values ('M1', (public.moim_create(pg_temp.id('b1'), '{"name":"Moim One","intro":"intro text ok 12","category_id":"11111111-0000-0000-0000-000000000001","nickname":"h1"}')->>'moim_id')::uuid);
select public.moim_join(pg_temp.id('b' || i), pg_temp.id('M1'), jsonb_build_object('nickname', 'n' || i)) from generate_series(2, 6) i \g /dev/null
select public.moim_member_role_set(pg_temp.id('b1'), pg_temp.id('M1'), pg_temp.id('b2'), 'co_host') \g /dev/null
select pg_sleep(0.01) \g /dev/null
select public.moim_member_role_set(pg_temp.id('b1'), pg_temp.id('M1'), pg_temp.id('b3'), 'co_host') \g /dev/null
select public.moim_member_role_set(pg_temp.id('b1'), pg_temp.id('M1'), pg_temp.id('b4'), 'staff') \g /dev/null

-- B6 권한표
select pg_temp.r('B6 운영진 메모 기본 허용', format('select public.moim_actor_can(%L, %L, %L)::text', pg_temp.id('M1'), pg_temp.id('b4'), 'write_note'));
select pg_temp.r('B6 모임장이 내보내기를 운영진에게 열기', format('select (public.moim_permissions_set(%L, %L, %L)->>%L)', pg_temp.id('b1'), pg_temp.id('M1'), '{"remove_member":"staff","ban_member":"staff"}', 'ok'));
select pg_temp.r('B6 → 운영진 내보내기 가능?', format('select public.moim_actor_can(%L, %L, %L)::text', pg_temp.id('M1'), pg_temp.id('b4'), 'remove_member'));

-- B12 위임 상한 (부모임장 2/2)
select pg_temp.r('B12 멤버 b5 에게 위임 요청', format('select public.moim_host_transfer_request(%L, %L, %L)->>%L', pg_temp.id('b1'), pg_temp.id('M1'), pg_temp.id('b5'), 'ok'));
select pg_temp.r('B12 부모임장 b2 에게 위임 요청', format('select public.moim_host_transfer_request(%L, %L, %L)->>%L', pg_temp.id('b1'), pg_temp.id('M1'), pg_temp.id('b2'), 'ok'));
update public.moim_host_transfers set status = 'cancelled' where moim_id = pg_temp.id('M1') and status = 'requested';

-- B1 일정 정원: 정원 3(호스트 포함) · b5·b6 참여 → 정원 → b6 모임 탈퇴 → b4 참여 시도
insert into ids values ('S1', (public.moim_schedule_create(pg_temp.id('b1'), pg_temp.id('M1'), jsonb_build_object('title', 'S one', 'starts_at', (now() + interval '2 days')::text, 'capacity', 3))->>'schedule_id')::uuid);
select public.moim_schedule_join(pg_temp.id('b5'), pg_temp.id('S1'), null) \g /dev/null
select public.moim_schedule_join(pg_temp.id('b6'), pg_temp.id('S1'), null) \g /dev/null
select pg_temp.r('B1 탈퇴 전 일정', format('select status || '' '' || confirmed_count from public.moim_schedules where id = %L', pg_temp.id('S1')));
select public.moim_leave(pg_temp.id('b6'), pg_temp.id('M1')) \g /dev/null
select pg_temp.r('B1 b6 탈퇴 뒤 일정', format('select status || '' '' || confirmed_count from public.moim_schedules where id = %L', pg_temp.id('S1')));
select pg_temp.r('B1 b4 빈자리 참여', format('select public.moim_schedule_join(%L, %L, null)->>%L', pg_temp.id('b4'), pg_temp.id('S1'), 'status'));

-- B9 일정 호스트 b4 의 역할 변경 → 일정 방 방장 유지?
insert into ids values ('S2', (public.moim_schedule_create(pg_temp.id('b4'), pg_temp.id('M1'), jsonb_build_object('title', 'S two', 'starts_at', (now() + interval '3 days')::text))->>'schedule_id')::uuid);
select public.moim_member_role_set(pg_temp.id('b1'), pg_temp.id('M1'), pg_temp.id('b4'), 'member') \g /dev/null
select pg_temp.r('B9 일정 방 호스트 역할 · 방 owner 일치', format(
  'select p.role || '' owner_match='' || (r.owner_user_id = %L)::text from public.community_messenger_participants p join public.community_messenger_rooms r on r.id = p.room_id where p.room_id = (select room_id from public.moim_schedules where id = %L) and p.user_id = %L and p.left_at is null',
  pg_temp.id('b4'), pg_temp.id('S2'), pg_temp.id('b4')));

-- D4 공지 권한: 모임장이 공지 작성·고정을 부모임장 이상으로 → 운영진 b3? (b3 = 부모임장) 운영진 다시 지정 b5
select public.moim_member_role_set(pg_temp.id('b1'), pg_temp.id('M1'), pg_temp.id('b5'), 'staff') \g /dev/null
select public.moim_permissions_set(pg_temp.id('b1'), pg_temp.id('M1'), '{"pin_notice":"co_host"}') \g /dev/null
select pg_temp.r('D4 운영진 공지 글쓰기', format('select public.moim_post_create(%L, %L, jsonb_build_object(''board_id'', (select id from public.moim_boards where moim_id = %L and kind = ''notice''), ''body'', ''notice body''))->>%L', pg_temp.id('b5'), pg_temp.id('M1'), pg_temp.id('M1'), 'ok'));
select pg_temp.r('D4 운영진 자유 게시판 글쓰기', format('select public.moim_post_create(%L, %L, jsonb_build_object(''board_id'', (select id from public.moim_boards where moim_id = %L and kind = ''free''), ''body'', ''free body''))->>%L', pg_temp.id('b5'), pg_temp.id('M1'), pg_temp.id('M1'), 'ok'));
-- (B8 용 b1 글)
select public.moim_post_create(pg_temp.id('b1'), pg_temp.id('M1'), jsonb_build_object('board_id', (select id from public.moim_boards where moim_id = pg_temp.id('M1') and kind = 'free'), 'body', 'host post')) \g /dev/null

-- (M1 용 b1 댓글)
select public.moim_comment_create(pg_temp.id('b1'), (select id from public.moim_posts where moim_id = pg_temp.id('M1') and body = 'host post'), 'host comment') \g /dev/null

-- B7 가입 질문 금지어
select pg_temp.r('B7 질문 「전화번호 알려 주세요」 저장', format('select public.moim_update_info(%L, %L, %L, (select updated_at from public.moims where id = %L))->>%L',
  pg_temp.id('b1'), pg_temp.id('M1'), '{"questions":["전화번호 알려 주세요"]}', pg_temp.id('M1'), 'ok'));
select pg_temp.r('B7 평범한 질문 저장', format('select public.moim_update_info(%L, %L, %L, (select updated_at from public.moims where id = %L))->>%L',
  pg_temp.id('b1'), pg_temp.id('M1'), '{"questions":["어떤 운동을 좋아하세요?"]}', pg_temp.id('M1'), 'ok'));

-- B10 질문 바꾼 뒤 답변 짝 (승인제 M2, b7 모임장, b8 신청)
insert into ids values ('M2', (public.moim_create(pg_temp.id('b7'), '{"name":"Moim Two","intro":"intro text ok 12","category_id":"11111111-0000-0000-0000-000000000001","nickname":"h7","join_mode":"approval","questions":["Q one?","Q two?"]}')->>'moim_id')::uuid);
select public.moim_join(pg_temp.id('b8'), pg_temp.id('M2'), '{"nickname":"n8","answers":["A one","A two"]}') \g /dev/null
select public.moim_update_info(pg_temp.id('b7'), pg_temp.id('M2'), '{"questions":["Q two?"]}', (select updated_at from public.moims where id = pg_temp.id('M2'))) \g /dev/null
select pg_temp.r('B10 저장된 답변', format('select answers::text from public.moim_join_requests where moim_id = %L', pg_temp.id('M2')));

-- B13 종료: 대기 멤버 행
select public.moim_close(pg_temp.id('b7'), pg_temp.id('M2'), 'Moim Two') \g /dev/null
select pg_temp.r('B13 종료 뒤 대기 멤버 상태', format('select status from public.moim_members where moim_id = %L and user_id = %L', pg_temp.id('M2'), pg_temp.id('b8')));

-- B8 탈퇴 정리 + 영구 삭제 (M1 모임장 b1 · 부모임장 b2(먼저), b3 / 혼자 모임 M3 모임장 b9)
insert into ids values ('M3', (public.moim_create(pg_temp.id('b9'), '{"name":"Moim Three","intro":"intro text ok 12","category_id":"11111111-0000-0000-0000-000000000001","nickname":"h9"}')->>'moim_id')::uuid);
select pg_temp.r('B8 정리 함수(b1)', format('select public.moim_account_cleanup(%L)::text', pg_temp.id('b1')));
select pg_temp.r('B8 M1 새 모임장', format('select (select nickname from public.moim_members where moim_id = %L and user_id = m.host_user_id) || '' members='' || m.member_count from public.moims m where id = %L', pg_temp.id('M1'), pg_temp.id('M1')));
select pg_temp.r('B8 정리 함수(b9 혼자)', format('select public.moim_account_cleanup(%L)::text', pg_temp.id('b9')));
select pg_temp.r('B8 M3 상태', format('select status from public.moims where id = %L', pg_temp.id('M3')));
delete from public.user_addresses where user_id in (pg_temp.id('b1'), pg_temp.id('b9')); -- 로컬 기반 스키마의 주소 FK(모임 무관) 제외
select pg_temp.r('B8 b1 프로필 영구 삭제', format('delete from public.profiles where id = %L returning ''deleted''', pg_temp.id('b1')));
select pg_temp.r('B8 b1 글 남음(작성자)', format('select count(*) || '' author='' || coalesce(max(author_id::text), ''NULL'') from public.moim_posts where moim_id = %L and body = ''host post''', pg_temp.id('M1')));
select pg_temp.r('B8 b9 프로필 영구 삭제', format('delete from public.profiles where id = %L returning ''deleted''', pg_temp.id('b9')));

-- M1(재감사) 작성자 계정 삭제 뒤, 모임 멤버가 아닌 b8 이 그 댓글 숨기기 시도
select pg_temp.r('M1 비멤버가 나간 멤버 댓글 숨기기', format('select public.moim_comment_remove(%L, (select id from public.moim_comments where body = ''host comment''))->>%L', pg_temp.id('b8'), 'ok'));
-- 활성 모임 모임장 필수: 정리 함수 없이 M1 새 모임장(b2) 계정 삭제 시도
delete from public.user_addresses where user_id = pg_temp.id('b2');
select pg_temp.r('제약 정리 없이 활성 모임 모임장 삭제', format('delete from public.profiles where id = %L returning ''deleted''', pg_temp.id('b2')));

create table if not exists public.audit_logs (id bigserial, actor_type text, actor_id uuid, target_type text, target_id text, action text, before_json jsonb, after_json jsonb); -- 로컬 기반 스키마에 없는 어드민 기록 표(모임 무관)
-- 재감사 2차 ①: 어드민이 삭제한 활성 모임의 모임장 계정 정리 → 복구 가능해야 함
insert into ids values ('M4', (public.moim_create(pg_temp.id('b5'), '{"name":"Moim Four","intro":"intro text ok 12","category_id":"11111111-0000-0000-0000-000000000001","nickname":"h5"}')->>'moim_id')::uuid);
insert into ids values ('M5', (public.moim_create(pg_temp.id('b6'), '{"name":"Moim Five","intro":"intro text ok 12","category_id":"11111111-0000-0000-0000-000000000001","nickname":"h6"}')->>'moim_id')::uuid);
select public.moim_join(pg_temp.id('b4'), pg_temp.id('M4'), '{"nickname":"n4"}') \g /dev/null
update public.moims set status = 'deleted', deleted_at = now() where id in (pg_temp.id('M4'), pg_temp.id('M5'));
select pg_temp.r('②-1 삭제된 모임(멤버 있음) 모임장 정리', format('select public.moim_account_cleanup(%L)::text', pg_temp.id('b5')));
select pg_temp.r('②-1 → 복구', format('select public.moim_admin_restore(%L, %L, %L)::text', pg_temp.id('b3'), pg_temp.id('M4'), 'restore test reason'));
select pg_temp.r('②-2 삭제된 모임(혼자) 모임장 정리', format('select public.moim_account_cleanup(%L)::text', pg_temp.id('b6')));
delete from public.user_addresses where user_id = pg_temp.id('b6');
select pg_temp.r('②-2 → 계정 삭제', format('delete from public.profiles where id = %L returning ''deleted''', pg_temp.id('b6')));
select pg_temp.r('②-2 → 복구', format('select public.moim_admin_restore(%L, %L, %L)::text', pg_temp.id('b3'), pg_temp.id('M5'), 'restore test reason'));
