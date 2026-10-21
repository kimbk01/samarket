#!/usr/bin/env bash
# Isolated DB test runner for stage 2-A (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/stage2-2a/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
# Creates a fresh database, loads the fixture + verbatim production base bodies (md5-checked), reproduces
# the FIN-02 defect on the production body, applies the 2-A migrations, runs assertions, then two-session
# concurrency / duplicate checks.
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_stage2_2a}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
MIG="$ROOT/supabase/migrations"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
# UTF8 like production (E'\uXXXX' literals need a UTF8 server encoding).
createdb -h "$HOST" -p "$PORT" -U postgres -E UTF8 -T template0 --locale=C "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/05_prod_base.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/06_prod_grants.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/07_stage2b_integrity_base.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/01_helpers.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/08_base_md5_and_defect_repro.test.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/09_legacy_rows.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603110000_stage2a_fin02_fin12_sale_fee_settle.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603110100_stage2a_fin04_cash_charge_request_evidence.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603110200_stage2a_fin08_admin_balance_correction.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603110300_stage2a_fin11_store_cash_position_open_count.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603125000_stage2a_fin08_integrity_d5_legacy.sql"
# Every migration is re-runnable (CREATE OR REPLACE / IF NOT EXISTS / DROP IF EXISTS).
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603110000_stage2a_fin02_fin12_sale_fee_settle.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603110100_stage2a_fin04_cash_charge_request_evidence.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603110200_stage2a_fin08_admin_balance_correction.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603110300_stage2a_fin11_store_cash_position_open_count.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603125000_stage2a_fin08_integrity_d5_legacy.sql"
"${PSQL[@]}" -d "$DB" -c "DO \$\$ DECLARE r record; BEGIN FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace,'internal'::regnamespace) AND p.proname IN ('settle_store_sale_fee_obligations','admin_decide_store_commission_adjustment','approve_business_cash_charge_request','owner_create_business_cash_charge_request','business_cash_charge_policy','admin_adjust_business_cash','admin_adjust_store_coin','is_platform_super_admin','store_commission_d5_legacy_cutoff','store_commission_cash_account_is_d5_legacy','store_commission_integrity_report','store_commission_enqueue_exception_notifications','store_cash_position') AND p.prosrc ~ '[^[:ascii:]]' LOOP RAISE EXCEPTION 'non-ASCII function body: %', r.f; END LOOP; RAISE NOTICE 'PASS all redefined/new function bodies are ASCII'; END \$\$;"
"${PSQL[@]}" -d "$DB" -f "$HERE/10_fin02_fin12.test.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/20_fin04.test.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/30_fin08.test.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/40_fin11.test.sql"

OWNER="11111111-1111-1111-1111-111111111111"
ADMIN="44444444-4444-4444-4444-444444444444"
STORE="aaaaaaaa-0000-0000-0000-000000000005"
"${PSQL[@]}" -d "$DB" -c "INSERT INTO stores(id, owner_user_id, store_name) VALUES ('$STORE', '$OWNER', 'Store E')"
CREATE_SQL="SELECT public.owner_create_business_cash_charge_request('$OWNER', '$STORE', 1000, 'gcash', 'REF-%s', NULL, '%s')::text"

# Concurrency 1: same idempotency key from two sessions at once (double tap / network retry) -> one request.
# Session A holds its TX open after creating; B blocks on the per-store lock, then replays the same request.
( "${PSQL[@]}" -d "$DB" -At -c "BEGIN" -c "SET LOCAL test.jwt_role='service_role'" -c "$(printf "$CREATE_SQL" C1 conc-key-1)" -c "SELECT pg_sleep(2)" -c "COMMIT" > /tmp/stage2a_c1_a.out ) &
A=$!
sleep 0.5
RB=$("${PSQL[@]}" -d "$DB" -At -c "SET test.jwt_role='service_role'" -c "$(printf "$CREATE_SQL" C1 conc-key-1)")
wait $A
CNT=$("${PSQL[@]}" -d "$DB" -At -c "SELECT count(*) FROM business_cash_charge_requests WHERE idempotency_key='conc-key-1'")
echo "concurrency same-key: A=$(grep ok /tmp/stage2a_c1_a.out) B=$RB rows=$CNT"
[ "$CNT" = "1" ] || { echo "FAIL concurrency 1: expected 1 row"; exit 1; }
case "$RB" in *'"idempotent": true'*) ;; *) echo "FAIL concurrency 1: B not idempotent"; exit 1;; esac
"${PSQL[@]}" -d "$DB" -c "SET test.jwt_role='service_role'" -c "SELECT public.reject_business_cash_charge_request('$ADMIN', id, 'cleanup') FROM business_cash_charge_requests WHERE idempotency_key='conc-key-1'" >/dev/null

