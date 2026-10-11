#!/usr/bin/env bash
# Local integration test for supabase/migrations/20270425120000_data_reset_full_system.sql.
# Runs against a throwaway Postgres (default: unix socket /tmp, port 54329). Never point it at Supabase.
#   PGHOST=/tmp PGPORT=54329 bash scripts/data-reset-local-test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
case "$PGHOST" in *supabase*|*amazonaws*) echo "refusing remote host"; exit 2;; esac
P="psql -X -q -t -A -v ON_ERROR_STOP=1"
T=supabase/tests/data-reset
MIG=supabase/migrations/20270425120000_data_reset_full_system.sql
A1=a0000000-0000-0000-0000-000000000001; A2=a0000000-0000-0000-0000-000000000002; X1=a0000000-0000-0000-0000-000000000003
PASS=0; FAILS=0; DB=""
ok(){ PASS=$((PASS+1)); echo "  PASS  $1"; }
bad(){ FAILS=$((FAILS+1)); echo "  FAIL  $1"; }
q(){ $P -d "$DB" -c "$1" 2>&1; }                                   # as postgres (checks)
sr(){ $P -d "$DB" -c "set role service_role; $1" 2>&1; }          # as service_role (what the server uses)
eq(){ if [ "$1" == "$2" ]; then ok "$3"; else bad "$3 (expected '$2', got '$1')"; fi; }
err(){ local out; out=$(sr "$1"); if echo "$out" | grep -q "$2"; then ok "$3"; else bad "$3 (wanted error '$2', got '$out')"; fi; }
MANIFEST=$(python3 -c 'import json,sys;print(json.dumps(json.load(open(sys.argv[1]))))' $T/manifest.fixture.json | sed "s/'/''/g")

echo "== build fixture database"
$P -d postgres -c "drop database if exists drfix" -c "drop database if exists dra" -c "drop database if exists drb" -c "drop database if exists drrestore" -c "create database drfix" >/dev/null
for f in $T/00_supabase_stubs.sql $T/10_fixture_schema.sql $T/20_fixture_data.sql $MIG; do
  $P -d drfix -f "$f" >/dev/null 2>&1 || { echo "apply failed: $f"; $P -d drfix -f "$f"; exit 1; }
done
$P -d postgres -c "create database dra template drfix" -c "create database drb template drfix" >/dev/null

open_window(){ # $1 requester $2 approver → prints window id
  local w; w=$(sr "select public.data_reset_window_request('$1','QA reset test window','local:$DB')")
  sr "select 1 from public.data_reset_window_decide('$w','$2',true,60)" >/dev/null; echo "$w"; }

########################################################################################################
DB=dra
echo "== [1] privileges and lock bypass (server lock, two-person rule)"
eq "$(q "select has_function_privilege('anon','public.data_reset_full_execute_batch(uuid,integer)','execute')")" f "anon cannot execute batch"
eq "$(q "select has_function_privilege('authenticated','public.data_reset_full_start_run(uuid,uuid)','execute')")" f "authenticated cannot start run"
eq "$(q "select has_function_privilege('authenticated','public.data_reset_window_decide(uuid,uuid,boolean,integer)','execute')")" f "authenticated cannot open window"
eq "$(q "select has_table_privilege('authenticated','public.data_reset_plans','select')")" f "authenticated cannot read plans"
eq "$(q "select has_table_privilege('service_role','public.data_reset_plan_targets','update')")" f "service_role cannot edit targets directly"
eq "$(q "select has_table_privilege('service_role','public.data_reset_audit_events','delete')")" f "audit log not deletable by service_role"
err "select public.data_reset_plan_create(gen_random_uuid(),'$A1','x','{}')" "window_not_open" "plan without open window refused"
W=$(sr "select public.data_reset_window_request('$A1','QA reset test window','local:dra')")
err "select public.data_reset_window_request('$A2','second window','local')" "window_already_active" "only one active window"
err "select public.data_reset_window_decide('$W','$A1',true,60)" "two_person_rule_violated" "requester cannot approve own window"
sr "select 1 from public.data_reset_window_decide('$W','$A2',true,60)" >/dev/null
eq "$(sr "select status from public.data_reset_windows where id='$W'")" open "second admin opens window"

