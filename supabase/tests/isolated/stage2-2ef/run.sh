#!/usr/bin/env bash
# 2-E ADS-22 · 2-F FIN-15 · N-4B(store_settlements) 격리 DB 러너
# (로컬 1회용 PostgreSQL 16 전용 — Supabase 운영/테스트 프로젝트에 실행 금지)
#   usage: bash supabase/tests/isolated/stage2-2ef/run.sh <pg host/socket dir> <port> [dbname]
# 순서: 1-J 픽스처 → 1-J 마이그레이션(운영 기준 원문) → 기준 md5 확인 → 추가 픽스처(레거시 위반 행 포함)
#       → 20270603150000 2회(재실행 안전) → 신규 md5 출력 → 단언 → 20270603150100 2회 → 권한 단언
set -euo pipefail
H="$1"; P="$2"; DB="${3:-iso_stage2_2ef}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
PSQL=(psql -h "$H" -p "$P" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q)
BASE_MD5="1749beecbda87eb2596ad1e8f886cf78"
MD5_SQL="SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.create_store_order_atomic(uuid,uuid,text,jsonb,jsonb)'::regprocedure"

dropdb -h "$H" -p "$P" -U postgres --if-exists "$DB"
createdb -h "$H" -p "$P" -U postgres "$DB"
"${PSQL[@]}" -f "$ROOT/supabase/tests/isolated/store-products-1j/00_fixture.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20270602130000_store_products_review_lock_stock_reason.sql"

GOT=$("${PSQL[@]}" -At -c "$MD5_SQL")
[ "$GOT" = "$BASE_MD5" ] || { echo "FAIL: base md5 $GOT != prod $BASE_MD5"; exit 1; }
echo "PASS: base create_store_order_atomic md5(prosrc) = prod $BASE_MD5"

"${PSQL[@]}" -f "$HERE/05_fixture_extra.sql"
# FIN-15 baseline: the prod body still rejects a point_commerce_blocked store
"${PSQL[@]}" -c "UPDATE public.stores SET point_commerce_blocked = true"
PRE=$("${PSQL[@]}" -At -c "SELECT public.create_store_order_atomic('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','pre-blocked','{\"payment_amount\":100,\"total_amount\":100,\"fulfillment_type\":\"pickup\"}'::jsonb,'[{\"product_id\":\"00000000-0000-0000-0000-00000000e001\",\"qty\":1,\"unit\":100,\"base_unit_after_discount\":100,\"unit_options_delta\":0,\"subtotal\":100}]'::jsonb)->>'error'")
[ "$PRE" = "store_point_blocked" ] || { echo "FAIL: baseline expected store_point_blocked, got $PRE"; exit 1; }
echo "PASS: baseline (prod body) rejects point_commerce_blocked store -> store_point_blocked"
"${PSQL[@]}" -c "UPDATE public.stores SET point_commerce_blocked = false"

MIG="$ROOT/supabase/migrations/20270603150000_create_store_order_atomic_coupon_split_single_gate.sql"
"${PSQL[@]}" -f "$MIG"
"${PSQL[@]}" -f "$MIG"
echo "PASS: 20270603150000 applied twice"
echo "new create_store_order_atomic md5(prosrc) = $("${PSQL[@]}" -At -c "$MD5_SQL")"
"${PSQL[@]}" -f "$HERE/10_assertions.sql" 2>&1 | sed -n 's/^psql:[^ ]* NOTICE:  //p'

MIG2="$ROOT/supabase/migrations/20270603150100_store_settlements_revoke_service_role_writes.sql"
"${PSQL[@]}" -f "$MIG2"
"${PSQL[@]}" -f "$MIG2"
"${PSQL[@]}" -f "$HERE/20_n4b_store_settlements_privileges.sql" 2>&1 | sed -n 's/^psql:[^ ]* NOTICE:  //p'

# ON_ERROR_STOP + pipefail: any FAIL above already exited non-zero
echo "ALL ISOLATED TESTS PASSED ($DB)"
dropdb -h "$H" -p "$P" -U postgres "$DB"
