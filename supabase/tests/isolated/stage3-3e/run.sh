#!/usr/bin/env bash
# Isolated DB test runner for stage 3-E (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/stage3-3e/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
#   (cluster.sh start|stop manages /var/tmp/samarket_pgiso_3e on port 55457)
# Loads the fixture (production table definitions for store_menu_sections), checks the base (function and
# column absent, as on production), applies the 3-E migration twice (re-runnable), runs assertions and
# two-session race checks.
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_stage3_3e}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
MIG="$ROOT/supabase/migrations/20270604160000_stage3_3e_menu_section_reorder_product_client_request_id.sql"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/01_base_check.test.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG"
"${PSQL[@]}" -d "$DB" -f "$MIG"
"${PSQL[@]}" -d "$DB" -f "$HERE/10_stage3_3e.test.sql"
NEWMD5=$("${PSQL[@]}" -d "$DB" -At -c "SELECT md5(prosrc) FROM pg_proc WHERE proname = 'reorder_store_menu_sections'")
echo "new md5(prosrc): reorder_store_menu_sections $NEWMD5"
grep -q "EXPECTED_MD5 reorder_store_menu_sections = $NEWMD5" "$MIG" || { echo "FAIL migration header md5 mismatch"; exit 1; }
if LC_ALL=C grep -nP '[^\x00-\x7F]' "$MIG"; then echo "FAIL migration is not ASCII"; exit 1; fi

S="aaaaaaaa-0000-0000-0000-000000000001"
A="5ec00000-0000-0000-0000-000000000001"; B="5ec00000-0000-0000-0000-000000000002"; C="5ec00000-0000-0000-0000-000000000003"
q() { "${PSQL[@]}" -d "$DB" -At -c "SET ROLE service_role" -c "$1"; }

# Race 1: two concurrent reorders of the same store. A holds the section locks; B waits, then applies its own
# order on top. Final state = B's full order (never a mix of A and B).
( "${PSQL[@]}" -d "$DB" -c "BEGIN; SET ROLE service_role; SELECT public.reorder_store_menu_sections('$S', ARRAY['$A','$B','$C']::uuid[]); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
P=$!
sleep 0.5
q "SELECT public.reorder_store_menu_sections('$S', ARRAY['$C','$B','$A']::uuid[])" >/dev/null
wait $P
ORD=$(q "SELECT string_agg(name || '=' || sort_order, ',' ORDER BY sort_order) FROM store_menu_sections WHERE store_id='$S'")
echo "race reorder-vs-reorder: $ORD"
[ "$ORD" = "C=0,B=1,A=2" ] || { echo "FAIL race 1"; exit 1; }

# Race 2: an old-path single-section PATCH holds a row lock; the reorder waits and its full order wins after it.
( "${PSQL[@]}" -d "$DB" -c "BEGIN; UPDATE store_menu_sections SET sort_order = 7 WHERE id = '$A'; SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
P=$!
sleep 0.5
q "SELECT public.reorder_store_menu_sections('$S', ARRAY['$A','$B','$C']::uuid[])" >/dev/null
wait $P
ORD2=$(q "SELECT string_agg(name || '=' || sort_order, ',' ORDER BY sort_order) FROM store_menu_sections WHERE store_id='$S'")
echo "race patch-vs-reorder: $ORD2"
[ "$ORD2" = "A=0,B=1,C=2" ] || { echo "FAIL race 2"; exit 1; }

# Race 3: same client_request_id inserted by two sessions (double tap). Exactly one row.
( "${PSQL[@]}" -d "$DB" -c "BEGIN; INSERT INTO store_products (store_id, title, client_request_id) VALUES ('$S', 'tap-1', 'race-key-0001'); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
P=$!
sleep 0.5
OUT3=$("${PSQL[@]}" -d "$DB" -At -c "INSERT INTO store_products (store_id, title, client_request_id) VALUES ('$S', 'tap-2', 'race-key-0001')" 2>&1 || true)
wait $P
N3=$(q "SELECT count(*) FROM store_products WHERE store_id='$S' AND client_request_id='race-key-0001'")
echo "race double-tap insert: rows=$N3"
case "$OUT3" in *store_products_store_client_request_id_key*) ;; *) echo "FAIL race 3: expected unique violation, got: $OUT3"; exit 1;; esac
[ "$N3" = "1" ] || { echo "FAIL race 3 rows"; exit 1; }

echo "ALL ISOLATED TESTS PASSED ($DB)"
