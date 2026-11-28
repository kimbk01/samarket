-- Moim R5 local PG17 verify scenarios (2026-11-28). INTEGRATED.md A-9 (S-01..S-54).
-- Run on a local DB rebuilt from the m2 base + local stubs + moim migrations, once without R5 (before) and once with R5 (after).
-- Never on production or a test project. The last block (S-37) re-applies the R5 migration file to test the repairs twice.
-- Run from the repository root: psql -X -f docs/audit/moim-r5-local-verify-scenarios-2026-11-28.sql
\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
set lc_messages = 'C';
create temp table ids(k text primary key, v uuid);
create or replace function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
create or replace function pg_temp.put(k text, v uuid) returns uuid language sql as $$
  insert into ids values ($1, $2) on conflict (k) do update set v = excluded.v returning v $$;
create or replace function pg_temp.r(label text, q text) returns text language plpgsql as $$
declare v text;
begin
  begin execute q into v; exception when others then return label || ' => ERROR ' || sqlerrm; end;
  return label || ' => ' || coalesce(v, 'NULL');
end $$;
-- run a statement for its side effect only (errors are printed, the run continues)
create or replace function pg_temp.x(label text, q text) returns text language plpgsql as $$
begin
  begin execute q; exception when others then return label || ' => SETUP ERROR ' || sqlerrm; end;
  return null;
end $$;

-- local stubs only (production has these; the local base schema does not)
create table if not exists public.audit_logs (id bigserial primary key, actor_type text, actor_id uuid, target_type text, target_id text, action text, before_json jsonb, after_json jsonb, created_at timestamptz default now());
alter table public.community_messenger_messages add column if not exists sender_id uuid;
set request.jwt.claim.role = 'service_role';

insert into public.moim_categories (id, slug, label_ko, label_en, sort_order, is_active, is_restricted, allow_custom_topic)
values ('11111111-0000-0000-0000-000000000001', 'sports', 'sports', 'Sports', 1, true, false, false) on conflict do nothing;
update public.moim_policies set max_co_hosts = 3, max_staff = 5, name_min_len = 2, intro_min_len = 10, banned_words = '{badword}',
  invite_resend_days = 7, max_custom_boards = 2, max_moims_per_user = null, closed_retention_days = 30 where id = 1;
