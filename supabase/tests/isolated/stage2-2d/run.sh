#!/usr/bin/env bash
# Isolated DB test runner for stage 2-D gift certificate (GFT-01 / GFT-07 / GFT-08).
# Local throwaway PostgreSQL 16 only - never a Supabase project.
# Usage: supabase/tests/isolated/stage2-2d/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
# Creates a fresh database, loads the fixture + the three migrations under test, runs assertions,
# prints md5(prosrc) of the redefined functions (= expected production md5 after apply).
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_stage2_2d_gift}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U postgres -E UTF8 -T template0 --locale=C "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270603140000_gift_redemption_reverse_terminal_guard.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270603140100_gift_purchase_idempotency_buyer_scope.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270603140200_gift_issued_count_integrity_report.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/10_gft01_reverse_terminal_guard.test.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/11_gft01_as_service_role.test.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/20_gft07_purchase_buyer_scope.test.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/30_gft08_issued_count_integrity.test.sql"

# Migrations are re-runnable (CREATE OR REPLACE + REVOKE/GRANT): apply again, nothing breaks.
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270603140000_gift_redemption_reverse_terminal_guard.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270603140100_gift_purchase_idempotency_buyer_scope.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270603140200_gift_issued_count_integrity_report.sql"

"${PSQL[@]}" -d "$DB" -At -c "SELECT proname || ' md5(prosrc)=' || md5(prosrc) || ' ascii=' || (prosrc !~ '[^\x01-\x7E[:space:]]')::text
  FROM pg_proc WHERE proname IN ('gift_certificate_redemption_reverse','gift_certificate_purchase','gift_certificate_issued_count_integrity_report')
  ORDER BY proname"
echo "ALL ISOLATED TESTS PASSED ($DB)"
