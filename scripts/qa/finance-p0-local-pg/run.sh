#!/usr/bin/env bash
# 금융 P0 DB-1·DB-2 격리 검증 — 로컬 임시 PostgreSQL 에서만 실행 (운영·테스트 DB 접속 금지).
# 사용: PGPORT=55432 bash scripts/qa/finance-p0-local-pg/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../.."
PGHOST="${PGHOST:-127.0.0.1}"
case "$PGHOST" in 127.0.0.1|localhost) ;; *) echo "local only"; exit 2 ;; esac
PSQL="psql -h $PGHOST -p ${PGPORT:-55432} -U postgres -v ON_ERROR_STOP=1 -q"
DB=finance_p0_verify
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
$PSQL -d $DB -f "$HERE/bootstrap.sql"
python3 -I "$HERE/extract-fn.py" project_user_point_balance_from_ledger settle_store_sale_fee_obligations \
  convert_store_economic_points_to_business_cash | $PSQL -d $DB
$PSQL -d $DB -f "$ROOT/supabase/migrations/20271103140000_finance_p0_db1_point_spend_credit_atomic.sql"
$PSQL -d $DB -f "$ROOT/supabase/migrations/20271103150000_finance_p0_db2_coin_conversion_preview.sql"
$PSQL -d $DB -f "$HERE/tests.sql"
bash "$HERE/concurrency.sh" "$PSQL" "$DB"
echo "ALL PASS"