# Concurrency 2: two different keys at once -> one PENDING, the other pending_request_exists.
( "${PSQL[@]}" -d "$DB" -At -c "BEGIN" -c "SET LOCAL test.jwt_role='service_role'" -c "$(printf "$CREATE_SQL" C2A conc-key-2a)" -c "SELECT pg_sleep(2)" -c "COMMIT" > /tmp/stage2a_c2_a.out ) &
A=$!
sleep 0.5
RB=$("${PSQL[@]}" -d "$DB" -At -c "SET test.jwt_role='service_role'" -c "$(printf "$CREATE_SQL" C2B conc-key-2b)")
wait $A
CNT=$("${PSQL[@]}" -d "$DB" -At -c "SELECT count(*) FROM business_cash_charge_requests WHERE store_id='$STORE' AND status='PENDING'")
echo "concurrency two-keys: A=$(grep ok /tmp/stage2a_c2_a.out) B=$RB pending=$CNT"
[ "$CNT" = "1" ] || { echo "FAIL concurrency 2: expected 1 PENDING"; exit 1; }
case "$RB" in *pending_request_exists*) ;; *) echo "FAIL concurrency 2: B not refused"; exit 1;; esac

# Concurrency 3: two admins approve the same request at once -> one TOP_UP ledger row, second is idempotent.
REQ=$("${PSQL[@]}" -d "$DB" -At -c "SELECT id FROM business_cash_charge_requests WHERE store_id='$STORE' AND status='PENDING'")
( "${PSQL[@]}" -d "$DB" -At -c "BEGIN" -c "SET LOCAL test.jwt_role='service_role'" -c "SELECT public.approve_business_cash_charge_request('$ADMIN', '$REQ', 'deposit ok')::text" -c "SELECT pg_sleep(2)" -c "COMMIT" > /tmp/stage2a_c3_a.out ) &
A=$!
sleep 0.5
RB=$("${PSQL[@]}" -d "$DB" -At -c "SET test.jwt_role='service_role'" -c "SELECT public.approve_business_cash_charge_request('55555555-5555-5555-5555-555555555555', '$REQ', 'deposit ok too')::text")
wait $A
CNT=$("${PSQL[@]}" -d "$DB" -At -c "SELECT count(*) FROM business_cash_ledger WHERE idempotency_key='bc_topup:$REQ'")
BAL=$("${PSQL[@]}" -d "$DB" -At -c "SELECT balance_minor FROM business_cash_accounts WHERE store_id='$STORE'")
echo "concurrency double-approve: B=$RB ledger_rows=$CNT balance=$BAL"
[ "$CNT" = "1" ] && [ "$BAL" = "1000" ] || { echo "FAIL concurrency 3"; exit 1; }
case "$RB" in *'"idempotent": true'*) ;; *) echo "FAIL concurrency 3: B not idempotent"; exit 1;; esac

# N-4B (applied after the web deploy): revoke direct service_role writes.
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603110400_stage2a_n4b_cash_charge_requests_write_lock.sql"
"${PSQL[@]}" -d "$DB" -f "$MIG/20270603110400_stage2a_n4b_cash_charge_requests_write_lock.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/50_n4b.test.sql"

rm -f /tmp/stage2a_c*_a.out
echo "ALL ISOLATED TESTS PASSED ($DB)"
