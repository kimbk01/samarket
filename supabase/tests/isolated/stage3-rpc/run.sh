#!/usr/bin/env bash
# 3단계 OPS-08 + LOC-004 (주문 RPC 재정의 1회) 격리 DB 러너
# (로컬 1회용 PostgreSQL 16 전용 — Supabase 운영/테스트 프로젝트에 실행 금지)
#   usage: bash supabase/tests/isolated/stage3-rpc/run.sh <pg host/socket dir> <port> [dbname]
# 순서: 1-J 픽스처 → 1-J → 2-E/2-F 픽스처 → 20270603150000 → 운영 기준 md5 확인
#       → 기준 동작(운영 원문은 배달 OFF 매장 주문을 통과시킴) 확인 → 3단계 픽스처
#       → 20270604110000 2회 · 20270604110100 2회(재실행 안전) → 신규 md5 출력
#       → SQL 쌍둥이 fixture 표(TS 와 동일 JSON) → RPC 단언 → 동시성
set -euo pipefail
H="$1"; P="$2"; DB="${3:-iso_stage3_rpc}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
PSQL=(psql -h "$H" -p "$P" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q)
BASE_MD5="adc3d68faece57cb3160306f6d5e686e"
MD5_SQL="SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.create_store_order_atomic(uuid,uuid,text,jsonb,jsonb)'::regprocedure"

dropdb -h "$H" -p "$P" -U postgres --if-exists "$DB"
createdb -h "$H" -p "$P" -U postgres "$DB"
"${PSQL[@]}" -f "$ROOT/supabase/tests/isolated/store-products-1j/00_fixture.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20270602130000_store_products_review_lock_stock_reason.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/isolated/stage2-2ef/05_fixture_extra.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20270603150000_create_store_order_atomic_coupon_split_single_gate.sql"

GOT=$("${PSQL[@]}" -At -c "$MD5_SQL")
[ "$GOT" = "$BASE_MD5" ] || { echo "FAIL: base md5 $GOT != prod $BASE_MD5"; exit 1; }
echo "PASS: base create_store_order_atomic md5(prosrc) = prod $BASE_MD5"

"${PSQL[@]}" -f "$HERE/05_fixture_extra.sql"

# Baseline: prod body ignores delivery_available (OPS-08 defect reproduced)
PRE=$("${PSQL[@]}" -At -c "SELECT public.create_store_order_atomic('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1','pre-dlv-off','{\"payment_amount\":100,\"total_amount\":100,\"fulfillment_type\":\"local_delivery\",\"checkout_serviceability_reason\":\"ok\"}'::jsonb,'[{\"product_id\":\"00000000-0000-0000-0000-00000000e001\",\"qty\":1,\"unit\":100,\"base_unit_after_discount\":100,\"unit_options_delta\":0,\"subtotal\":100}]'::jsonb)->>'ok'")
[ "$PRE" = "true" ] || { echo "FAIL: baseline expected prod body to accept delivery-off order, got $PRE"; exit 1; }
PRE_SNAP=$("${PSQL[@]}" -At -c "SELECT count(*) FROM public.store_orders WHERE client_order_key = 'pre-dlv-off' AND checkout_serviceability_reason IS NULL")
[ "$PRE_SNAP" = "1" ] || { echo "FAIL: baseline expected prod body to drop the snapshot key"; exit 1; }
echo "PASS: baseline (prod body) accepts local_delivery on delivery_available=false store and drops snapshot (defect reproduced)"

TWIN="$ROOT/supabase/migrations/20270604110000_store_front_commerce_open_sql_twin.sql"
MIG="$ROOT/supabase/migrations/20270604110100_create_store_order_atomic_ops08_loc004.sql"
"${PSQL[@]}" -f "$TWIN"
"${PSQL[@]}" -f "$TWIN"
"${PSQL[@]}" -f "$MIG"
"${PSQL[@]}" -f "$MIG"
echo "PASS: 20270604110000 + 20270604110100 applied twice"
echo "new create_store_order_atomic md5(prosrc) = $("${PSQL[@]}" -At -c "$MD5_SQL")"
echo "new store_front_commerce_open md5(prosrc) = $("${PSQL[@]}" -At -c "SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.store_front_commerce_open(jsonb,boolean,timestamptz)'::regprocedure")"
echo "new store_front_hhmm_to_minutes md5(prosrc) = $("${PSQL[@]}" -At -c "SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.store_front_hhmm_to_minutes(text)'::regprocedure")"

GEN="$(mktemp)"
node "$HERE/gen-commerce-open-assertions.mjs" > "$GEN"
"${PSQL[@]}" -f "$GEN" 2>&1 | sed -n 's/^psql:[^ ]* NOTICE:  //p'
rm -f "$GEN"

"${PSQL[@]}" -f "$HERE/10_assertions.sql" 2>&1 | sed -n 's/^psql:[^ ]* NOTICE:  //p'
bash "$HERE/20_concurrency.sh" "$H" "$P" "$DB"

# ON_ERROR_STOP + pipefail: any FAIL above already exited non-zero
echo "ALL ISOLATED TESTS PASSED ($DB)"
dropdb -h "$H" -p "$P" -U postgres "$DB"
