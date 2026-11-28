-- 모임 R4 로컬 PG17 검증 시나리오 (2026-11-28). R3 반영 DB 에서 R4(20271128250000) 적용 전·후 비교. 결과: PR 본문.
--
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
update public.moim_policies set name_min_len = 2, intro_min_len = 10, closed_retention_days = 30 where id = 1;
insert into public.profiles (id, nickname, phone_verified)
select ('eeeeeeee-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'e' || i, true from generate_series(1, 6) i;
insert into public.user_addresses (user_id, canonical_lgu_id, is_default_master, is_active)
select ('eeeeeeee-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, '1381300000', true, true from generate_series(1, 6) i;
insert into ids select 'e' || i, ('eeeeeeee-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 6) i;
insert into ids values ('M1', (public.moim_create(pg_temp.id('e1'), '{"name":"R4 Moim","intro":"intro text long enough","category_id":"11111111-0000-0000-0000-000000000001","nickname":"h1"}')->>'moim_id')::uuid);
select public.moim_join(pg_temp.id('e' || i), pg_temp.id('M1'), jsonb_build_object('nickname', 'n' || i)) from generate_series(2, 4) i \g /dev/null

-- C-01 D-14
select pg_temp.r('C-01 warn with end date', format('select public.moim_admin_sanction_apply(%L, %L, %L, %L, %L, now() + interval %L)->>%L', pg_temp.id('e6'), pg_temp.id('M1'), 'warn', 'commercial', 'reason text ok', '3 days', 'ok'));
select pg_temp.r('C-01 unlist with end date', format('select public.moim_admin_sanction_apply(%L, %L, %L, %L, %L, now() + interval %L)->>%L', pg_temp.id('e6'), pg_temp.id('M1'), 'unlist', 'commercial', 'reason text ok', '3 days', 'ok'));
do $$ begin insert into public.moim_sanctions (moim_id, target_kind, target_id, level, reason_code, reason, actor_id, ends_at) values ((select v from ids where k='M1'), 'moim', (select v from ids where k='M1'), 'warn', 'commercial', 'x', (select v from ids where k='e6'), now() + interval '1 day'); raise notice 'C-01 direct insert warn+end => inserted'; exception when others then raise notice 'C-01 direct insert warn+end => ERROR %', sqlerrm; end $$;
-- C-02 report reasons list
select pg_temp.r('C-02 report with spam(not in list)', format('select public.moim_report_create(%L, %L, %L::jsonb)->>%L', pg_temp.id('e2'), pg_temp.id('M1'), json_build_object('target_type','moim','target_id',pg_temp.id('M1'),'reason_code','spam')::text, 'ok'));
select pg_temp.r('C-02 report with commercial', format('select public.moim_report_create(%L, %L, %L::jsonb)->>%L', pg_temp.id('e2'), pg_temp.id('M1'), json_build_object('target_type','moim','target_id',pg_temp.id('M1'),'reason_code','commercial')::text, 'ok'));
select pg_temp.r('C-02 policy defaults counts', $q$select cardinality(question_banned_words) || ',' || jsonb_array_length(prohibited_types) || ',' || jsonb_array_length(report_reasons) from public.moim_policies where id = 1$q$);
select pg_temp.r('C-02 save removing a reason', format('select public.moim_admin_policies_save(%L, jsonb_build_object(%L, (select jsonb_agg(x) from jsonb_array_elements((select report_reasons from public.moim_policies where id=1)) x where x->>%L <> %L)), (select updated_at from public.moim_policies where id=1), %L)->>%L', pg_temp.id('e6'), 'report_reasons', 'code', 'other', 'reason text ok', 'ok'));
select pg_temp.r('C-02 save deactivating a reason', format('select public.moim_admin_policies_save(%L, jsonb_build_object(%L, (select jsonb_agg(case when x->>%L = %L then x || %L::jsonb else x end) from jsonb_array_elements((select report_reasons from public.moim_policies where id=1)) x)), (select updated_at from public.moim_policies where id=1), %L)->>%L', pg_temp.id('e6'), 'report_reasons', 'code', 'politics', '{"is_active":false}', 'reason text ok', 'ok'));
select pg_temp.r('C-02 report with deactivated politics', format('select public.moim_report_create(%L, %L, %L::jsonb)->>%L', pg_temp.id('e3'), pg_temp.id('M1'), json_build_object('target_type','moim','target_id',pg_temp.id('M1'),'reason_code','politics')::text, 'ok'));
-- C-03 question banned words from policy
select pg_temp.r('C-03 question with contact word', format('select public.moim_update_info(%L, %L, %L::jsonb, (select updated_at from public.moims where id = %L))->>%L', pg_temp.id('e1'), pg_temp.id('M1'), json_build_object('questions', json_build_array('phone number please'))::text, pg_temp.id('M1'), 'ok'));
-- C-04 album remove after leaving
insert into public.moim_album_items (moim_id, uploader_id, url) values (pg_temp.id('M1'), pg_temp.id('e4'), 'https://x/1');
select public.moim_leave(pg_temp.id('e4'), pg_temp.id('M1')) \g /dev/null
select pg_temp.r('C-04 remove own photo after leaving', format('select public.moim_album_remove(%L, (select id from public.moim_album_items where uploader_id = %L limit 1))->>%L', pg_temp.id('e4'), pg_temp.id('e4'), 'result'));
-- C-05 moim room is_readonly guarded outside moim functions
do $$ begin update public.community_messenger_rooms set is_readonly = true where id = (select main_room_id from public.moims where id = (select v from ids where k='M1')); raise notice 'C-05 messenger update is_readonly => updated'; exception when others then raise notice 'C-05 messenger update is_readonly => ERROR %', sqlerrm; end $$;
-- C-06 deleted moim retention + restore
select public.moim_admin_delete(pg_temp.id('e6'), pg_temp.id('M1'), 'reason text ok') \g /dev/null
-- one member archived the room themselves before retention (must stay archived after restore)
insert into ids select 'UA', user_id from public.community_messenger_participants where room_id = (select main_room_id from public.moims where id = pg_temp.id('M1')) and left_at is null order by user_id limit 1;
do $$ begin update public.community_messenger_participants set is_archived = true where room_id = (select main_room_id from public.moims where id = (select v from ids where k='M1')) and user_id = (select v from ids where k='UA'); raise notice 'C-06 user archive => ok'; exception when others then raise notice 'C-06 user archive => ERROR %', sqlerrm; end $$;
update public.moims set deleted_at = now() - interval '40 days' where id = pg_temp.id('M1');
select pg_temp.r('C-06 retention ended (deleted)', $q$select (public.moim_closed_retention_due(100)->>'ended')$q$);
select pg_temp.r('C-06 main room archived', format('select bool_and(is_archived)::text from public.community_messenger_participants where room_id = (select main_room_id from public.moims where id = %L) and left_at is null', pg_temp.id('M1')));
select public.moim_admin_restore(pg_temp.id('e6'), pg_temp.id('M1'), 'reason text ok') \g /dev/null
select pg_temp.r('C-06 after restore any archived (incl. user row)', format('select bool_or(is_archived)::text || %L || coalesce((select retention_ended_at::text from public.moims where id = %L), %L) from public.community_messenger_participants where room_id = (select main_room_id from public.moims where id = %L) and left_at is null', ' ret=', pg_temp.id('M1'), 'null', pg_temp.id('M1')));
select pg_temp.r('C-06 after restore: user-archived row', format('select is_archived::text from public.community_messenger_participants where room_id = (select main_room_id from public.moims where id = %L) and user_id = %L', pg_temp.id('M1'), pg_temp.id('UA')));
select pg_temp.r('C-06 after restore: others archived?', format('select coalesce(bool_or(is_archived), false)::text from public.community_messenger_participants where room_id = (select main_room_id from public.moims where id = %L) and user_id <> %L and left_at is null', pg_temp.id('M1'), pg_temp.id('UA')));
select pg_temp.r('C-06 tracking rows left', format('select count(*)::text from public.moim_retention_archived_participants where moim_id = %L', pg_temp.id('M1')));
-- C-07 dropped / new objects
select pg_temp.r('C-07 post_visible_to exists', $q$select count(*)::text from pg_proc where proname = 'moim_post_visible_to'$q$);
select pg_temp.r('C-07 fk index count', $q$select count(*)::text from pg_indexes where schemaname = 'public' and indexname like 'idx_moim%_fk'$q$);