echo "== [2] dry-run accuracy"
PLAN=$(sr "select public.data_reset_plan_create('$W','$A1','fixture-1','$MANIFEST'::jsonb)")
SUMMARY=$(sr "select public.data_reset_full_build_plan('$PLAN')")
echo "$SUMMARY" | grep -q planHash && ok "plan built" || { bad "plan build: $SUMMARY"; }
row(){ sr "select (summary->'tables'->'$1'->>'delete') || '/' || (summary->'tables'->'$1'->>'keep') from public.data_reset_plans where id='$PLAN'"; }
eq "$(row posts)" "6005/9" "posts: 6005 delete (T1 6000 + T2 10 − 5 referenced) / 9 keep"
eq "$(row profiles)" "2/9" "profiles: T2,T3 delete; T1,T4 kept (orders FK) + 7 non-testers"
eq "$(row post_images)" "20/2" "post_images: follow tester posts; real + orphan kept"
eq "$(row comments)" "2/3" "comments: tester root answered by real member kept"
eq "$(row favorites)" "2/1" "favorites (composite PK)"
eq "$(row chat_rooms)" "1/1" "chat_rooms: tester-only room"
eq "$(row chat_messages)" "2/2" "chat_messages: tester message in real member room kept (followParents)"
eq "$(row stores)/$(row store_products)/$(row store_fee_policies)" "1/1/1/1/1/2" "stores / products / fee SPLIT (platform row kept)"
eq "$(row audit_logs)" "1/2" "audit_logs SPLIT + admin actor not owner"
eq "$(row ad_impressions)/$(row lookup_children)" "1/2/0/1" "soft-ref owner-less + lookup-only kept"
eq "$(row browse_snapshots)/$(row backfill_nopk)" "3/0/0/2" "wholesale deleted / no-PK kept"
eq "$(row reports)/$(row sanctions)/$(row orders)/$(row order_items)/$(row point_ledger)" "0/2/0/1/0/2/0/1/0/2" "evidence + money kept"
eq "$(row test_users)/$(row users)/$(row favorite_audit_log)" "1/0/1/1/1/1" "ownerInclude (test_users.id, users.id, text user_id)"
eq "$(row categories)/$(row settings)/$(row admin_memberships)/$(row unresolved_things)" "0/2/0/1/0/3/0/1" "KEEP / UNRESOLVED untouched"
eq "$(sr "select summary->>'deleteRows' from public.data_reset_plans where id='$PLAN'")" 6045 "total planned deletions"
eq "$(sr "select summary->'accounts'->>'TESTER' || ',' || (summary->>'authTargets') || ',' || (summary->>'storageTargets') from public.data_reset_plans where id='$PLAN'")" "4,4,32" "accounts / auth / storage targets"
eq "$(sr "select reason from public.data_reset_plan_targets where plan_id='$PLAN' and table_name='posts' and row_key='10000000-0000-0000-0000-000000000104'")" "referenced_by_kept:reports.target_id" "kept reason recorded (soft ref)"
eq "$(q "select count(*) from public.posts")" 6014 "dry-run deleted nothing"
HASH=$(sr "select plan_hash from public.data_reset_plans where id='$PLAN'")

echo "== [1b] confirm / approve / start gates"
err "select public.data_reset_plan_confirm('$PLAN','$A1','deadbeef','backup-1')" "plan_hash_mismatch" "stale hash refused"
err "select public.data_reset_plan_confirm('$PLAN','$A1','$HASH','  ')" "backup_reference_required" "backup reference required"
sr "select public.data_reset_plan_confirm('$PLAN','$A1','$HASH','local-pgdump-dra')" >/dev/null
err "select public.data_reset_plan_approve('$PLAN','$A1','$HASH')" "two_person_rule_violated" "confirmer cannot approve"
sr "select public.data_reset_plan_approve('$PLAN','$A2','$HASH')" >/dev/null
err "select public.data_reset_full_start_run('$PLAN','$A1')" "data_reset_db_guard_locked" "no guard row → destructive refused (Production state)"
q "insert into public.data_reset_db_guard (allow_destructive, environment_label) values (true, 'local-test')" >/dev/null
err "select public.data_reset_full_start_run('$PLAN','$X1')" "actor_not_signatory" "non-signatory cannot start"

