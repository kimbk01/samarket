-- 모임 R1 로컬 임시 Postgres 17 검증 시나리오 (2026-11-28). 운영과 모임 함수 정의가 같은 로컬 DB 에서
-- 수정 전(20271128210000 제외)·후 같은 스크립트를 실행해 결과를 비교한다. 결과 기록: PR 본문.
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

-- local stub only (production has public.audit_logs; the local base schema does not)
create table if not exists public.audit_logs (id bigserial primary key, actor_type text, actor_id uuid, target_type text, target_id text, action text, before_json jsonb, after_json jsonb, created_at timestamptz default now());

insert into public.moim_categories (id, slug, label_ko, label_en, sort_order, is_active, is_restricted, allow_custom_topic)
values ('11111111-0000-0000-0000-000000000001', 'sports', 'sports', 'Sports', 1, true, false, false),
       ('11111111-0000-0000-0000-000000000002', 'adult', 'adult', 'Adult', 2, true, true, false) on conflict do nothing;
update public.moim_policies set max_co_hosts = 3, max_staff = 5, name_min_len = 2, intro_min_len = 10, banned_words = '{badword}', invite_resend_days = 7 where id = 1;
insert into public.profiles (id, nickname, phone_verified)
select ('cccccccc-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'c' || i, true from generate_series(1, 12) i;
insert into public.user_addresses (user_id, canonical_lgu_id, is_default_master, is_active)
select ('cccccccc-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, '1381300000', true, true from generate_series(1, 12) i;
insert into ids select 'c' || i, ('cccccccc-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 12) i;

-- M1 instant: c1 host, c2..c8 members
insert into ids values ('M1', (public.moim_create(pg_temp.id('c1'), '{"name":"R1 Moim","intro":"intro text long enough","category_id":"11111111-0000-0000-0000-000000000001","nickname":"h1"}')->>'moim_id')::uuid);
select public.moim_join(pg_temp.id('c' || i), pg_temp.id('M1'), jsonb_build_object('nickname', 'n' || i)) from generate_series(2, 8) i \g /dev/null

-- A-02 permission ceiling
select pg_temp.r('A-02 set decide_join to host', format('select public.moim_permissions_set(%L, %L, %L)->>%L', pg_temp.id('c1'), pg_temp.id('M1'), '{"decide_join":"host"}', 'ok'));
select pg_temp.r('A-02 set decide_join to co_host', format('select public.moim_permissions_set(%L, %L, %L)->>%L', pg_temp.id('c1'), pg_temp.id('M1'), '{"decide_join":"co_host"}', 'ok'));
select pg_temp.r('A-02 set send_invite to co_host', format('select public.moim_permissions_set(%L, %L, %L)->>%L', pg_temp.id('c1'), pg_temp.id('M1'), '{"send_invite":"co_host"}', 'ok'));
delete from public.moim_permissions where moim_id = pg_temp.id('M1');

-- A-03 ban -> unban -> join
select public.moim_member_remove(pg_temp.id('c1'), pg_temp.id('M1'), pg_temp.id('c3'), true, null) \g /dev/null
select public.moim_member_unban(pg_temp.id('c1'), pg_temp.id('M1'), pg_temp.id('c3')) \g /dev/null
select pg_temp.r('A-03 member status after unban', format('select status from public.moim_members where moim_id = %L and user_id = %L', pg_temp.id('M1'), pg_temp.id('c3')));

-- A-06 schedule room roles: c4 joins schedule as member, then promoted to co_host by admin
insert into ids values ('S1', (public.moim_schedule_create(pg_temp.id('c5'), pg_temp.id('M1'), jsonb_build_object('title', 'S one', 'starts_at', (now() + interval '2 days')::text))->>'schedule_id')::uuid);
select public.moim_schedule_join(pg_temp.id('c4'), pg_temp.id('S1'), null) \g /dev/null
select public.moim_admin_member_role(pg_temp.id('c12'), pg_temp.id('M1'), pg_temp.id('c4'), 'co_host', 'reason text ok') \g /dev/null
select pg_temp.r('A-06 admin promote -> schedule room role', format('select role from public.community_messenger_participants where room_id = (select room_id from public.moim_schedules where id = %L) and user_id = %L and left_at is null', pg_temp.id('S1'), pg_temp.id('c4')));
select public.moim_member_role_set(pg_temp.id('c1'), pg_temp.id('M1'), pg_temp.id('c6'), 'co_host') \g /dev/null
select public.moim_schedule_join(pg_temp.id('c6'), pg_temp.id('S1'), null) \g /dev/null
select pg_temp.r('A-06 co_host joins schedule later -> room role', format('select role from public.community_messenger_participants where room_id = (select room_id from public.moim_schedules where id = %L) and user_id = %L and left_at is null', pg_temp.id('S1'), pg_temp.id('c6')));

-- A-07 schedule host c5 leaves
select public.moim_leave(pg_temp.id('c5'), pg_temp.id('M1')) \g /dev/null
select pg_temp.r('A-07 schedule host after host left', format('select (host_user_id = %L)::text || '' status='' || status from public.moim_schedules where id = %L', pg_temp.id('c1'), pg_temp.id('S1')));
select pg_temp.r('A-07 room owner', format('select (owner_user_id = %L)::text from public.community_messenger_rooms where id = (select room_id from public.moim_schedules where id = %L)', pg_temp.id('c1'), pg_temp.id('S1')));

-- A-10 content rules
select pg_temp.r('A-10 post create banned', format('select public.moim_post_create(%L, %L, jsonb_build_object(''board_id'', (select id from public.moim_boards where moim_id = %L and kind = ''free''), ''body'', ''hello badword''))->>%L', pg_temp.id('c1'), pg_temp.id('M1'), pg_temp.id('M1'), 'ok'));
insert into ids values ('P1', (public.moim_post_create(pg_temp.id('c1'), pg_temp.id('M1'), jsonb_build_object('board_id', (select id from public.moim_boards where moim_id = pg_temp.id('M1') and kind = 'free'), 'body', 'clean body'))->>'post_id')::uuid);
select pg_temp.r('A-10 post update 11 images', format('select public.moim_post_update(%L, %L, %L::jsonb)->>%L', pg_temp.id('c1'), pg_temp.id('P1'), (select jsonb_build_object('images', jsonb_agg('https://x/' || i)) from generate_series(1, 11) i)::text, 'ok'));
select pg_temp.r('A-10 post update banned', format('select public.moim_post_update(%L, %L, %L::jsonb)->>%L', pg_temp.id('c1'), pg_temp.id('P1'), '{"body":"now badword"}', 'ok'));
select pg_temp.r('A-10 post update http url', format('select public.moim_post_update(%L, %L, %L::jsonb)->>%L', pg_temp.id('c1'), pg_temp.id('P1'), '{"images":["http://plain"]}', 'ok'));
insert into ids values ('S2', (public.moim_schedule_create(pg_temp.id('c1'), pg_temp.id('M1'), jsonb_build_object('title', 'S two', 'starts_at', (now() + interval '3 days')::text))->>'schedule_id')::uuid);
select pg_temp.r('A-10 schedule update 11 images', format('select public.moim_schedule_update(%L, %L, %L::jsonb)->>%L', pg_temp.id('c1'), pg_temp.id('S2'), (select jsonb_build_object('images', jsonb_agg('https://x/' || i)) from generate_series(1, 11) i)::text, 'ok'));
select pg_temp.r('A-10 schedule update images not array', format('select public.moim_schedule_update(%L, %L, %L::jsonb)->>%L', pg_temp.id('c1'), pg_temp.id('S2'), '{"images":"x"}', 'ok'));
select pg_temp.r('A-10 profile nickname banned', format('select public.moim_profile_update(%L, %L, %L::jsonb)->>%L', pg_temp.id('c7'), pg_temp.id('M1'), '{"nickname":"badword guy"}', 'ok'));
select pg_temp.r('A-10 join 60-char nickname', format('select public.moim_join(%L, %L, %L::jsonb)->>%L', pg_temp.id('c9'), pg_temp.id('M1'), json_build_object('nickname', repeat('x', 60))::text, 'ok'));
select pg_temp.r('A-10 update_info bad join_mode', format('select public.moim_update_info(%L, %L, %L::jsonb, (select updated_at from public.moims where id = %L))->>%L', pg_temp.id('c1'), pg_temp.id('M1'), '{"join_mode":"weird"}', pg_temp.id('M1'), 'ok'));
select pg_temp.r('A-10 admin set restricted category', format('select public.moim_admin_update_info(%L, %L, %L::jsonb, (select updated_at from public.moims where id = %L), %L)->>%L', pg_temp.id('c12'), pg_temp.id('M1'), '{"category_id":"11111111-0000-0000-0000-000000000002"}', pg_temp.id('M1'), 'reason text ok', 'ok'));

-- A-11 cancelled schedule room archive
update public.moim_policies set schedule_room_archive_days = 1 where id = 1;
select public.moim_schedule_cancel(pg_temp.id('c1'), pg_temp.id('S2')) \g /dev/null
update public.moim_schedules set finished_at = now() - interval '2 days' where id = pg_temp.id('S2');
select public.moim_schedule_rooms_archive_due(100) \g /dev/null
select pg_temp.r('A-11 cancelled room archived', format('select (room_archived_at is not null)::text from public.moim_schedules where id = %L', pg_temp.id('S2')));

-- A-12 blocked moim: finish -> review recipients, attendance
insert into ids values ('S3', (public.moim_schedule_create(pg_temp.id('c1'), pg_temp.id('M1'), jsonb_build_object('title', 'S three', 'starts_at', (now() + interval '1 hour')::text))->>'schedule_id')::uuid);
update public.moim_schedules set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where id = pg_temp.id('S3');
update public.moims set platform_state = 'blocked' where id = pg_temp.id('M1');
select pg_temp.r('A-12 attendance in blocked moim', format('select public.moim_schedule_attendance(%L, %L, %L, %L)->>%L', pg_temp.id('c1'), pg_temp.id('S3'), pg_temp.id('c1'), 'present', 'ok'));
select pg_temp.r('A-12 finish review recipients in blocked moim', 'select (public.moim_schedules_finish_due(100)->''done''->0->''user_ids'')::text');
update public.moims set platform_state = 'normal' where id = pg_temp.id('M1');

-- A-13 events
insert into ids values ('S4', (public.moim_schedule_create(pg_temp.id('c1'), pg_temp.id('M1'), jsonb_build_object('title', 'S four', 'starts_at', (now() + interval '4 days')::text))->>'schedule_id')::uuid);
select public.moim_schedule_set_closed(pg_temp.id('c1'), pg_temp.id('S4'), true) \g /dev/null
select pg_temp.r('A-13 schedule_closed logged', format('select count(*)::text from public.moim_events where moim_id = %L and type = %L', pg_temp.id('M1'), 'schedule_closed'));

-- A-17 admin stale role
select pg_temp.r('A-17 admin role with stale expected', format('select public.moim_admin_member_role(%L, %L, %L, %L, %L, %L)->>%L', pg_temp.id('c12'), pg_temp.id('M1'), pg_temp.id('c7'), 'staff', 'reason text ok', 'co_host', 'ok'));
select pg_temp.r('A-17 duplicate warn sanction', format('select (public.moim_admin_sanction_apply(%L, %L, %L, %L, %L, null)->>%L) || '','' || (public.moim_admin_sanction_apply(%L, %L, %L, %L, %L, null)->>%L)', pg_temp.id('c12'), pg_temp.id('M1'), 'warn', 'commercial', 'reason text ok', 'ok', pg_temp.id('c12'), pg_temp.id('M1'), 'warn', 'commercial', 'reason text ok', 'ok'));

-- A-18 invite link usage counted on approval; inviter kept
insert into ids values ('M2', (public.moim_create(pg_temp.id('c10'), '{"name":"R1 Approval","intro":"intro text long enough","category_id":"11111111-0000-0000-0000-000000000001","nickname":"h10","join_mode":"approval"}')->>'moim_id')::uuid);
insert into ids values ('L1', (public.moim_invite_link_create(pg_temp.id('c10'), pg_temp.id('M2'), null)->>'invite_id')::uuid);
select public.moim_join(pg_temp.id('c11'), pg_temp.id('M2'), jsonb_build_object('nickname', 'n11', 'invite_token', (select token from public.moim_invites where moim_id = pg_temp.id('M2') limit 1))) \g /dev/null
select pg_temp.r('A-18 link usage after request (before approval)', format('select usage_count::text from public.moim_invites where moim_id = %L', pg_temp.id('M2')));
select public.moim_join_decide(pg_temp.id('c10'), (select id from public.moim_join_requests where moim_id = pg_temp.id('M2') and status = 'pending' limit 1), false, 'no') \g /dev/null
select pg_temp.r('A-18 link usage after rejection', format('select usage_count::text from public.moim_invites where moim_id = %L', pg_temp.id('M2')));

-- A-04 admin delete -> restore -> pending applicant can cancel / reapply
select public.moim_join(pg_temp.id('c9'), pg_temp.id('M2'), '{"nickname":"n9"}') \g /dev/null
select public.moim_admin_delete(pg_temp.id('c12'), pg_temp.id('M2'), 'reason text ok') \g /dev/null
select public.moim_admin_restore(pg_temp.id('c12'), pg_temp.id('M2'), 'reason text ok') \g /dev/null
select pg_temp.r('A-04 applicant member status after delete+restore', format('select status from public.moim_members where moim_id = %L and user_id = %L', pg_temp.id('M2'), pg_temp.id('c9')));
select pg_temp.r('A-04 reapply', format('select public.moim_join(%L, %L, %L::jsonb)->>%L', pg_temp.id('c9'), pg_temp.id('M2'), '{"nickname":"n9"}', 'status'));

-- A-05 host closes M2 then withdraws
select public.moim_close(pg_temp.id('c10'), pg_temp.id('M2'), 'R1 Approval') \g /dev/null
select public.moim_account_cleanup(pg_temp.id('c10')) \g /dev/null
select pg_temp.r('A-05 closed moim host pointer', format('select coalesce(host_user_id::text, ''null'') from public.moims where id = %L', pg_temp.id('M2')));
select pg_temp.r('A-05 host row', format('select role || ''/'' || status from public.moim_members where moim_id = %L and user_id = %L', pg_temp.id('M2'), pg_temp.id('c10')));

-- A-01 transfer request survives kick + rejoin (last: before-fix it changes the host)
update public.moim_sanctions set revoked_at = now() where moim_id = pg_temp.id('M1');
update public.moims set platform_state = 'normal' where id = pg_temp.id('M1');
select public.moim_host_transfer_request(pg_temp.id('c1'), pg_temp.id('M1'), pg_temp.id('c2')) \g /dev/null
select public.moim_member_remove(pg_temp.id('c1'), pg_temp.id('M1'), pg_temp.id('c2'), false, null) \g /dev/null
select pg_temp.r('A-01 kick -> open transfer requests', format('select count(*)::text from public.moim_host_transfers where moim_id = %L and status = %L', pg_temp.id('M1'), 'requested'));
select public.moim_join(pg_temp.id('c2'), pg_temp.id('M1'), '{"nickname":"n2"}') \g /dev/null
select pg_temp.r('A-01 rejoined c2 accepts old request', format('select public.moim_host_transfer_respond(%L, (select id from public.moim_host_transfers where moim_id = %L and to_user_id = %L order by created_at desc limit 1), true)->>%L', pg_temp.id('c2'), pg_temp.id('M1'), pg_temp.id('c2'), 'accepted'));
select pg_temp.r('A-01 host after', format('select (host_user_id = %L)::text from public.moims where id = %L', pg_temp.id('c1'), pg_temp.id('M1')));


-- 재감사 H-1: 모임장이 남이 호스트인 일정에 참여 · 그 상태에서 위임 · 모임장 계정 정리 (일정 방 방장은 1명)
insert into ids values ('M3', (public.moim_create(pg_temp.id('c11'), '{"name":"R1 Hone","intro":"intro text long enough","category_id":"11111111-0000-0000-0000-000000000001","nickname":"h11"}')->>'moim_id')::uuid);
select public.moim_join(pg_temp.id('c' || i), pg_temp.id('M3'), jsonb_build_object('nickname', 'm' || i)) from generate_series(7, 9) i \g /dev/null
insert into ids values ('S9', (public.moim_schedule_create(pg_temp.id('c7'), pg_temp.id('M3'), jsonb_build_object('title', 'S nine', 'starts_at', (now() + interval '2 days')::text))->>'schedule_id')::uuid);
select pg_temp.r('H-1 moim host joins member schedule', format('select public.moim_schedule_join(%L, %L, null)->>%L', pg_temp.id('c11'), pg_temp.id('S9'), 'status'));
select public.moim_schedule_join(pg_temp.id('c8'), pg_temp.id('S9'), null) \g /dev/null
select pg_temp.r('H-1 admin assigns host to c8 (in c7 schedule)', format('select public.moim_admin_assign_host(%L, %L, %L, %L)->>%L', pg_temp.id('c12'), pg_temp.id('M3'), pg_temp.id('c8'), 'reason text ok', 'ok'));
select pg_temp.r('H-1 owners in schedule room', format('select count(*)::text from public.community_messenger_participants where room_id = (select room_id from public.moim_schedules where id = %L) and left_at is null and role = %L', pg_temp.id('S9'), 'owner'));
insert into ids values ('S10', (public.moim_schedule_create(pg_temp.id('c8'), pg_temp.id('M3'), jsonb_build_object('title', 'S ten', 'starts_at', (now() + interval '3 days')::text))->>'schedule_id')::uuid);
select public.moim_schedule_join(pg_temp.id('c9'), pg_temp.id('S10'), null) \g /dev/null
select pg_temp.r('H-1 host account cleanup with participant', format('select (public.moim_account_cleanup(%L)->>%L)', pg_temp.id('c8'), 'ok'));
