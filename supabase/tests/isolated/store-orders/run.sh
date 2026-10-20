#!/usr/bin/env bash
# Isolated DB test runner (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/store-orders/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
# Creates a fresh database, loads the fixture + the two migrations under test, runs assertions,
# then runs two-session concurrency checks (courier pickup vs owner direct cancel).
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_store_orders_ord06}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/05_dlv02_legacy_rows.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270602120000_store_order_cancel_ledger_atomic.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270602120100_store_order_deliveries_status_check.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/10_ord06_cancel_ledger_atomic.test.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/20_dlv02_status_check.test.sql"

S="aaaaaaaa-0000-0000-0000-000000000001"
OWNER="11111111-1111-1111-1111-111111111111"
BUYER="33333333-3333-3333-3333-333333333333"

# Concurrency 1: session A dispatches (delivery -> pickup_in_progress) and holds its TX open;
# session B calls owner cancel meanwhile. B must block on the delivery row lock, then see the pickup
# and return picked_up (a picked-up order is never cancelled by the owner).
OID=$("${PSQL[@]}" -d "$DB" -At -c "SELECT public.t_new_order('ready_for_pickup')")
"${PSQL[@]}" -d "$DB" -c "INSERT INTO store_order_deliveries(order_id, store_id, buyer_user_id, delivery_status) VALUES ('$OID','$S','$BUYER','rider_assigned')"
( "${PSQL[@]}" -d "$DB" -c "BEGIN; UPDATE store_order_deliveries SET delivery_status='pickup_in_progress' WHERE order_id='$OID'; SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES=$("${PSQL[@]}" -d "$DB" -At -c "SET test.jwt_role='service_role'" -c "SELECT public.store_order_owner_cancel_atomic('$OID','$S','$OWNER','ready_for_pickup','late',null)::text")
wait $A
ST=$("${PSQL[@]}" -d "$DB" -At -c "SELECT order_status FROM store_orders WHERE id='$OID'")
echo "concurrency pickup-vs-cancel: rpc=$RES order_status=$ST"
case "$RES" in *picked_up*) ;; *) echo "FAIL concurrency 1: expected picked_up"; exit 1;; esac
[ "$ST" = "ready_for_pickup" ] || { echo "FAIL concurrency 1: order changed"; exit 1; }

# Concurrency 2: owner cancel commits while holding the order lock; a dispatch attempt waits, then is
# refused by the pickup trigger because the order is no longer dispatchable.
OID2=$("${PSQL[@]}" -d "$DB" -At -c "SELECT public.t_new_order('ready_for_pickup')")
"${PSQL[@]}" -d "$DB" -c "INSERT INTO store_order_deliveries(order_id, store_id, buyer_user_id, delivery_status) VALUES ('$OID2','$S','$BUYER','rider_assigned')"
( "${PSQL[@]}" -d "$DB" -c "BEGIN; SET LOCAL test.jwt_role='service_role'; SELECT public.store_order_owner_cancel_atomic('$OID2','$S','$OWNER','ready_for_pickup','sold out',null); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
B=$!
sleep 0.5
set +e
OUT=$("${PSQL[@]}" -d "$DB" -c "UPDATE store_order_deliveries SET delivery_status='pickup_in_progress' WHERE order_id='$OID2'" 2>&1)
RC=$?
set -e
wait $B
echo "concurrency cancel-vs-pickup: rc=$RC $OUT"
case "$OUT" in *order_status_blocks_dispatch:cancelled*) ;; *) echo "FAIL concurrency 2"; exit 1;; esac
echo "ALL ISOLATED TESTS PASSED ($DB)"