echo "== [11] backup before run (pg_dump → restore → counts)"
pg_dump -d dra -Fc -f /tmp/dra_before.dump && $P -d postgres -c "create database drrestore" >/dev/null && pg_restore -d drrestore /tmp/dra_before.dump >/dev/null 2>&1
eq "$($P -d drrestore -c "select (select count(*) from public.posts)||','||(select count(*) from auth.users)||','||(select count(*) from public.data_reset_plan_targets)")" "$(q "select (select count(*) from public.posts)||','||(select count(*) from auth.users)||','||(select count(*) from public.data_reset_plan_targets)")" "restore reproduces pre-run state"

RUN=$(sr "select public.data_reset_full_start_run('$PLAN','$A1')")
err "select public.data_reset_full_start_run('$PLAN','$A2')" "plan_not_approved" "second start refused (no double execution)"

echo "== [9] new report / order / comment arrive after planning"
q "insert into public.reports (reporter_id, target_id, reason) values ('c0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000500','new')" >/dev/null
q "insert into public.order_items (order_id, post_id, qty) values ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000501',1)" >/dev/null
q "insert into public.comments (post_id, user_id, body) values ('10000000-0000-0000-0000-000000000502','c0000000-0000-0000-0000-000000000002','new real comment')" >/dev/null

echo "== [10] failure mid-step rolls back, resume continues"
q "create table public._boom(on_ boolean); insert into public._boom values (true);
   create function public._boom_fn() returns trigger language plpgsql as \$\$ begin if (select on_ from public._boom) then raise exception 'injected_failure'; end if; return old; end \$\$;
   create trigger _boom before delete on public.favorites for each row execute function public._boom_fn();" >/dev/null
