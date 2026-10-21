#!/usr/bin/env bash
# Isolated DB test runner for stage 3-C coupons (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/stage3-3c/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
#   (cluster.sh start|stop manages /var/tmp/samarket_pgiso_3c on port 55454)
# Loads the fixture (production table shapes), checks the base has no 3-C objects (= production), applies the 3-C
# migration twice (idempotent), runs assertions and two-session race checks.
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_stage3_3c}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
MIG="$ROOT/supabase/migrations/20270604130000_stage3_3c_coupon_state_reissue_idempotency.sql"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/02_base.test.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG"
"${PSQL[@]}" -d "$DB" -f "$MIG"
echo "PASS migration idempotent (applied twice)"
"${PSQL[@]}" -d "$DB" -f "$HERE/10_stage3_3c.test.sql"
echo "new md5(prosrc):"
"${PSQL[@]}" -d "$DB" -At -c "SELECT proname || ' ' || md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'store_coupon_campaigns_auto_end_expired'"

S="aaaaaaaa-0000-0000-0000-000000000001"
q() { "${PSQL[@]}" -d "$DB" -At -c "$1"; }
newc() { q "INSERT INTO store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at, lifecycle_state, is_active) VALUES ('$S', 'race', 'fixed_amount', 50, $1, $2, '$3', $4) RETURNING id" | head -1; }

# Race 1: two auto end runs at once -> SKIP LOCKED; each due row ended (and audited) exactly once.
R1=$(newc "'2026-10-21 00:00:00+00'" "now() - interval '1 second'" active true)
R2=$(newc "'2026-10-21 00:00:00+00'" "now() - interval '1 second'" active true)
( "${PSQL[@]}" -d "$DB" -c "BEGIN; SET LOCAL ROLE service_role; SELECT public.store_coupon_campaigns_auto_end_expired(500); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
B=$(q "SET ROLE service_role; SELECT public.store_coupon_campaigns_auto_end_expired(500)::text" | tail -1)
wait $A
NA=$(q "SELECT count(*) FROM coupon_audit_events WHERE action='system_auto_end' AND campaign_id IN ('$R1','$R2')")
ST=$(q "SELECT string_agg(lifecycle_state, ',' ORDER BY id) FROM store_coupon_campaigns WHERE id IN ('$R1','$R2')")
echo "race auto-end x2: second=$B audits=$NA states=$ST"
case "$B" in *'"ended": 0'*) ;; *) echo "FAIL race 1: second run should skip locked rows"; exit 1;; esac
[ "$NA" = "2" ] && [ "$ST" = "ended,ended" ] || { echo "FAIL race 1 state"; exit 1; }

# Race 2: admin pause holds the row (A); owner pause CAS (B) waits, re-checks lifecycle/is_active -> 0 rows;
# owner resume CAS afterwards also 0 rows because paused_by = admin.
P1=$(newc "now() - interval '1 day'" "now() + interval '9 days'" active true)
( "${PSQL[@]}" -d "$DB" -c "BEGIN; UPDATE store_coupon_campaigns SET lifecycle_state='paused', is_active=false, paused_by='admin' WHERE id='$P1' AND lifecycle_state IN ('active','scheduled'); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
OP=$(q "UPDATE store_coupon_campaigns SET lifecycle_state='paused', is_active=false, paused_by='owner' WHERE id='$P1' AND lifecycle_state IN ('active','scheduled') AND is_active = true RETURNING id")
wait $A
OR=$(q "UPDATE store_coupon_campaigns SET lifecycle_state='active', is_active=true, paused_by=NULL WHERE id='$P1' AND lifecycle_state IN ('paused') AND (paused_by IS NULL OR paused_by='owner') RETURNING id")
PB=$(q "SELECT lifecycle_state || '/' || paused_by FROM store_coupon_campaigns WHERE id='$P1'")
echo "race admin-pause-vs-owner-pause: owner_pause='$OP' owner_resume='$OR' row=$PB"
[ -z "$OP" ] && [ -z "$OR" ] && [ "$PB" = "paused/admin" ] || { echo "FAIL race 2"; exit 1; }

# Race 3: two reissue inserts with the same form key at once -> exactly one row, the other gets unique_violation.
SRC="c0000000-0000-0000-0000-000000000004"
INS="INSERT INTO store_coupon_campaigns (store_id, title, discount_type, discount_value, start_at, end_at, source_campaign_id, client_request_id) VALUES ('$S','r','fixed_amount',50,now(),now()+interval '30 days','$SRC','race-key-0001')"
( "${PSQL[@]}" -d "$DB" -c "BEGIN; $INS; SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
OUT3=$("${PSQL[@]}" -d "$DB" -At -c "$INS" 2>&1 || true)
wait $A
N3=$(q "SELECT count(*) FROM store_coupon_campaigns WHERE source_campaign_id='$SRC' AND client_request_id='race-key-0001'")
echo "race reissue x2: second='$(echo "$OUT3" | head -1)' rows=$N3"
case "$OUT3" in *store_coupon_campaigns_reissue_request_uidx*) ;; *) echo "FAIL race 3: expected unique violation"; exit 1;; esac
[ "$N3" = "1" ] || { echo "FAIL race 3 rows"; exit 1; }

echo "ALL ISOLATED TESTS PASSED ($DB)"
