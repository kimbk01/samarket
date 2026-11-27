#!/bin/bash
S=$1
Q="/opt/homebrew/opt/postgresql@17/bin/psql -h 127.0.0.1 -p 55432 -U postgres -d v -X -A -t"
$Q -q <<'SQL'
insert into public.moim_categories (id, slug, label_ko, label_en, sort_order, is_active, is_restricted, allow_custom_topic)
values ('11111111-0000-0000-0000-000000000001', 'sports', '운동', 'Sports', 1, true, false, false) on conflict do nothing;
insert into public.profiles (id, nickname, phone_verified) values ('cccccccc-0000-0000-0000-000000000001', 'c1', true) on conflict do nothing;
insert into public.user_addresses (user_id, canonical_lgu_id, is_default_master, is_active) values ('cccccccc-0000-0000-0000-000000000001', '1381300000', true, true);
SQL
P='{"name":"Same Name","intro":"intro text ok 12","category_id":"11111111-0000-0000-0000-000000000001","nickname":"c"}'
( $Q -c "begin; select 'A '||coalesce(public.moim_create('cccccccc-0000-0000-0000-000000000001', '$P')->>'ok','?'); select pg_sleep(2); commit;" 2>&1 | grep -vE "^BEGIN|^COMMIT|^$" ) &
sleep 0.5
( $Q -c "select 'B '||coalesce(public.moim_create('cccccccc-0000-0000-0000-000000000001', '$P')->>'ok','?');" 2>&1 | sed 's/^.*\(moim_[a-z_]*\).*$/B ERROR \1/' ) &
wait
$Q -c "select 'active same-name moims = '||count(*) from public.moims where name='Same Name' and status='active'"