FAILED_ONCE=0
echo "== [8] concurrent batch is refused while another holds the run lock"
( $P -d dra -c "begin; select pg_advisory_xact_lock(hashtext('dibay_data_reset_full_run')); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
sleep 1
eq "$(sr "select public.data_reset_full_execute_batch('$RUN',1000)->>'busy'")" true "parallel batch → busy, nothing deleted"
wait

echo "== [3] batch loop (limit 1000) over > 5,000 rows"
CALLS=0
while :; do
  CALLS=$((CALLS+1)); [ $CALLS -gt 200 ] && { bad "batch loop did not finish"; break; }
  OUT=$(sr "select public.data_reset_full_execute_batch('$RUN',1000)")
  if echo "$OUT" | grep -q injected_failure; then
    FAILED_ONCE=1
    eq "$(sr "select count(*) from public.data_reset_plan_targets where plan_id='$PLAN' and table_name='favorites' and status='target'")" 2 "failed batch left favorites targets intact (rolled back)"
    eq "$(q "select count(*) from public.favorites")" 3 "failed batch deleted nothing"
    q "update public._boom set on_ = false" >/dev/null; continue
  fi
  echo "$OUT" | grep -q '"dbDone": true' && break
  echo "$OUT" | grep -q '"table"' || { bad "unexpected batch result: $OUT"; break; }
done
eq "$FAILED_ONCE" 1 "injected failure observed and resumed"
eq "$(sr "select deleted||'/'||planned||'/'||skipped||'/'||status from public.data_reset_run_steps where run_id='$RUN' and table_name='posts'")" "6002/6005/3/partial" "posts: 6002 deleted in batches, 3 protected at execution"
eq "$(sr "select string_agg(reason, ',' order by row_key) from public.data_reset_plan_targets where plan_id='$PLAN' and table_name='posts' and reason like 'referenced_at_execution%'")" "referenced_at_execution:reports,referenced_at_execution:order_items,referenced_at_execution:comments" "new report/order/comment protect their posts"
eq "$(q "select count(*) from public.posts")" 12 "posts left = 9 kept + 3 newly referenced + admin/system"
q "drop trigger _boom on public.favorites; drop table public._boom; drop function public._boom_fn()" >/dev/null

echo "== [7] storage phase (Storage API simulated by deleting storage.objects rows)"
while :; do
  CLAIM=$(sr "select public.data_reset_full_storage_claim('$RUN',10)")
  echo "$CLAIM" | grep -q '"done": true' && break
  echo "$CLAIM" | grep -q '"items"' || { bad "storage claim: $CLAIM"; break; }
  ROWS=$(echo "$CLAIM" | python3 -c 'import json,sys;[print(i["bucket"]+"|"+i["name"]) for i in json.load(sys.stdin)["items"]]')
  for b in $(echo "$ROWS" | cut -d'|' -f1 | sort -u); do
    NAMES=$(echo "$ROWS" | awk -F'|' -v b="$b" '$1==b{print $2}')
    ARR=$(echo "$NAMES" | sed "s/.*/'&'/" | paste -sd, -)
    q "delete from storage.objects where bucket_id='$b' and name in ($ARR)" >/dev/null
    sr "select public.data_reset_full_storage_mark('$RUN','$b',array[$ARR],null)" >/dev/null
  done
done
eq "$(q "select count(*) from storage.objects where bucket_id='post-images' and name='t1/1.jpg'")" 1 "shared image (also used by a real member post) kept"
eq "$(sr "select reason from public.data_reset_plan_storage where plan_id='$PLAN' and object_name='t1/1.jpg'")" still_referenced "shared image reason recorded"
eq "$(sr "select string_agg(status||':'||n, ',' order by status) from (select status, count(*) n from public.data_reset_plan_storage where plan_id='$PLAN' group by 1) q")" "deleted:31,excluded:2" "storage: 31 removed, 2 excluded (shared, missing)"
eq "$(q "select count(*) from storage.objects where name like 'r1/%' or name like 'orphan/%'")" 3 "real member + orphan objects untouched"

echo "== [5] auth phase"
AOUT=$(sr "select public.data_reset_full_auth_batch('$RUN',50)")
echo "$AOUT" | grep -q '"authDone": true' && ok "auth phase finished" || bad "auth: $AOUT"
eq "$(sr "select string_agg(user_id::text||'='||status, ',' order by user_id) from public.data_reset_plan_auth where plan_id='$PLAN'")" \
   "b0000000-0000-0000-0000-000000000001=excluded,b0000000-0000-0000-0000-000000000002=deleted,b0000000-0000-0000-0000-000000000003=deleted,b0000000-0000-0000-0000-000000000004=excluded" \
   "T2,T3 deleted; T1,T4 kept (still referenced by kept rows)"
eq "$(sr "select reason from public.data_reset_plan_auth where plan_id='$PLAN' and user_id='b0000000-0000-0000-0000-000000000004'")" "still_referenced:orders.buyer_id,profiles.id" "T4 blocker recorded"
eq "$(q "select count(*) from auth.users")" 9 "auth users: 11 − 2"
eq "$(q "select count(*) from auth.sessions where user_id in ('b0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000003')")" 0 "deleted accounts' sessions gone"

echo "== [12] verification + finish"
FIN=$(sr "select public.data_reset_full_finish_run('$RUN','$A1',null)")
echo "$FIN" | grep -q '"ok": true' && ok "verify ok (no deleted rows present, counts reconcile, no kept table shrank)" || bad "verify: $FIN"
eq "$(echo "$FIN" | python3 -c 'import json,sys;print(json.load(sys.stdin)["status"])')" partial "outcome partial (3 rows protected at execution) — not reported as completed"
eq "$(q "select (select count(*) from public.orders)||','||(select count(*) from public.order_items)||','||(select count(*) from public.point_ledger)||','||(select count(*) from public.reports)||','||(select count(*) from public.sanctions)")" "2,2,2,3,1" "orders / items / ledger / reports / sanctions preserved"
eq "$(q "select count(*) from public.order_items where post_id is null")" 0 "no SET NULL cascade hit kept order_items"
eq "$(q "select count(*) from public.reports r where r.target_id is not null and not exists (select 1 from public.posts p where p.id=r.target_id) and r.target_id::text like '1000%'")" 0 "no report points at a deleted post"
eq "$(q "select count(*) from public.profiles")" 9 "profiles: 11 − 2"
eq "$(q "select count(*) from public.posts where user_id in ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001') or user_id is null")" 4 "real/admin/system posts intact"
eq "$(q "select count(*) from public.chat_messages")" 2 "real room messages intact"
eq "$(q "select count(*) from public.store_fee_policies where store_id is null")" 1 "platform fee policy intact"

echo "== [13] automatic re-lock"
eq "$(sr "select status||':'||close_reason from public.data_reset_windows where id='$W'")" "closed:run_partial" "window closed by run end"
err "select public.data_reset_full_execute_batch('$RUN',10)" "run_not_running" "finished run cannot execute"
err "select public.data_reset_plan_create('$W','$A1','x','{}')" "window_not_open" "no new plan on closed window"
eq "$(sr "select string_agg(action, ',' order by id) from public.data_reset_audit_events")" \
   "window_requested,window_opened,plan_created,plan_built,plan_confirmed,plan_approved,run_started,db_phase_done,storage_phase_done,auth_phase_done,run_finished" "audit trail complete and ordered"
err "delete from public.data_reset_audit_events" "permission denied" "audit trail not deletable"
eq "$($P -d dra -c "update public.data_reset_audit_events set action='x'" 2>&1 | grep -c append_only)" 1 "audit trail immutable even for owner"

########################################################################################################
DB=drb
echo "== [13b] window expiry during a run → abort + re-lock (fresh fixture)"
q "insert into public.data_reset_db_guard (allow_destructive, environment_label) values (true, 'local-test')" >/dev/null
W=$(open_window $A2 $A1)
PLAN=$(sr "select public.data_reset_plan_create('$W','$A2','fixture-1','$MANIFEST'::jsonb)"); sr "select public.data_reset_full_build_plan('$PLAN')" >/dev/null
HASH=$(sr "select plan_hash from public.data_reset_plans where id='$PLAN'")
sr "select public.data_reset_plan_confirm('$PLAN','$A2','$HASH','local')" >/dev/null; sr "select public.data_reset_plan_approve('$PLAN','$A1','$HASH')" >/dev/null
RUN=$(sr "select public.data_reset_full_start_run('$PLAN','$A1')")
sr "select public.data_reset_full_execute_batch('$RUN',500)" >/dev/null
q "update public.data_reset_windows set open_until = now() - interval '1 second' where id='$W'" >/dev/null
eq "$(sr "select public.data_reset_full_execute_batch('$RUN',500)->>'abort'")" true "expired window stops execution"
FIN=$(sr "select public.data_reset_full_finish_run('$RUN','$A1',null)")
eq "$(echo "$FIN" | python3 -c 'import json,sys;print(json.load(sys.stdin)["status"])')" aborted "run recorded as aborted"
eq "$(sr "select status from public.data_reset_windows where id='$W'")" expired "window expired (locked)"
echo "$FIN" | grep -q '"ok": true' && ok "partial deletions before abort reconcile (verify ok)" || bad "verify after abort: $FIN"

echo "== [4] manifest drift is fail-closed"
q "create table public.new_unclassified (id bigserial primary key, user_id uuid)" >/dev/null
W=$(open_window $A1 $A2)
PLAN=$(sr "select public.data_reset_plan_create('$W','$A1','fixture-1','$MANIFEST'::jsonb)")
err "select public.data_reset_full_build_plan('$PLAN')" "manifest_missing_tables: new_unclassified" "unclassified table blocks planning"
sr "select public.data_reset_window_close('$W','$A1','test done')" >/dev/null
eq "$(sr "select status from public.data_reset_plans where id='$PLAN'")" expired "plan expires when window closes"

echo
echo "RESULT: $PASS passed, $FAILS failed"
[ $FAILS -eq 0 ]