insert into public.profiles (id, nickname, phone_verified)
select ('eeeeeeee-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'e' || i, true from generate_series(1, 20) i;
insert into public.user_addresses (user_id, canonical_lgu_id, is_default_master, is_active)
select ('eeeeeeee-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, '1381300000', true, true from generate_series(1, 20) i;
insert into ids select 'e' || i, ('eeeeeeee-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 20) i;

create or replace function pg_temp.mk(k text, host text, nm text, mode text default 'instant') returns uuid language sql as $$
  select pg_temp.put(k, (public.moim_create(pg_temp.id(host), jsonb_build_object('name', nm, 'intro', 'intro text long enough',
    'category_id', '11111111-0000-0000-0000-000000000001', 'nickname', host || 'h', 'join_mode', mode))->>'moim_id')::uuid) $$;
create or replace function pg_temp.jn(u text, m text, bio text default null) returns jsonb language sql as $$
  select public.moim_join(pg_temp.id(u), pg_temp.id(m), jsonb_build_object('nickname', u || 'n', 'bio', bio)) $$;
create or replace function pg_temp.board(m text, kind text default 'free') returns uuid language sql as $$
  select id from public.moim_boards where moim_id = pg_temp.id(m) and kind = $2 order by sort_order limit 1 $$;
create or replace function pg_temp.post(k text, u text, m text) returns uuid language sql as $$
  select pg_temp.put(k, (public.moim_post_create(pg_temp.id(u), pg_temp.id(m), jsonb_build_object('board_id', pg_temp.board(m), 'title', 't', 'body', 'body text', 'visibility', 'members'))->>'post_id')::uuid) $$;
create or replace function pg_temp.rep(k text, u text, m text, ttype text, tid uuid) returns uuid language sql as $$
  select pg_temp.put(k, (public.moim_report_create(pg_temp.id(u), pg_temp.id(m), jsonb_build_object('target_type', ttype, 'target_id', tid, 'reason_code', 'commercial'))->>'report_id')::uuid) $$;
create or replace function pg_temp.ts(m text) returns timestamptz language sql as $$ select updated_at from public.moims where id = pg_temp.id(m) $$;

select pg_temp.mk('M1', 'e1', 'R5 Moim One') \g /dev/null
select pg_temp.mk('M2', 'e7', 'R5 Moim Two') \g /dev/null
select pg_temp.jn('e' || i, 'M1') from generate_series(2, 5) i \g /dev/null
select pg_temp.jn('e' || i, 'M2') from generate_series(2, 4) i \g /dev/null
select public.moim_member_role_set(pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.id('e2'), 'co_host') \g /dev/null

-- S-01 E1 close same target only in the same moim
select pg_temp.rep('R01a', 'e3', 'M1', 'member', pg_temp.id('e2')) \g /dev/null
select pg_temp.rep('R01b', 'e4', 'M2', 'member', pg_temp.id('e2')) \g /dev/null
select pg_temp.r('S-01 decide M1 close_same_target: closed count', format($q$select jsonb_array_length(public.moim_admin_report_decide(%L, %L, 'received', 'dismissed', 'reason text ok', '{"close_same_target":true}')->'closed_report_ids')::text$q$, pg_temp.id('e6'), pg_temp.id('R01a')));
select pg_temp.r('S-01 M2 report status', format('select status from public.moim_reports where id = %L', pg_temp.id('R01b')));
-- S-02 / S-03 duplicate is per moim
select pg_temp.rep('R02a', 'e5', 'M1', 'member', pg_temp.id('e2')) \g /dev/null
select pg_temp.r('S-02 same reporter same target other moim', format($q$select public.moim_report_create(%L, %L, jsonb_build_object('target_type','member','target_id',%L::uuid,'reason_code','commercial'))->>'ok'$q$, pg_temp.id('e5'), pg_temp.id('M2'), pg_temp.id('e2')));
select pg_temp.r('S-03 same reporter same target same moim', format($q$select public.moim_report_create(%L, %L, jsonb_build_object('target_type','member','target_id',%L::uuid,'reason_code','commercial'))->>'ok'$q$, pg_temp.id('e5'), pg_temp.id('M1'), pg_temp.id('e2')));

-- S-04..S-06 E3 ban source
select pg_temp.r('S-04 admin bans e8', format($q$select public.moim_admin_member_remove(%L, %L, %L, true, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M1'), pg_temp.id('e8')));
select pg_temp.r('S-04 co_host lifts admin ban', format('select public.moim_member_unban(%L, %L, %L)->>%L', pg_temp.id('e2'), pg_temp.id('M1'), pg_temp.id('e8'), 'ok'));
select pg_temp.x('S-05 setup staff ban e9', format($q$select public.moim_member_remove(%L, %L, %L, true, 'staff reason')$q$, pg_temp.id('e2'), pg_temp.id('M1'), pg_temp.id('e9')));
select pg_temp.x('S-05 setup admin ban e9', format($q$select public.moim_admin_member_remove(%L, %L, %L, true, 'admin reason')$q$, pg_temp.id('e6'), pg_temp.id('M1'), pg_temp.id('e9')));
select pg_temp.r('S-05 co_host lifts taken-over ban', format('select public.moim_member_unban(%L, %L, %L)->>%L', pg_temp.id('e2'), pg_temp.id('M1'), pg_temp.id('e9'), 'ok'));
select pg_temp.r('S-05 ban row source', format('select source || %L || reason from public.moim_bans where moim_id = %L and user_id = %L and released_at is null', ' / ', pg_temp.id('M1'), pg_temp.id('e9')));
select pg_temp.x('S-06 setup staff ban e10', format($q$select public.moim_member_remove(%L, %L, %L, true, 'staff reason')$q$, pg_temp.id('e2'), pg_temp.id('M1'), pg_temp.id('e10')));
select pg_temp.r('S-06 staff lifts staff ban', format('select public.moim_member_unban(%L, %L, %L)->>%L', pg_temp.id('e2'), pg_temp.id('M1'), pg_temp.id('e10'), 'ok'));

-- S-07 E4 decide returns receiver state keys (non-member reporter is not in reporter_member_ids)
select pg_temp.rep('R07a', 'e3', 'M1', 'moim', pg_temp.id('M1')) \g /dev/null
select pg_temp.rep('R07b', 'e11', 'M1', 'moim', pg_temp.id('M1')) \g /dev/null
select pg_temp.r('S-07 status,retention,member reporter,non-member reporter', format($q$select coalesce(x->>'moim_status','<none>') || ',' || coalesce(x->>'retention_ended_at','null') || ',' || coalesce((x->'reporter_member_ids') ? %L, false)::text || ',' || coalesce((x->'reporter_member_ids') ? %L, false)::text from (select public.moim_admin_report_decide(%L, %L, 'received', 'dismissed', 'reason text ok', '{"close_same_target":true}') x) s$q$, pg_temp.id('e3'), pg_temp.id('e11'), pg_temp.id('e6'), pg_temp.id('R07a')));

-- S-08..S-11 E8 author deletes hidden content
select pg_temp.post('P08', 'e3', 'M1') \g /dev/null
select public.moim_post_remove(pg_temp.id('e2'), pg_temp.id('P08'), 'staff hide') \g /dev/null
select pg_temp.r('S-08 author deletes hidden post', format('select public.moim_post_remove(%L, %L, null)->>%L', pg_temp.id('e3'), pg_temp.id('P08'), 'result'));
select pg_temp.post('P09', 'e3', 'M1') \g /dev/null
select pg_temp.put('C09', (public.moim_comment_create(pg_temp.id('e4'), pg_temp.id('P09'), 'a comment')->>'comment_id')::uuid) \g /dev/null
select public.moim_comment_remove(pg_temp.id('e2'), pg_temp.id('C09')) \g /dev/null
select pg_temp.r('S-09 author deletes hidden comment', format('select public.moim_comment_remove(%L, %L)->>%L', pg_temp.id('e4'), pg_temp.id('C09'), 'ok'));
select pg_temp.r('S-09 comment_count (no double subtract)', format('select comment_count::text from public.moim_posts where id = %L', pg_temp.id('P09')));
select public.moim_album_add(pg_temp.id('e5'), pg_temp.id('M1'), '{"urls":["https://x/a10.jpg"]}') \g /dev/null
select pg_temp.put('A10', (select id from public.moim_album_items where uploader_id = pg_temp.id('e5') and moim_id = pg_temp.id('M1') order by created_at desc limit 1)) \g /dev/null
select public.moim_album_remove(pg_temp.id('e2'), pg_temp.id('A10')) \g /dev/null
select public.moim_leave(pg_temp.id('e5'), pg_temp.id('M1')) \g /dev/null
select pg_temp.r('S-10 left uploader deletes hidden photo', format('select public.moim_album_remove(%L, %L)->>%L', pg_temp.id('e5'), pg_temp.id('A10'), 'result'));
select pg_temp.r('S-10 album_deleted log rows', format($q$select count(*)::text from public.moim_events where target_id = %L and type = 'album_deleted'$q$, pg_temp.id('A10')));
select pg_temp.r('S-11 admin undelete of author-deleted post', format($q$select public.moim_admin_content(%L, 'post', %L, 'undelete', 'reason text ok')->>'status'$q$, pg_temp.id('e6'), pg_temp.id('P08')));
select pg_temp.post('P11', 'e3', 'M1') \g /dev/null
select public.moim_admin_content(pg_temp.id('e6'), 'post', pg_temp.id('P11'), 'delete', 'reason text ok') \g /dev/null
select pg_temp.r('S-11 admin undelete of admin-deleted post', format($q$select public.moim_admin_content(%L, 'post', %L, 'undelete', 'reason text ok')->>'status'$q$, pg_temp.id('e6'), pg_temp.id('P11')));

-- S-12 E9 same role again
select pg_temp.r('S-12 same role again: changed', format($q$select coalesce(public.moim_member_role_set(%L, %L, %L, 'co_host')->>'changed', '<none>')$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.id('e2')));
select pg_temp.r('S-12 role_changed log rows for e2', format($q$select count(*)::text from public.moim_events where moim_id = %L and target_id = %L and type = 'role_changed'$q$, pg_temp.id('M1'), pg_temp.id('e2')));

-- S-13 E10 remove an applicant
select pg_temp.mk('M3', 'e1', 'R5 Moim Approval', 'approval') \g /dev/null
select pg_temp.jn('e12', 'M3') \g /dev/null
select pg_temp.r('S-13 remove applicant: was_active,was_pending', format($q$select (x->>'was_active') || ',' || coalesce(x->>'was_pending', '<none>') from (select public.moim_member_remove(%L, %L, %L, false, 'r') x) s$q$, pg_temp.id('e1'), pg_temp.id('M3'), pg_temp.id('e12')));

-- S-14 / S-15 E11 linking a report to a direct sanction
select pg_temp.mk('M4', 'e1', 'R5 Moim Four') \g /dev/null
select pg_temp.jn('e3', 'M4') \g /dev/null
select pg_temp.rep('R14', 'e3', 'M4', 'moim', pg_temp.id('M4')) \g /dev/null
select public.moim_admin_report_decide(pg_temp.id('e6'), pg_temp.id('R14'), 'received', 'dismissed', 'reason text ok', '{}') \g /dev/null
select pg_temp.r('S-14 link a handled report', format($q$select public.moim_admin_sanction_apply(%L, %L, 'warn', 'commercial', 'reason text ok', null, %L)->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M4'), pg_temp.id('R14')));
select pg_temp.rep('R15', 'e4', 'M4', 'moim', pg_temp.id('M4')) \g /dev/null
select pg_temp.r('S-15 link an open report', format($q$select public.moim_admin_sanction_apply(%L, %L, 'unlist', 'commercial', 'reason text ok', now() + interval '3 days', %L)->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M4'), pg_temp.id('R15')));
select pg_temp.r('S-15 linked report status stays', format('select status from public.moim_reports where id = %L', pg_temp.id('R15')));

-- S-16 / S-17 E12 image URL rule
select pg_temp.r('S-16 cover http://x', format($q$select public.moim_update_info(%L, %L, '{"cover_image_url":"http://x"}', %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));
select pg_temp.r('S-16 cover javascript:x', format($q$select public.moim_update_info(%L, %L, '{"cover_image_url":"javascript:x"}', %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));
select pg_temp.r('S-16 cover 1001 chars', format($q$select public.moim_update_info(%L, %L, jsonb_build_object('cover_image_url', 'https://' || repeat('a', 993)), %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));
select pg_temp.r('S-16 cover empty', format($q$select public.moim_update_info(%L, %L, '{"cover_image_url":""}', %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));
select pg_temp.mk('M5', 'e1', 'R5 Moim Five') \g /dev/null
select pg_temp.r('S-17 join with ftp avatar', format($q$select public.moim_join(%L, %L, '{"nickname":"n13","avatar_url":"ftp://x"}')->>'status'$q$, pg_temp.id('e13'), pg_temp.id('M5')));
select public.moim_invite_send(pg_temp.id('e1'), pg_temp.id('M5'), pg_temp.id('e14')) \g /dev/null
select pg_temp.put('I17', (select id from public.moim_invite_targets where moim_id = pg_temp.id('M5') and invitee_user_id = pg_temp.id('e14') order by created_at desc limit 1)) \g /dev/null
select pg_temp.r('S-17 invite accept with ftp avatar', format($q$select public.moim_invite_respond(%L, %L, true, '{"nickname":"n14","avatar_url":"ftp://x"}')->>'status'$q$, pg_temp.id('e14'), pg_temp.id('I17')));
select pg_temp.r('S-17 profile update with ftp avatar', format($q$select public.moim_profile_update(%L, %L, '{"avatar_url":"ftp://x"}')->>'ok'$q$, pg_temp.id('e3'), pg_temp.id('M1')));

-- S-18 E13 invite decline log
select pg_temp.x('S-18 setup invite', format('select public.moim_invite_send(%L, %L, %L)', pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.id('e15')));
select pg_temp.put('I18', (select id from public.moim_invite_targets where moim_id = pg_temp.id('M1') and invitee_user_id = pg_temp.id('e15') order by created_at desc limit 1)) \g /dev/null
select pg_temp.r('S-18 decline', format('select public.moim_invite_respond(%L, %L, false, %L)->>%L', pg_temp.id('e15'), pg_temp.id('I18'), '{}', 'status'));
select pg_temp.r('S-18 invite_declined log rows', format($q$select count(*)::text from public.moim_events where target_id = %L and type = 'invite_declined'$q$, pg_temp.id('I18')));

-- S-19 E14 started but unfinished schedule host leaves
select pg_temp.mk('M6', 'e1', 'R5 Moim Six') \g /dev/null
select pg_temp.jn('e2', 'M6') \g /dev/null
select pg_temp.put('SC19', (public.moim_schedule_create(pg_temp.id('e2'), pg_temp.id('M6'), jsonb_build_object('title', 'meet', 'starts_at', now() + interval '2 days'))->>'schedule_id')::uuid) \g /dev/null
update public.moim_schedules set starts_at = now() - interval '1 hour' where id = pg_temp.id('SC19');
select public.moim_leave(pg_temp.id('e2'), pg_temp.id('M6')) \g /dev/null
select pg_temp.r('S-19 schedule host after leaving', format('select case host_user_id when %L then %L when %L then %L else %L end from public.moim_schedules where id = %L', pg_temp.id('e1'), 'moim_host', pg_temp.id('e2'), 'left_user', 'other', pg_temp.id('SC19')));
select pg_temp.r('S-19 schedule_host_reassigned rows', format($q$select count(*)::text from public.moim_events where target_id = %L and type = 'schedule_host_reassigned'$q$, pg_temp.id('SC19')));

-- S-20 / S-21 E18 leave a schedule in a blocked moim
select pg_temp.mk('M7', 'e9', 'R5 Moim Seven') \g /dev/null
select pg_temp.jn('e3', 'M7') \g /dev/null
select pg_temp.jn('e4', 'M7') \g /dev/null
select public.moim_member_role_set(pg_temp.id('e9'), pg_temp.id('M7'), pg_temp.id('e3'), 'staff') \g /dev/null
select pg_temp.put('SC20', (public.moim_schedule_create(pg_temp.id('e9'), pg_temp.id('M7'), jsonb_build_object('title', 'meet', 'starts_at', now() + interval '2 days'))->>'schedule_id')::uuid) \g /dev/null
select public.moim_schedule_join(pg_temp.id('e4'), pg_temp.id('SC20'), null) \g /dev/null
select public.moim_admin_sanction_apply(pg_temp.id('e6'), pg_temp.id('M7'), 'block', 'commercial', 'reason text ok', null) \g /dev/null
select pg_temp.r('S-20 leave schedule in blocked moim', format('select public.moim_schedule_leave(%L, %L)->>%L', pg_temp.id('e4'), pg_temp.id('SC20'), 'ok'));
select pg_temp.r('S-21 schedule room participant left_at set', format('select (left_at is not null)::text from public.community_messenger_participants where room_id = (select room_id from public.moim_schedules where id = %L) and user_id = %L', pg_temp.id('SC20'), pg_temp.id('e4')));

-- S-22 E18 profile update in closed / blocked moim
select pg_temp.mk('M8', 'e1', 'R5 Moim Eight') \g /dev/null
select pg_temp.jn('e3', 'M8') \g /dev/null
select pg_temp.post('P40', 'e3', 'M8') \g /dev/null
select public.moim_close(pg_temp.id('e1'), pg_temp.id('M8'), 'R5 Moim Eight') \g /dev/null
select pg_temp.r('S-22 profile update closed moim', format($q$select public.moim_profile_update(%L, %L, '{"nickname":"x22"}')->>'ok'$q$, pg_temp.id('e3'), pg_temp.id('M8')));
select pg_temp.r('S-22 profile update blocked moim', format($q$select public.moim_profile_update(%L, %L, '{"nickname":"x22"}')->>'ok'$q$, pg_temp.id('e3'), pg_temp.id('M7')));

-- S-23 E18 inactive request: blocked refused, warned allowed (admin approves)
update public.profiles set last_login_at = now() - interval '60 days' where id = pg_temp.id('e9');
select pg_temp.r('S-23 inactive request in blocked moim', format($q$select public.moim_host_inactive_request(%L, %L, %L, 'gone')->>'ok'$q$, pg_temp.id('e3'), pg_temp.id('M7'), pg_temp.id('e3')));
select pg_temp.mk('M9', 'e9', 'R5 Moim Nine') \g /dev/null
select pg_temp.jn('e3', 'M9') \g /dev/null
select public.moim_member_role_set(pg_temp.id('e9'), pg_temp.id('M9'), pg_temp.id('e3'), 'staff') \g /dev/null
select public.moim_admin_sanction_apply(pg_temp.id('e6'), pg_temp.id('M9'), 'warn', 'commercial', 'reason text ok', null) \g /dev/null
select pg_temp.put('T23', (public.moim_host_inactive_request(pg_temp.id('e3'), pg_temp.id('M9'), pg_temp.id('e3'), 'gone')->>'transfer_id')::uuid) \g /dev/null
select pg_temp.r('S-23 admin approves inactive request in warned moim', format($q$select public.moim_admin_host_request_decide(%L, %L, true, 'reason text ok')->>'approved'$q$, pg_temp.id('e6'), pg_temp.id('T23')));

-- S-24 E20 input form checks
select pg_temp.r('S-24 capacity abc', format($q$select public.moim_update_info(%L, %L, '{"capacity":"abc"}', %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));
select pg_temp.r('S-24 birth year 19x0', format($q$select public.moim_update_info(%L, %L, '{"age_min_birth_year":"19x0"}', %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));
select pg_temp.r('S-24 min > max', format($q$select public.moim_update_info(%L, %L, '{"age_min_birth_year":"2000","age_max_birth_year":"1990"}', %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));

-- S-25 D3 same-level moim sanction from two reports
select pg_temp.mk('M10', 'e1', 'R5 Moim Ten') \g /dev/null
select pg_temp.rep('R25a', 'e3', 'M10', 'moim', pg_temp.id('M10')) \g /dev/null
select pg_temp.rep('R25b', 'e4', 'M10', 'moim', pg_temp.id('M10')) \g /dev/null
select public.moim_admin_report_decide(pg_temp.id('e6'), pg_temp.id('R25a'), 'received', 'actioned', 'reason text ok', '{"moim_level":"warn"}') \g /dev/null
select pg_temp.r('S-25 second warn: created', format($q$select coalesce(public.moim_admin_report_decide(%L, %L, 'received', 'actioned', 'reason text ok', '{"moim_level":"warn"}')->'actions'->0->>'created', '<none>')$q$, pg_temp.id('e6'), pg_temp.id('R25b')));
select pg_temp.r('S-25 active warn rows', format($q$select count(*)::text from public.moim_sanctions where moim_id = %L and level = 'warn' and revoked_at is null$q$, pg_temp.id('M10')));

-- S-26 new2 hide an already hidden post again
select pg_temp.post('P26', 'e3', 'M1') \g /dev/null
select pg_temp.rep('R26a', 'e4', 'M1', 'post', pg_temp.id('P26')) \g /dev/null
select pg_temp.rep('R26b', 'e2', 'M1', 'post', pg_temp.id('P26')) \g /dev/null
select public.moim_admin_report_decide(pg_temp.id('e6'), pg_temp.id('R26a'), 'received', 'actioned', 'reason text ok', '{"content_hide":true}') \g /dev/null
select pg_temp.r('S-26 second hide: changed', format($q$select public.moim_admin_report_decide(%L, %L, 'received', 'actioned', 'reason text ok', '{"content_hide":true}')->'actions'->0->>'changed'$q$, pg_temp.id('e6'), pg_temp.id('R26b')));
select pg_temp.r('S-26 content_hide rows for the post', format($q$select count(*)::text from public.moim_sanctions where target_id = %L and level = 'content_hide'$q$, pg_temp.id('P26')));

-- S-27 D5 room_status guard
do $$ begin update public.community_messenger_rooms set room_status = 'blocked' where id = (select main_room_id from public.moims where id = (select v from ids where k = 'M1')); raise notice 'S-27 messenger sets room_status on moim room => updated'; exception when others then raise notice 'S-27 messenger sets room_status on moim room => ERROR %', sqlerrm; end $$;
insert into public.community_messenger_rooms (room_type, chat_domain, domain_identity_key) values ('private_group', 'group', 'plain:r5') ;
select pg_temp.put('ROOMX', (select id from public.community_messenger_rooms where domain_identity_key = 'plain:r5')) \g /dev/null
do $$ begin update public.community_messenger_rooms set room_status = 'blocked' where id = (select v from ids where k = 'ROOMX'); raise notice 'S-27 plain room room_status => updated'; exception when others then raise notice 'S-27 plain room room_status => ERROR %', sqlerrm; end $$;

-- S-28 D6 all reasons off
select pg_temp.r('S-28 save with every reason off', format($q$select public.moim_admin_policies_save(%L, jsonb_build_object('report_reasons', (select jsonb_agg(x || '{"is_active":false}'::jsonb) from jsonb_array_elements((select report_reasons from public.moim_policies where id = 1)) x)), (select updated_at from public.moim_policies where id = 1), 'reason text ok')->>'ok'$q$, pg_temp.id('e6')));
-- (before R5 the save above succeeds: switch the reasons back on so later reports still work)
update public.moim_policies set report_reasons = (select jsonb_agg(x || '{"is_active":true}'::jsonb) from jsonb_array_elements(report_reasons) x) where id = 1;
-- S-49 D20 empty English label
select pg_temp.r('S-49 save with empty label_en', format($q$select public.moim_admin_policies_save(%L, jsonb_build_object('prohibited_types', (select jsonb_agg(case when ord = 1 then x || '{"label_en":""}'::jsonb else x end) from jsonb_array_elements((select prohibited_types from public.moim_policies where id = 1)) with ordinality t(x, ord))), (select updated_at from public.moim_policies where id = 1), 'reason text ok')->>'ok'$q$, pg_temp.id('e6')));

update public.moim_policies set prohibited_types = (select jsonb_agg(case when coalesce(x->>'label_en', '') = '' then x || '{"label_en":"Restored"}'::jsonb else x end) from jsonb_array_elements(prohibited_types) x) where id = 1;
-- S-29 D7 admin area code form
select pg_temp.r('S-29 admin lgu "a b;c"', format($q$select public.moim_admin_update_info(%L, %L, '{"lgu_id":"a b;c"}', %L, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M10'), pg_temp.ts('M10')));

-- S-30 D9 review start reason
select pg_temp.rep('R30', 'e3', 'M1', 'moim', pg_temp.id('M1')) \g /dev/null
select pg_temp.r('S-30 review without reason', format('select public.moim_admin_report_review(%L, %L)->>%L', pg_temp.id('e6'), pg_temp.id('R30'), 'ok'));
select pg_temp.r('S-30 review with reason', format($q$select public.moim_admin_report_review(%L, %L, 'looking now')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('R30')));
select pg_temp.r('S-30 logged reason', format($q$select payload->>'reason' from public.moim_events where target_id = %L and type = 'admin_report_reviewing' order by created_at desc limit 1$q$, pg_temp.id('R30')));

-- S-31 / S-45 / S-46 deleted moim (M11)
select pg_temp.mk('M11', 'e1', 'R5 Moim Eleven') \g /dev/null
select pg_temp.jn('e3', 'M11') \g /dev/null
select pg_temp.jn('e4', 'M11') \g /dev/null
select pg_temp.post('P31', 'e3', 'M11') \g /dev/null
select pg_temp.post('P45', 'e3', 'M11') \g /dev/null
select pg_temp.put('C45', (public.moim_comment_create(pg_temp.id('e3'), pg_temp.id('P45'), 'a comment')->>'comment_id')::uuid) \g /dev/null
select public.moim_album_add(pg_temp.id('e3'), pg_temp.id('M11'), '{"urls":["https://x/a45.jpg"]}') \g /dev/null
select pg_temp.put('A45', (select id from public.moim_album_items where moim_id = pg_temp.id('M11') order by created_at desc limit 1)) \g /dev/null
select public.moim_admin_content(pg_temp.id('e6'), 'post', pg_temp.id('P31'), 'hide', 'reason text ok') \g /dev/null
select pg_temp.put('SA31', (public.moim_admin_sanction_apply(pg_temp.id('e6'), pg_temp.id('M11'), 'unlist', 'commercial', 'reason text ok', null)->>'sanction_id')::uuid) \g /dev/null
select public.moim_admin_member_remove(pg_temp.id('e6'), pg_temp.id('M11'), pg_temp.id('e8'), true, 'reason text ok') \g /dev/null
select pg_temp.rep('R46', 'e4', 'M11', 'post', pg_temp.id('P45')) \g /dev/null
select public.moim_admin_delete(pg_temp.id('e6'), pg_temp.id('M11'), 'reason text ok') \g /dev/null
insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, actor_id)
select pg_temp.id('M11'), pg_temp.id('e1'), pg_temp.id('e4'), 'inactive_request', 'requested', pg_temp.id('e3')
 where not exists (select 1 from public.moim_host_transfers where moim_id = pg_temp.id('M11') and status = 'requested');
select pg_temp.put('T46', (select id from public.moim_host_transfers where moim_id = pg_temp.id('M11') and status = 'requested' limit 1)) \g /dev/null
select pg_temp.r('S-31 revoke sanction in deleted moim', format($q$select public.moim_admin_sanction_revoke(%L, %L, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('SA31')));
select pg_temp.r('S-31 restore hidden post in deleted moim', format($q$select public.moim_admin_content(%L, 'post', %L, 'restore', 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('P31')));
select pg_temp.r('S-31 unban in deleted moim', format($q$select public.moim_admin_member_unban(%L, %L, %L, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M11'), pg_temp.id('e8')));
select pg_temp.r('S-45 author deletes post in deleted moim', format('select public.moim_post_remove(%L, %L, null)->>%L', pg_temp.id('e3'), pg_temp.id('P45'), 'result'));
select pg_temp.r('S-45 author deletes comment in deleted moim', format('select public.moim_comment_remove(%L, %L)->>%L', pg_temp.id('e3'), pg_temp.id('C45'), 'ok'));
select pg_temp.r('S-45 uploader deletes photo in deleted moim', format('select public.moim_album_remove(%L, %L)->>%L', pg_temp.id('e3'), pg_temp.id('A45'), 'result'));
select pg_temp.r('S-46 deleted: report hide', format($q$select public.moim_admin_report_decide(%L, %L, 'received', 'actioned', 'reason text ok', '{"content_hide":true}')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('R46')));
select pg_temp.r('S-46 deleted: report dismiss still works', format($q$select public.moim_admin_report_decide(%L, %L, 'received', 'dismissed', 'reason text ok', '{}')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('R46')));
select pg_temp.r('S-46 deleted: sanction apply', format($q$select public.moim_admin_sanction_apply(%L, %L, 'warn', 'commercial', 'reason text ok', null)->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M11')));
select pg_temp.r('S-46 deleted: content hide', format($q$select public.moim_admin_content(%L, 'post', %L, 'hide', 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('P45')));
select pg_temp.r('S-46 deleted: member remove', format($q$select public.moim_admin_member_remove(%L, %L, %L, false, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M11'), pg_temp.id('e4')));
select pg_temp.r('S-46 deleted: member role', format($q$select public.moim_admin_member_role(%L, %L, %L, 'staff', 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M11'), pg_temp.id('e4')));
select pg_temp.r('S-46 deleted: assign host', format($q$select public.moim_admin_assign_host(%L, %L, %L, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M11'), pg_temp.id('e4')));
select pg_temp.r('S-46 deleted: approve inactive request', format($q$select public.moim_admin_host_request_decide(%L, %L, true, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('T46')));
select pg_temp.r('S-46 deleted: update info', format($q$select public.moim_admin_update_info(%L, %L, '{"name":"New Name"}', %L, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M11'), pg_temp.ts('M11')));
-- closed moim (M8): role / assign / approve -> moim_closed
insert into public.moim_host_transfers (moim_id, from_user_id, to_user_id, kind, status, actor_id)
select pg_temp.id('M8'), pg_temp.id('e1'), pg_temp.id('e3'), 'inactive_request', 'requested', pg_temp.id('e3')
 where not exists (select 1 from public.moim_host_transfers where moim_id = pg_temp.id('M8') and status = 'requested');
select pg_temp.put('T46c', (select id from public.moim_host_transfers where moim_id = pg_temp.id('M8') and status = 'requested' limit 1)) \g /dev/null
select pg_temp.r('S-46 closed: member role', format($q$select public.moim_admin_member_role(%L, %L, %L, 'staff', 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M8'), pg_temp.id('e3')));
select pg_temp.r('S-46 closed: assign host', format($q$select public.moim_admin_assign_host(%L, %L, %L, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M8'), pg_temp.id('e3')));
select pg_temp.r('S-46 closed: approve inactive request', format($q$select public.moim_admin_host_request_decide(%L, %L, true, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('T46c')));

-- S-40 S-1 closed moim comment / post edit
select pg_temp.r('S-40 comment in closed moim', format($q$select public.moim_comment_create(%L, %L, 'late comment')->>'ok'$q$, pg_temp.id('e3'), pg_temp.id('P40')));
select pg_temp.r('S-40 edit post in closed moim', format($q$select public.moim_post_update(%L, %L, '{"body":"edited body"}')->>'ok'$q$, pg_temp.id('e3'), pg_temp.id('P40')));

-- S-32 / S-43 C5 an open request is never replaced
select pg_temp.mk('M13', 'e1', 'R5 Moim Thirteen') \g /dev/null
select pg_temp.jn('e3', 'M13') \g /dev/null
select pg_temp.jn('e4', 'M13') \g /dev/null
select pg_temp.put('T32', (public.moim_host_transfer_request(pg_temp.id('e1'), pg_temp.id('M13'), pg_temp.id('e3'))->>'transfer_id')::uuid) \g /dev/null
select pg_temp.r('S-32 second direct request while one is open', format('select public.moim_host_transfer_request(%L, %L, %L)->>%L', pg_temp.id('e1'), pg_temp.id('M13'), pg_temp.id('e4'), 'ok'));
select pg_temp.r('S-32 first request status', format('select status from public.moim_host_transfers where id = %L', pg_temp.id('T32')));
select pg_temp.mk('M12', 'e9', 'R5 Moim Twelve') \g /dev/null
select pg_temp.jn('e3', 'M12') \g /dev/null
select pg_temp.jn('e4', 'M12') \g /dev/null
select public.moim_member_role_set(pg_temp.id('e9'), pg_temp.id('M12'), pg_temp.id('e3'), 'staff') \g /dev/null
select pg_temp.put('T43', (public.moim_host_inactive_request(pg_temp.id('e3'), pg_temp.id('M12'), pg_temp.id('e3'), 'gone')->>'transfer_id')::uuid) \g /dev/null
select pg_temp.r('S-43 direct request while inactive request is open', format('select public.moim_host_transfer_request(%L, %L, %L)->>%L', pg_temp.id('e9'), pg_temp.id('M12'), pg_temp.id('e4'), 'ok'));
select pg_temp.r('S-43 inactive request status', format('select status from public.moim_host_transfers where id = %L', pg_temp.id('T43')));
-- S-33 cancel a sent request (N3)
select pg_temp.put('T33', (select id from public.moim_host_transfers where moim_id = pg_temp.id('M13') and status = 'requested' limit 1)) \g /dev/null
select pg_temp.r('S-33 someone else cancels', format('select public.moim_host_transfer_cancel(%L, %L)->>%L', pg_temp.id('e3'), pg_temp.id('T33'), 'ok'));
select pg_temp.r('S-33 sender cancels', format('select public.moim_host_transfer_cancel(%L, %L)->>%L', pg_temp.id('e1'), pg_temp.id('T33'), 'ok'));
select pg_temp.r('S-33 host_transfer_cancelled rows', format($q$select count(*)::text from public.moim_events where moim_id = %L and type = 'host_transfer_cancelled'$q$, pg_temp.id('M13')));
select pg_temp.r('S-33 cancel the inactive request', format('select public.moim_host_transfer_cancel(%L, %L)->>%L', pg_temp.id('e9'), pg_temp.id('T43'), 'ok'));

-- S-34 C8 handled schedule request
select pg_temp.mk('M14', 'e1', 'R5 Moim Fourteen') \g /dev/null
select pg_temp.jn('e3', 'M14') \g /dev/null
select pg_temp.put('SC34', (public.moim_schedule_create(pg_temp.id('e1'), pg_temp.id('M14'), jsonb_build_object('title', 'meet', 'starts_at', now() + interval '2 days', 'join_mode', 'approval'))->>'schedule_id')::uuid) \g /dev/null
select public.moim_schedule_join(pg_temp.id('e3'), pg_temp.id('SC34'), null) \g /dev/null
select public.moim_schedule_decide(pg_temp.id('e1'), pg_temp.id('SC34'), pg_temp.id('e3'), true) \g /dev/null
select pg_temp.r('S-34 approve again', format('select public.moim_schedule_decide(%L, %L, %L, true)->>%L', pg_temp.id('e1'), pg_temp.id('SC34'), pg_temp.id('e3'), 'ok'));

-- S-35 C13 notes
select pg_temp.r('S-35 note on self', format($q$select public.moim_member_note_set(%L, %L, %L, 'memo')->>'ok'$q$, pg_temp.id('e2'), pg_temp.id('M1'), pg_temp.id('e2')));
select pg_temp.r('S-35 note on higher role', format($q$select public.moim_member_note_set(%L, %L, %L, 'memo')->>'ok'$q$, pg_temp.id('e2'), pg_temp.id('M1'), pg_temp.id('e1')));
select pg_temp.r('S-35 note on lower role', format($q$select public.moim_member_note_set(%L, %L, %L, 'memo')->>'ok'$q$, pg_temp.id('e2'), pg_temp.id('M1'), pg_temp.id('e3')));
select pg_temp.r('S-35 note on a left member', format($q$select public.moim_member_note_set(%L, %L, %L, 'memo')->>'ok'$q$, pg_temp.id('e2'), pg_temp.id('M1'), pg_temp.id('e5')));

-- S-36 C17 birth years
select pg_temp.r('S-36 birth year 1850', format($q$select public.moim_update_info(%L, %L, '{"age_min_birth_year":"1850"}', %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));
select pg_temp.r('S-36 birth year next year', format($q$select public.moim_update_info(%L, %L, jsonb_build_object('age_max_birth_year', (extract(year from now())::int + 1)::text), %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));
select pg_temp.r('S-36 birth years null,null', format($q$select public.moim_update_info(%L, %L, '{"age_min_birth_year":"","age_max_birth_year":""}', %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));

-- S-41 C4 board order (N7)
select pg_temp.r('S-41 exact set', format('select public.moim_board_reorder(%L, %L, (select array_agg(id order by sort_order desc) from public.moim_boards where moim_id = %L and is_active))->>%L', pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.id('M1'), 'ok'));
select pg_temp.r('S-41 order saved (first = old last)', format($q$select kind from public.moim_boards where moim_id = %L and is_active order by sort_order limit 1$q$, pg_temp.id('M1')));
select pg_temp.r('S-41 missing one', format('select public.moim_board_reorder(%L, %L, (select (array_agg(id order by sort_order))[2:] from public.moim_boards where moim_id = %L and is_active))->>%L', pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.id('M1'), 'ok'));
select pg_temp.r('S-41 duplicate id', format('select public.moim_board_reorder(%L, %L, (select array_agg(id order by sort_order) || (array_agg(id order by sort_order))[1] from public.moim_boards where moim_id = %L and is_active))->>%L', pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.id('M1'), 'ok'));
select pg_temp.r('S-41 other moim id', format('select public.moim_board_reorder(%L, %L, (select (array_agg(id order by sort_order))[2:] || %L::uuid from public.moim_boards where moim_id = %L and is_active))->>%L', pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.board('M2'), pg_temp.id('M1'), 'ok'));

-- S-42 C15 reopen a closed board
select pg_temp.put('B1', (public.moim_board_upsert(pg_temp.id('e1'), pg_temp.id('M1'), '{"name":"club one"}')->>'board_id')::uuid) \g /dev/null
select pg_temp.put('B2', (public.moim_board_upsert(pg_temp.id('e1'), pg_temp.id('M1'), '{"name":"club two"}')->>'board_id')::uuid) \g /dev/null
select public.moim_board_upsert(pg_temp.id('e1'), pg_temp.id('M1'), jsonb_build_object('board_id', pg_temp.id('B1'), 'is_active', false)) \g /dev/null
select pg_temp.put('B3', (public.moim_board_upsert(pg_temp.id('e1'), pg_temp.id('M1'), '{"name":"club three"}')->>'board_id')::uuid) \g /dev/null
select pg_temp.r('S-42 reopen at the limit', format('select public.moim_board_upsert(%L, %L, jsonb_build_object(%L, %L::uuid, %L, true))->>%L', pg_temp.id('e1'), pg_temp.id('M1'), 'board_id', pg_temp.id('B1'), 'is_active', 'ok'));
select public.moim_board_upsert(pg_temp.id('e1'), pg_temp.id('M1'), jsonb_build_object('board_id', pg_temp.id('B3'), 'is_active', false)) \g /dev/null
select pg_temp.r('S-42 reopen below the limit', format('select public.moim_board_upsert(%L, %L, jsonb_build_object(%L, %L::uuid, %L, true))->>%L', pg_temp.id('e1'), pg_temp.id('M1'), 'board_id', pg_temp.id('B1'), 'is_active', 'ok'));
select pg_temp.r('S-42 reopened board is last', format('select (sort_order = (select max(sort_order) from public.moim_boards where moim_id = %L))::text from public.moim_boards where id = %L', pg_temp.id('M1'), pg_temp.id('B1')));

-- S-44 S-6 open invites follow membership
select pg_temp.x('S-44 setup invite e16', format('select public.moim_invite_send(%L, %L, %L)', pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.id('e16')));
select pg_temp.x('S-44 setup ban e16', format($q$select public.moim_member_remove(%L, %L, %L, true, 'r')$q$, pg_temp.id('e2'), pg_temp.id('M1'), pg_temp.id('e16')));
select pg_temp.r('S-44 invite after ban', format('select string_agg(status, %L) from public.moim_invite_targets where moim_id = %L and invitee_user_id = %L', ',', pg_temp.id('M1'), pg_temp.id('e16')));
select pg_temp.x('S-44 setup invite e17', format('select public.moim_invite_send(%L, %L, %L)', pg_temp.id('e1'), pg_temp.id('M3'), pg_temp.id('e17')));
select pg_temp.jn('e17', 'M3') \g /dev/null
select pg_temp.x('S-44 setup approve e17', format('select public.moim_join_decide(%L, (select id from public.moim_join_requests where moim_id = %L and user_id = %L and status = %L), true, null)', pg_temp.id('e1'), pg_temp.id('M3'), pg_temp.id('e17'), 'pending'));
select pg_temp.r('S-44 invite after approved join', format('select string_agg(status, %L) from public.moim_invite_targets where moim_id = %L and invitee_user_id = %L', ',', pg_temp.id('M3'), pg_temp.id('e17')));
select pg_temp.x('S-44 setup invite e18', format('select public.moim_invite_send(%L, %L, %L)', pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.id('e18')));
select pg_temp.x('S-44 setup accept e18', format($q$select public.moim_invite_respond(%L, (select id from public.moim_invite_targets where moim_id = %L and invitee_user_id = %L and status = 'sent'), true, '{"nickname":"n18"}')$q$, pg_temp.id('e18'), pg_temp.id('M1'), pg_temp.id('e18')));
select pg_temp.r('S-44 invite after accept', format('select string_agg(status, %L) from public.moim_invite_targets where moim_id = %L and invitee_user_id = %L', ',', pg_temp.id('M1'), pg_temp.id('e18')));

-- S-48 / S-47 D13 direct sanctions
select pg_temp.r('S-48 same level already on', format($q$select public.moim_admin_sanction_apply(%L, %L, 'unlist', 'commercial', 'reason text ok', null)->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M4')));
select pg_temp.put('SA47', (select id from public.moim_sanctions where moim_id = pg_temp.id('M4') and level = 'unlist' and revoked_at is null limit 1)) \g /dev/null
select pg_temp.r('S-47 revoke 1st', format($q$select public.moim_admin_sanction_revoke(%L, %L, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('SA47')));
select pg_temp.r('S-47 revoke 2nd', format($q$select public.moim_admin_sanction_revoke(%L, %L, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('SA47')));
select pg_temp.r('S-47 revoke a content_hide row', format($q$select public.moim_admin_sanction_revoke(%L, (select id from public.moim_sanctions where target_id = %L and level = 'content_hide' limit 1), 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('P26')));
select pg_temp.r('S-47 admin unban 1st', format($q$select public.moim_admin_member_unban(%L, %L, %L, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M1'), pg_temp.id('e8')));
select pg_temp.r('S-47 admin unban 2nd', format($q$select public.moim_admin_member_unban(%L, %L, %L, 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M1'), pg_temp.id('e8')));

-- S-50 view states (lead decision 1)
select pg_temp.rep('R50', 'e3', 'M1', 'member', pg_temp.id('e4')) \g /dev/null
select pg_temp.x('S-50 setup user restrict', format($q$select public.moim_admin_report_decide(%L, %L, 'received', 'actioned', 'reason text ok', '{"user_restrict":{"who":"target","restriction":"post","days":3}}')$q$, pg_temp.id('e6'), pg_temp.id('R50')));
select pg_temp.r('S-50 user restrict row (linked, active)', format($q$select live_state from public.moim_admin_sanction_rows_v where source_report_id = %L and level = 'user_restrict'$q$, pg_temp.id('R50')));
update public.sanctions set revoked_at = now() where source_report_id = pg_temp.id('R50');
select pg_temp.r('S-50 community restriction lifted -> revoked', format($q$select live_state from public.moim_admin_sanction_rows_v where source_report_id = %L and level = 'user_restrict'$q$, pg_temp.id('R50')));
select pg_temp.r('S-50 hidden post row before restore', format($q$select live_state || ',' || report_target_type || ',' || content_now from public.moim_admin_sanction_rows_v where target_id = %L and level = 'content_hide' order by created_at limit 1$q$, pg_temp.id('P26')));
select pg_temp.x('S-50 setup restore post', format($q$select public.moim_admin_content(%L, 'post', %L, 'restore', 'reason text ok')$q$, pg_temp.id('e6'), pg_temp.id('P26')));
select pg_temp.r('S-50 hidden post restored -> lifted', format($q$select live_state from public.moim_admin_sanction_rows_v where target_id = %L and level = 'content_hide' order by created_at limit 1$q$, pg_temp.id('P26')));
insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, actor_id)
values (pg_temp.id('M1'), 'member', pg_temp.id('e19'), 'user_restrict', 'commercial', 'old row', pg_temp.id('e6'));
select pg_temp.r('S-50 old unlinked row', format($q$select live_state from public.moim_admin_sanction_rows_v where target_id = %L and level = 'user_restrict'$q$, pg_temp.id('e19')));
select pg_temp.r('S-50 moim row revoked', format('select live_state from public.moim_admin_sanction_rows_v where id = %L', pg_temp.id('SA47')));

-- S-51 A18 room profile bio
select pg_temp.mk('M15', 'e1', 'R5 Moim Fifteen') \g /dev/null
select pg_temp.jn('e3', 'M15', 'hello bio') \g /dev/null
select pg_temp.r('S-51 join with bio -> room profile bio', format('select coalesce(bio, %L) from public.community_messenger_room_profiles where room_id = (select main_room_id from public.moims where id = %L) and user_id = %L', 'null', pg_temp.id('M15'), pg_temp.id('e3')));
select public.moim_profile_update(pg_temp.id('e3'), pg_temp.id('M15'), '{"bio":"new bio"}') \g /dev/null
select pg_temp.r('S-51 bio edit -> room profile bio', format('select coalesce(bio, %L) from public.community_messenger_room_profiles where room_id = (select main_room_id from public.moims where id = %L) and user_id = %L', 'null', pg_temp.id('M15'), pg_temp.id('e3')));
select pg_temp.put('SC51', (public.moim_schedule_create(pg_temp.id('e1'), pg_temp.id('M15'), jsonb_build_object('title', 'meet', 'starts_at', now() + interval '2 days'))->>'schedule_id')::uuid) \g /dev/null
select public.moim_schedule_join(pg_temp.id('e3'), pg_temp.id('SC51'), null) \g /dev/null
select pg_temp.r('S-51 schedule confirm -> schedule room profile bio', format('select coalesce(bio, %L) from public.community_messenger_room_profiles where room_id = (select room_id from public.moim_schedules where id = %L) and user_id = %L', 'null', pg_temp.id('SC51'), pg_temp.id('e3')));

-- S-52 N5 messenger admin room action log
select pg_temp.r('S-52 sanction rows before', 'select count(*)::text || chr(44) || coalesce(max(revoked_at)::text, chr(45)) from public.moim_sanctions');
select pg_temp.r('S-52 moim room -> logged', format($q$select public.moim_admin_log_room_action(%L, (select main_room_id from public.moims where id = %L), 'admin_messenger_message_hidden', gen_random_uuid(), 'reason text ok')->>'ok'$q$, pg_temp.id('e6'), pg_temp.id('M1')));
select pg_temp.r('S-52 log rows', format($q$select count(*)::text from public.moim_events where moim_id = %L and type = 'admin_messenger_message_hidden'$q$, pg_temp.id('M1')));
select pg_temp.r('S-52 plain room', format($q$select public.moim_admin_log_room_action(%L, %L, 'admin_messenger_message_hidden', gen_random_uuid(), 'reason text ok')::text$q$, pg_temp.id('e6'), pg_temp.id('ROOMX')));
select pg_temp.r('S-52 sanction rows after', 'select count(*)::text || chr(44) || coalesce(max(revoked_at)::text, chr(45)) from public.moim_sanctions');

-- S-53 fingerprint (moim_cron_tick excluded)
select pg_temp.r('S-53 fingerprint count', $q$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like '%moim%' and p.proname <> 'moim_cron_tick'$q$);

-- S-38 / S-54 grants: new functions and the view are service_role only
select pg_temp.r('S-54 ' || f || ' anon,authenticated,service_role', format('select has_function_privilege(%L, %L, %L)::text || %L || has_function_privilege(%L, %L, %L)::text || %L || has_function_privilege(%L, %L, %L)::text', 'anon', f, 'execute', ',', 'authenticated', f, 'execute', ',', 'service_role', f, 'execute'))
  from unnest(array['public.moim__assert_image_url(text)', 'public.moim__assert_birth_years(integer, integer)', 'public.moim__admin_assert_state(uuid, text)',
    'public.moim__room_moim_id(uuid)', 'public.moim_host_transfer_cancel(uuid, uuid)', 'public.moim_admin_log_room_action(uuid, uuid, text, uuid, text)',
    'public.moim_board_reorder(uuid, uuid, uuid[])', 'public.moim_admin_report_review(uuid, uuid, text)']) f;
select pg_temp.r('S-54 view select anon,authenticated,service_role', $q$select has_table_privilege('anon', 'public.moim_admin_sanction_rows_v', 'select')::text || ',' || has_table_privilege('authenticated', 'public.moim_admin_sanction_rows_v', 'select')::text || ',' || has_table_privilege('service_role', 'public.moim_admin_sanction_rows_v', 'select')::text$q$);
select pg_temp.r('S-54 backup table anon select', $q$select has_table_privilege('anon', 'public.moim_r5_backup_20271128', 'select')::text$q$);
set role anon;
do $$ begin perform public.moim_board_reorder(null, null, null); raise notice 'S-54 anon calls moim_board_reorder => ran'; exception when others then raise notice 'S-54 anon calls moim_board_reorder => ERROR %', sqlerrm; end $$;
do $$ begin perform 1 from public.moim_admin_sanction_rows_v limit 1; raise notice 'S-54 anon reads the view => ran'; exception when others then raise notice 'S-54 anon reads the view => ERROR %', sqlerrm; end $$;
reset role;

-- S-37 / S-50 / S-51 repairs R-1..R-7: seed bad rows, apply the R5 file, check, apply again (second run changes 0 rows)
select pg_temp.mk('M16', 'e1', 'R5 Moim Sixteen') \g /dev/null
select pg_temp.mk('M17', 'e7', 'R5 Moim Seventeen') \g /dev/null
select pg_temp.jn('e3', 'M16', 'seed bio') \g /dev/null
select pg_temp.jn('e4', 'M16') \g /dev/null
select pg_temp.jn('e3', 'M17') \g /dev/null
-- R-1 seed: a report in M17 closed by a decision in M16 (same handler, same time, event lists it)
insert into ids values ('R37a', gen_random_uuid()), ('R37b', gen_random_uuid());
insert into public.moim_reports (id, reporter_id, moim_id, target_type, target_id, reason_code, status, handled_by, handled_at)
values (pg_temp.id('R37a'), pg_temp.id('e4'), pg_temp.id('M16'), 'member', pg_temp.id('e3'), 'commercial', 'dismissed', pg_temp.id('e6'), '2026-11-20 10:00:00+00'),
       (pg_temp.id('R37b'), pg_temp.id('e5'), pg_temp.id('M17'), 'member', pg_temp.id('e3'), 'commercial', 'dismissed', pg_temp.id('e6'), '2026-11-20 10:00:00+00');
insert into public.moim_events (moim_id, actor_id, actor_kind, type, target_id, payload, created_at)
values (pg_temp.id('M16'), pg_temp.id('e6'), 'admin', 'admin_report_dismissed', pg_temp.id('R37a'),
        jsonb_build_object('after', jsonb_build_object('closed_report_ids', jsonb_build_array(pg_temp.id('R37a'), pg_temp.id('R37b')))), '2026-11-20 10:00:00+00');
-- R-2 seed: two active warn rows in M16
insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, actor_id, created_at)
values (pg_temp.id('M16'), 'moim', pg_temp.id('M16'), 'warn', 'commercial', 'a', pg_temp.id('e6'), now() - interval '2 days'),
       (pg_temp.id('M16'), 'moim', pg_temp.id('M16'), 'warn', 'commercial', 'b', pg_temp.id('e6'), now() - interval '1 day');
-- R-3 seed: two content_hide rows for one post, the later one is the report's action
select pg_temp.post('P37', 'e3', 'M16') \g /dev/null
update public.moim_posts set status = 'hidden' where id = pg_temp.id('P37');
insert into ids values ('SH1', gen_random_uuid()), ('SH2', gen_random_uuid());
insert into public.moim_sanctions (id, moim_id, target_kind, target_id, level, reason_code, reason, actor_id, created_at)
values (pg_temp.id('SH1'), pg_temp.id('M16'), 'content', pg_temp.id('P37'), 'content_hide', 'commercial', 'a', pg_temp.id('e6'), now() - interval '2 days'),
       (pg_temp.id('SH2'), pg_temp.id('M16'), 'content', pg_temp.id('P37'), 'content_hide', 'commercial', 'b', pg_temp.id('e6'), now() - interval '1 day');
insert into ids values ('R37c', gen_random_uuid());
insert into public.moim_reports (id, reporter_id, moim_id, target_type, target_id, reason_code, status, action_id, handled_by, handled_at)
values (pg_temp.id('R37c'), pg_temp.id('e4'), pg_temp.id('M16'), 'post', pg_temp.id('P37'), 'commercial', 'actioned', pg_temp.id('SH2'), pg_temp.id('e6'), now() - interval '1 day');
-- R-4 seed: an open ban placed by an admin before the source column existed
insert into public.moim_bans (moim_id, user_id, banned_by, reason) values (pg_temp.id('M16'), pg_temp.id('e20'), pg_temp.id('e6'), 'admin seed');
insert into public.moim_events (moim_id, actor_id, actor_kind, type, target_id, payload)
values (pg_temp.id('M16'), pg_temp.id('e6'), 'admin', 'admin_member_banned', pg_temp.id('e20'), '{}');
-- R-5 seed: an unfinished schedule whose host has left
select pg_temp.put('SC37', (public.moim_schedule_create(pg_temp.id('e4'), pg_temp.id('M16'), jsonb_build_object('title', 'meet', 'starts_at', now() + interval '2 days'))->>'schedule_id')::uuid) \g /dev/null
update public.moim_members set status = 'left' where moim_id = pg_temp.id('M16') and user_id = pg_temp.id('e4');
-- R-7 seed: room profile bio that differs from the member bio
do $$ begin perform public.moim__writer_on(); update public.community_messenger_room_profiles set bio = '' where room_id = (select main_room_id from public.moims where id = (select v from ids where k = 'M16')) and user_id = (select v from ids where k = 'e3'); end $$;
select pg_temp.r('S-37 seed R-7 room bio before', format('select coalesce(bio, %L) from public.community_messenger_room_profiles where room_id = (select main_room_id from public.moims where id = %L) and user_id = %L', 'null', pg_temp.id('M16'), pg_temp.id('e3')));
\ir ../../supabase/migrations/20271128260000_moim_r5_full_fix.sql
select pg_temp.r('S-37 R-1 cross-moim closed report revived', format('select status from public.moim_reports where id = %L', pg_temp.id('R37b')));
select pg_temp.r('S-37 R-1 own-moim report kept', format('select status from public.moim_reports where id = %L', pg_temp.id('R37a')));
select pg_temp.r('S-37 R-2 active warn rows in M16', format($q$select count(*)::text from public.moim_sanctions where moim_id = %L and level = 'warn' and revoked_at is null$q$, pg_temp.id('M16')));
select pg_temp.r('S-37 R-3 active content_hide rows / report action = kept row', format($q$select (select count(*) from public.moim_sanctions where target_id = %L and level = 'content_hide' and revoked_at is null)::text || ',' || ((select action_id from public.moim_reports where id = %L) = %L)::text$q$, pg_temp.id('P37'), pg_temp.id('R37c'), pg_temp.id('SH1')));
select pg_temp.r('S-50 R-3 duplicate row in the view', format('select live_state from public.moim_admin_sanction_rows_v where id = %L', pg_temp.id('SH2')));
select pg_temp.r('S-37 R-4 seeded admin ban source', format('select source from public.moim_bans where moim_id = %L and user_id = %L and released_at is null', pg_temp.id('M16'), pg_temp.id('e20')));
select pg_temp.r('S-37 R-5 schedule host', format('select case host_user_id when %L then %L else %L end from public.moim_schedules where id = %L', pg_temp.id('e1'), 'moim_host', 'other', pg_temp.id('SC37')));
select pg_temp.r('S-37 R-7 room bio after', format('select coalesce(bio, %L) from public.community_messenger_room_profiles where room_id = (select main_room_id from public.moims where id = %L) and user_id = %L', 'null', pg_temp.id('M16'), pg_temp.id('e3')));
select pg_temp.r('S-37 backup rows by table', $q$select string_agg(tbl || '=' || n, ',' order by tbl) from (select tbl, count(*) n from public.moim_r5_backup_20271128 group by tbl) z$q$);
create temp table r5_state1 as
select (select count(*) from public.moim_r5_backup_20271128) bk, (select count(*) from public.moim_events where type in ('sanction_dedup', 'schedule_host_reassigned')) ev,
       (select md5(string_agg(to_jsonb(s)::text, ',' order by id)) from public.moim_sanctions s) sa,
       (select md5(string_agg(to_jsonb(r)::text, ',' order by id)) from public.moim_reports r) re,
       (select md5(string_agg(id::text || bio, ',' order by id)) from public.community_messenger_room_profiles) rp;
\ir ../../supabase/migrations/20271128260000_moim_r5_full_fix.sql
select pg_temp.r('S-37 second run: backup rows, repair events, sanctions, reports, room bios unchanged', $q$select ((select count(*) from public.moim_r5_backup_20271128) = s.bk)::text || ',' || ((select count(*) from public.moim_events where type in ('sanction_dedup', 'schedule_host_reassigned')) = s.ev)::text || ',' || ((select md5(string_agg(to_jsonb(x)::text, ',' order by id)) from public.moim_sanctions x) = s.sa)::text || ',' || ((select md5(string_agg(to_jsonb(x)::text, ',' order by id)) from public.moim_reports x) = s.re)::text || ',' || ((select md5(string_agg(id::text || bio, ',' order by id)) from public.community_messenger_room_profiles) = s.rp)::text from r5_state1 s$q$);
select pg_temp.r('S-53 fingerprint count after the R5 file', $q$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like '%moim%' and p.proname <> 'moim_cron_tick'$q$);
-- S-55 (re-audit F1) a copied default avatar (not https) does not block a nickname edit; a new http photo is still refused
update public.moim_members set avatar_url = '/samarket-default-avatar.svg' where moim_id = pg_temp.id('M1') and user_id = pg_temp.id('e2');
select pg_temp.r('S-55 nickname edit keeping the copied default avatar', format($q$select public.moim_profile_update(%L, %L, '{"nickname":"nick55","avatar_url":"/samarket-default-avatar.svg"}')->>'ok'$q$, pg_temp.id('e2'), pg_temp.id('M1')));
select pg_temp.r('S-55 new http photo', format($q$select public.moim_profile_update(%L, %L, '{"avatar_url":"http://x"}')->>'ok'$q$, pg_temp.id('e2'), pg_temp.id('M1')));
-- S-56 (re-audit F4) an old out-of-range birth year does not block a name edit; changing it to an out-of-range value is refused
update public.moims set age_min_birth_year = 1800 where id = pg_temp.id('M1');
select pg_temp.r('S-56 name edit with an old 1800 birth year kept', format($q$select public.moim_update_info(%L, %L, '{"name":"Name fifty six"}', %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));
select pg_temp.r('S-56 setting birth year 1850', format($q$select public.moim_update_info(%L, %L, '{"age_min_birth_year":1850}', %L)->>'ok'$q$, pg_temp.id('e1'), pg_temp.id('M1'), pg_temp.ts('M1')));
update public.moims set age_min_birth_year = null where id = pg_temp.id('M1');
