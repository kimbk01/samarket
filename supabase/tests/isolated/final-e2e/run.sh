#!/usr/bin/env bash
# Final ND-3 isolated-DB WRITE regression (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/final-e2e/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
#   (cluster.sh start|stop manages /var/tmp/samarket_pgiso_final on port 55470)
# Output: one line per assertion - PASS <id> / NOT_PROVEN <id>: <reason> / FAIL <id> (exit non-zero on FAIL),
# plus the md5(prosrc) table production vs fixture.
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_final_e2e}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
# NOTICE 'PASS x' -> 'PASS x'; ERROR 'FAIL x' -> 'FAIL x'
clean() { sed -u -E 's/^psql:[^ ]+ (NOTICE|ERROR|WARNING):  /\1: /; s/^NOTICE: //; s/^ERROR: (FAIL .*)/\1/'; }
load() { "${PSQL[@]}" -d "$DB" -f "$1" 2>&1 | clean; return "${PIPESTATUS[0]}"; }

load "$HERE/00_fixture.sql"
load "$HERE/01_prod_functions.sql"
load "$HERE/02_triggers_rls_grants.sql"
load "$HERE/03_seed_and_helpers.sql"

# ---------------------------------------------------------------- md5(prosrc) production vs fixture
echo "== md5(prosrc) production vs fixture"
LOCAL_MD5=$("${PSQL[@]}" -d "$DB" -At -F' ' -c "SELECT CASE WHEN n.nspname = 'public' THEN p.proname ELSE n.nspname || '.' || p.proname END, md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('public','auth','internal') AND p.proname NOT LIKE 't\_%' ORDER BY 1")
MD5_MISMATCH=0
while read -r name pm; do
  lm=$(printf '%s\n' "$LOCAL_MD5" | awk -v n="$name" '$1 == n {print $2}')
  if [ "$lm" = "$pm" ]; then st=MATCH; else st=MISMATCH; MD5_MISMATCH=1; fi
  printf '%-52s prod=%s fixture=%s %s\n' "$name" "$pm" "${lm:-<missing>}" "$st"
  [ "$st" = MATCH ] || echo "NOT_PROVEN md5:$name: fixture body differs from production"
done < "$HERE/prod_md5.txt"
[ "$MD5_MISMATCH" = 0 ] && echo "PASS md5_all_functions_equal_production"

# ---------------------------------------------------------------- single-session scenario
echo "== scenario"
load "$HERE/10_e2e.test.sql"

# ---------------------------------------------------------------- two-session races
echo "== concurrency"
SR="SET ROLE service_role; SET request.jwt.claims = '{\"role\":\"service_role\"}';"
q() { "${PSQL[@]}" -d "$DB" -At -c "$SR $1" | tail -n 1; }
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1: $2"; exit 1; }
S="aaaaaaaa-0000-0000-0000-000000000001"
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
OWNER="11111111-1111-1111-1111-111111111111"
BUYER="33333333-3333-3333-3333-333333333333"

# C2.3 two owner sessions reject the same pending order (A2: coupon + gift re-used after A's restore)
A2=$(q "SELECT t_set('A2', ((t_create('nd3-A2', 2, 'local_delivery', true, 'ffffffff-0000-0000-0000-000000000001'))->'order'->>'id')::uuid)")
[ -n "$A2" ] || fail C2.3 "order A2 not created"
( "${PSQL[@]}" -d "$DB" -At -c "BEGIN; $SR SELECT store_order_owner_cancel_atomic('$A2','$S','$OWNER','pending','sold out (A)',null); SELECT pg_sleep(2); COMMIT;" > "$TMPD/a2.out" ) &
BG=$!
sleep 0.5
R2=$(q "SELECT store_order_owner_cancel_atomic('$A2','$S','$OWNER','pending','sold out (B)',null)::text")
wait $BG
R1=$(grep -m1 '^{' "$TMPD/a2.out" || true); rm -f "$TMPD/a2.out"
NREQ=$(q "SELECT count(*) FROM store_order_cancel_requests WHERE order_id='$A2'")
REASON=$(q "SELECT reason FROM store_order_cancel_requests WHERE order_id='$A2'")
CST=$(q "SELECT status FROM coupon_user_entitlements WHERE id='dddddddd-0000-0000-0000-000000000001'")
GST=$(q "SELECT status || ':' || remaining_balance FROM gift_certificate_instances WHERE id='ffffffff-0000-0000-0000-000000000001'")
NREV=$(q "SELECT count(*) FROM gift_certificate_ledger WHERE entry_type='REDEEM_REVERSE' AND related_id IN (SELECT id::text FROM gift_certificate_redemptions WHERE order_id='$A2')")
case "$R1" in *'"ok": true'*) ;; *) fail C2.3 "first session did not win: $R1";; esac
case "$R2" in *transition_conflict*) ;; *) fail C2.3 "second session not refused: $R2";; esac
[ "$NREQ" = 1 ] && [ "$REASON" = "sold out (A)" ] && [ "$CST" = restored ] && [ "$GST" = "ACTIVE:300" ] && [ "$NREV" = 1 ] \
  || fail C2.3 "state req=$NREQ reason=$REASON coupon=$CST gift=$GST reverse=$NREV"
