-- 모임 R2 로컬 임시 Postgres 17 검증 시나리오 (2026-11-28). R1 반영 DB 에서 R2(20271128230000) 적용 전·후 같은 스크립트를 실행해 비교한다.
-- 결과 기록: PR 본문.
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
alter table public.community_messenger_messages add column if not exists sender_id uuid;

insert into public.moim_categories (id, slug, label_ko, label_en, sort_order, is_active, is_restricted, allow_custom_topic)
values ('11111111-0000-0000-0000-000000000001', 'sports', 'sports', 'Sports', 1, true, false, false),
       ('11111111-0000-0000-0000-000000000002', 'adult', 'adult', 'Adult', 2, true, true, false) on conflict do nothing;
update public.moim_policies set max_co_hosts = 3, max_staff = 5, name_min_len = 2, intro_min_len = 10, banned_words = '{badword}', invite_resend_days = 7 where id = 1;
insert into public.profiles (id, nickname, phone_verified)
select ('dddddddd-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'd' || i, true from generate_series(1, 12) i;
insert into public.user_addresses (user_id, canonical_lgu_id, is_default_master, is_active)
select ('dddddddd-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, '1381300000', true, true from generate_series(1, 12) i;
insert into ids select 'd' || i, ('dddddddd-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 12) i;

-- M1 instant: d1 host, d2..d8 members
insert into ids values ('M1', (public.moim_create(pg_temp.id('d1'), '{"name":"R2 Moim","intro":"intro text long enough","category_id":"11111111-0000-0000-0000-000000000001","nickname":"h1"}')->>'moim_id')::uuid);
select public.moim_join(pg_temp.id('d' || i), pg_temp.id('M1'), jsonb_build_object('nickname', 'n' || i)) from generate_series(2, 8) i \g /dev/null

-- B-01 comment author: member -> id, left -> null
insert into ids values ('P1', (public.moim_post_create(pg_temp.id('d2'), pg_temp.id('M1'), jsonb_build_object('board_id', (select id from public.moim_boards where moim_id = pg_temp.id('M1') and kind = 'free'), 'body', 'post body'))->>'post_id')::uuid);
select pg_temp.r('B-01 author is member', format('select (public.moim_comment_create(%L, %L, %L)->>%L = %L)::text', pg_temp.id('d3'), pg_temp.id('P1'), 'c one', 'post_author_id', pg_temp.id('d2')));
select public.moim_leave(pg_temp.id('d2'), pg_temp.id('M1')) \g /dev/null
select pg_temp.r('B-01 author left', format('select coalesce(public.moim_comment_create(%L, %L, %L)->>%L, %L)', pg_temp.id('d3'), pg_temp.id('P1'), 'c two', 'post_author_id', 'null'));

-- B-02 was_active
select pg_temp.r('B-02 kick active', format('select public.moim_member_remove(%L, %L, %L, false, null)->>%L', pg_temp.id('d1'), pg_temp.id('M1'), pg_temp.id('d8'), 'was_active'));
select pg_temp.r('B-02 ban non-member', format('select public.moim_member_remove(%L, %L, %L, true, null)->>%L', pg_temp.id('d1'), pg_temp.id('M1'), pg_temp.id('d11'), 'was_active'));

-- B-03 pending join nickname (M2 approval)
insert into ids values ('M2', (public.moim_create(pg_temp.id('d9'), '{"name":"R2 Approval","intro":"intro text long enough","category_id":"11111111-0000-0000-0000-000000000001","nickname":"h9","join_mode":"approval"}')->>'moim_id')::uuid);
select pg_temp.r('B-03 pending nickname (profile fallback)', format('select public.moim_join(%L, %L, %L::jsonb)->>%L', pg_temp.id('d10'), pg_temp.id('M2'), '{}', 'nickname'));

-- B-04 schedule cancel recipients (approval schedule: d3 confirmed, d4 requested)
insert into ids values ('S1', (public.moim_schedule_create(pg_temp.id('d1'), pg_temp.id('M1'), jsonb_build_object('title', 'S one', 'starts_at', (now() + interval '3 days')::text, 'join_mode', 'approval'))->>'schedule_id')::uuid);
select public.moim_schedule_join(pg_temp.id('d3'), pg_temp.id('S1'), null) \g /dev/null
select public.moim_schedule_decide(pg_temp.id('d1'), pg_temp.id('S1'), pg_temp.id('d3'), true) \g /dev/null
select public.moim_schedule_join(pg_temp.id('d4'), pg_temp.id('S1'), null) \g /dev/null
select pg_temp.r('B-04 cancel notify', format('select (select string_agg(x, '','' order by x) from jsonb_array_elements_text(public.moim_schedule_cancel(%L, %L)->%L) x)', pg_temp.id('d1'), pg_temp.id('S1'), 'notify_user_ids'));

-- B-05 admin schedule cancel recipients
insert into ids values ('S2', (public.moim_schedule_create(pg_temp.id('d1'), pg_temp.id('M1'), jsonb_build_object('title', 'S two', 'starts_at', (now() + interval '3 days')::text, 'join_mode', 'approval'))->>'schedule_id')::uuid);
select public.moim_schedule_join(pg_temp.id('d3'), pg_temp.id('S2'), null) \g /dev/null
select public.moim_schedule_decide(pg_temp.id('d1'), pg_temp.id('S2'), pg_temp.id('d3'), true) \g /dev/null
select public.moim_schedule_join(pg_temp.id('d4'), pg_temp.id('S2'), null) \g /dev/null
select pg_temp.r('B-05 admin cancel notify count', format('select jsonb_array_length(public.moim_admin_content(%L, %L, %L, %L, %L)->%L)::text', pg_temp.id('d12'), 'schedule', pg_temp.id('S2'), 'cancel', 'reason text ok', 'notify_user_ids'));

-- B-06 report hide schedule recipients
insert into ids values ('S3', (public.moim_schedule_create(pg_temp.id('d1'), pg_temp.id('M1'), jsonb_build_object('title', 'S three', 'starts_at', (now() + interval '3 days')::text, 'join_mode', 'approval'))->>'schedule_id')::uuid);
select public.moim_schedule_join(pg_temp.id('d3'), pg_temp.id('S3'), null) \g /dev/null
select public.moim_schedule_decide(pg_temp.id('d1'), pg_temp.id('S3'), pg_temp.id('d3'), true) \g /dev/null
select public.moim_schedule_join(pg_temp.id('d4'), pg_temp.id('S3'), null) \g /dev/null
insert into ids values ('R1', (public.moim_report_create(pg_temp.id('d5'), pg_temp.id('M1'), jsonb_build_object('target_type', 'schedule', 'target_id', pg_temp.id('S3'), 'reason_code', 'commercial'))->>'report_id')::uuid);
select pg_temp.r('B-06 report cancel notify count', format('select jsonb_array_length(public.moim_admin_report_decide(%L, %L, %L, %L, %L, %L::jsonb)->%L)::text', pg_temp.id('d12'), pg_temp.id('R1'), 'received', 'actioned', 'reason text ok', '{"content_hide":true}', 'schedule_notify_user_ids'));

-- B-13 admin content post hide -> author_id
insert into ids values ('P2', (public.moim_post_create(pg_temp.id('d5'), pg_temp.id('M1'), jsonb_build_object('board_id', (select id from public.moim_boards where moim_id = pg_temp.id('M1') and kind = 'free'), 'body', 'post two'))->>'post_id')::uuid);
select pg_temp.r('B-13 admin hide author', format('select (public.moim_admin_content(%L, %L, %L, %L, %L)->>%L = %L)::text', pg_temp.id('d12'), 'post', pg_temp.id('P2'), 'hide', 'reason text ok', 'author_id', pg_temp.id('d5')));

-- B-15 (re-audit F5) report hide on already hidden post -> changed=false; on active post -> true
insert into ids values ('R2', (public.moim_report_create(pg_temp.id('d6'), pg_temp.id('M1'), jsonb_build_object('target_type', 'post', 'target_id', pg_temp.id('P2'), 'reason_code', 'commercial'))->>'report_id')::uuid);
select pg_temp.r('B-15 hide already hidden', format('select public.moim_admin_report_decide(%L, %L, %L, %L, %L, %L::jsonb)->%L->0->>%L', pg_temp.id('d12'), pg_temp.id('R2'), 'received', 'actioned', 'reason text ok', '{"content_hide":true}', 'actions', 'changed'));
insert into ids values ('P3', (public.moim_post_create(pg_temp.id('d5'), pg_temp.id('M1'), jsonb_build_object('board_id', (select id from public.moim_boards where moim_id = pg_temp.id('M1') and kind = 'free'), 'body', 'post three'))->>'post_id')::uuid);
insert into ids values ('R3', (public.moim_report_create(pg_temp.id('d6'), pg_temp.id('M1'), jsonb_build_object('target_type', 'post', 'target_id', pg_temp.id('P3'), 'reason_code', 'commercial'))->>'report_id')::uuid);
select pg_temp.r('B-15 hide active post', format('select public.moim_admin_report_decide(%L, %L, %L, %L, %L, %L::jsonb)->%L->0->>%L', pg_temp.id('d12'), pg_temp.id('R3'), 'received', 'actioned', 'reason text ok', '{"content_hide":true}', 'actions', 'changed'));

-- B-10 sanction revoke
insert into ids values ('X1', (public.moim_admin_sanction_apply(pg_temp.id('d12'), pg_temp.id('M1'), 'unlist', 'commercial', 'reason text ok', null)->>'sanction_id')::uuid);
select pg_temp.r('B-10 revoke unlist', format('select (r->>%L) || %L || jsonb_array_length(r->%L)::text from (select public.moim_admin_sanction_revoke(%L, %L, %L) r) t', 'level', ' n=', 'notify_user_ids', pg_temp.id('d12'), pg_temp.id('X1'), 'reason text ok'));
insert into ids values ('X2', (public.moim_admin_sanction_apply(pg_temp.id('d12'), pg_temp.id('M1'), 'block', 'commercial', 'reason text ok', null)->>'sanction_id')::uuid);
select pg_temp.r('B-10 revoke block', format('select (r->>%L) || %L || jsonb_array_length(r->%L)::text from (select public.moim_admin_sanction_revoke(%L, %L, %L) r) t', 'level', ' n=', 'notify_user_ids', pg_temp.id('d12'), pg_temp.id('X2'), 'reason text ok'));

-- B-11 reminders: chosen until acked, re-chosen with new time
insert into ids values ('S4', (public.moim_schedule_create(pg_temp.id('d1'), pg_temp.id('M1'), jsonb_build_object('title', 'S four', 'starts_at', (now() + interval '10 hours')::text))->>'schedule_id')::uuid);
select pg_temp.r('B-11 claim #1 has S4', format('select (public.moim_schedules_claim_reminders(%L)->%L) @> jsonb_build_array(jsonb_build_object(%L, %L))', '24h', 'reminders', 'schedule_id', pg_temp.id('S4')));
select pg_temp.r('B-11 claim #2 (no ack) has S4', format('select (public.moim_schedules_claim_reminders(%L)->%L) @> jsonb_build_array(jsonb_build_object(%L, %L))', '24h', 'reminders', 'schedule_id', pg_temp.id('S4')));
select pg_temp.r('B-11 ack with wrong time', format('select public.moim_schedules_ack_reminders(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, %L)))->>%L', '24h', 'schedule_id', pg_temp.id('S4'), 'starts_at', '2000-01-01T00:00:00Z', 'acked'));
select pg_temp.r('B-11 ack', format('select public.moim_schedules_ack_reminders(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, (select starts_at from public.moim_schedules where id = %L))))->>%L', '24h', 'schedule_id', pg_temp.id('S4'), 'starts_at', pg_temp.id('S4'), 'acked'));
select pg_temp.r('B-11 claim #3 after ack has S4', format('select (public.moim_schedules_claim_reminders(%L)->%L) @> jsonb_build_array(jsonb_build_object(%L, %L))', '24h', 'reminders', 'schedule_id', pg_temp.id('S4')));
select public.moim_schedule_update(pg_temp.id('d1'), pg_temp.id('S4'), jsonb_build_object('starts_at', (now() + interval '12 hours')::text)) \g /dev/null
select pg_temp.r('B-11 claim after time change has S4', format('select (public.moim_schedules_claim_reminders(%L)->%L) @> jsonb_build_array(jsonb_build_object(%L, %L))', '24h', 'reminders', 'schedule_id', pg_temp.id('S4')));

-- B-12 reviews pending: active confirmed only, blocked moim excluded, ack
insert into ids values ('S5', (public.moim_schedule_create(pg_temp.id('d1'), pg_temp.id('M1'), jsonb_build_object('title', 'S five', 'starts_at', (now() + interval '3 days')::text))->>'schedule_id')::uuid);
select public.moim_schedule_join(pg_temp.id('d6'), pg_temp.id('S5'), null) \g /dev/null
select public.moim_schedule_join(pg_temp.id('d7'), pg_temp.id('S5'), null) \g /dev/null
update public.moim_schedules set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = pg_temp.id('S5');
select public.moim_leave(pg_temp.id('d7'), pg_temp.id('M1')) \g /dev/null
select public.moim_schedules_finish_due(100) \g /dev/null
select pg_temp.r('B-12 pending users S5', format('select (select string_agg(u, '','' order by u) from jsonb_array_elements(public.moim_schedules_reviews_pending(100)->%L) x, jsonb_array_elements_text(x->%L) u where x->>%L = %L)', 'reviews', 'user_ids', 'schedule_id', pg_temp.id('S5')));
select pg_temp.r('B-12 ack', format('select public.moim_schedules_ack_reviews(array[%L]::uuid[])->>%L', pg_temp.id('S5'), 'acked'));
select pg_temp.r('B-12 pending after ack', format('select jsonb_array_length(public.moim_schedules_reviews_pending(100)->%L)::text', 'reviews'));
select pg_temp.r('B-14 cron tick has reviews', $q$select (public.moim_cron_tick() ? 'reviews')::text$q$);

-- B-07 close returns cancelled schedules (S6 with d3 confirmed)
insert into ids values ('S6', (public.moim_schedule_create(pg_temp.id('d9'), pg_temp.id('M2'), jsonb_build_object('title', 'S six', 'starts_at', (now() + interval '3 days')::text))->>'schedule_id')::uuid);
select public.moim_join_decide(pg_temp.id('d9'), (select id from public.moim_join_requests where moim_id = pg_temp.id('M2') and user_id = pg_temp.id('d10')), true, null) \g /dev/null
select public.moim_schedule_join(pg_temp.id('d10'), pg_temp.id('S6'), null) \g /dev/null
select pg_temp.r('B-07 close', format('select jsonb_array_length(r->%L)::text || %L || jsonb_array_length(r->%L->0->%L)::text || %L || jsonb_array_length(r->%L)::text from (select public.moim_close(%L, %L, %L) r) t', 'cancelled_schedules', ' users=', 'cancelled_schedules', 'user_ids', ' members=', 'notify_user_ids', pg_temp.id('d9'), pg_temp.id('M2'), 'R2 Approval'));

-- B-08 admin delete + B-09 restore (M1)
insert into ids values ('S7', (public.moim_schedule_create(pg_temp.id('d1'), pg_temp.id('M1'), jsonb_build_object('title', 'S seven', 'starts_at', (now() + interval '3 days')::text))->>'schedule_id')::uuid);
select public.moim_schedule_join(pg_temp.id('d3'), pg_temp.id('S7'), null) \g /dev/null
select pg_temp.r('B-08 admin delete', format('select (r->>%L) || %L || jsonb_array_length(r->%L)::text || %L || jsonb_array_length(r->%L)::text from (select public.moim_admin_delete(%L, %L, %L) r) t', 'name', ' schedules=', 'cancelled_schedules', ' members=', 'notify_user_ids', pg_temp.id('d12'), pg_temp.id('M1'), 'reason text ok'));
select pg_temp.r('B-09 admin restore', format('select (r->>%L) || %L || jsonb_array_length(r->%L)::text from (select public.moim_admin_restore(%L, %L, %L) r) t', 'name', ' members=', 'notify_user_ids', pg_temp.id('d12'), pg_temp.id('M1'), 'reason text ok'));