pass "C2.3 concurrent owner reject: exactly one wins, 1 ledger row, coupon/gift restored once"

# C6.3 decide-approve (holds the locks) vs owner direct cancel on the same cancel_requested order
mk_req() {
  local k="$1"
  local id
  id=$(q "SELECT t_set('$k', ((t_create('nd3-$k', 1, 'pickup', false, null))->'order'->>'id')::uuid)")
  q "UPDATE store_orders SET order_status='accepted' WHERE id='$id'" >/dev/null
  q "SELECT store_order_buyer_cancel_request_atomic('$id','$BUYER','accepted','changed mind')" >/dev/null
  echo "$id"
}
C3=$(mk_req C3)
( "${PSQL[@]}" -d "$DB" -At -c "BEGIN; $SR SELECT store_order_cancel_request_decide_atomic('$C3','$S','$OWNER','owner','cancel_requested','approve',null,null,null); SELECT pg_sleep(2); COMMIT;" > "$TMPD/c3.out" ) &
BG=$!
sleep 0.5
RB=$(q "SELECT store_order_cancel_direct_atomic('$C3','cancel_requested','cancelled','OWNER')::text")
wait $BG
RA=$(grep -m1 '^{' "$TMPD/c3.out" || true); rm -f "$TMPD/c3.out"
ST=$(q "SELECT order_status || ':' || (SELECT string_agg(status, ',') FROM store_order_cancel_requests WHERE order_id='$C3') FROM store_orders WHERE id='$C3'")
case "$RA" in *'"ok": true'*) ;; *) fail C6.3 "approve did not win: $RA";; esac
case "$RB" in *transition_conflict*) ;; *) fail C6.3 "direct cancel not refused: $RB";; esac
[ "$ST" = "cancelled:approved" ] || fail C6.3 "state $ST"
pass "C6.3 concurrent approve vs owner direct cancel: approve wins, direct cancel transition_conflict"

# C6.4 reverse order: owner direct cancel (holds the locks) vs decide-approve
C4=$(mk_req C4)
( "${PSQL[@]}" -d "$DB" -At -c "BEGIN; $SR SELECT store_order_cancel_direct_atomic('$C4','cancel_requested','cancelled','OWNER'); SELECT pg_sleep(2); COMMIT;" > "$TMPD/c4.out" ) &
BG=$!
sleep 0.5
RB=$(q "SELECT store_order_cancel_request_decide_atomic('$C4','$S','$OWNER','owner','cancel_requested','approve',null,null,null)::text")
wait $BG
RA=$(grep -m1 '^{' "$TMPD/c4.out" || true); rm -f "$TMPD/c4.out"
ST=$(q "SELECT order_status || ':' || (SELECT string_agg(status || '/' || refund_status, ',') FROM store_order_cancel_requests WHERE order_id='$C4') FROM store_orders WHERE id='$C4'")
case "$RA" in *'"ok": true'*) ;; *) fail C6.4 "direct cancel did not win: $RA";; esac
case "$RB" in *transition_conflict*) ;; *) fail C6.4 "approve not refused: $RB";; esac
case "$ST" in cancelled:*) ;; *) fail C6.4 "state $ST";; esac
pass "C6.4 concurrent owner direct cancel vs approve: direct cancel wins, approve transition_conflict"
echo "INFO C6.4 cancel request ledger after direct cancel of a cancel_requested order: $ST"

echo "== done ($DB)"
