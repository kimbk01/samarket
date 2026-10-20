#!/usr/bin/env bash
# 1-J 격리 DB — D-5 보존: 과거 행이 할인 CHECK 를 위반해도 마이그레이션은 실패하지 않고
# 제약을 NOT VALID 로 남기며(기존 행 재작성 없음) 신규 쓰기만 막는다.
#   usage: bash 30_not_valid_when_history_violates.sh <pg host/socket dir> <port> <scratch db name>
set -euo pipefail
H="$1"; P="$2"; DB="$3"
DIR="$(cd "$(dirname "$0")" && pwd)"
MIG="$DIR/../../../migrations/20270602130000_store_products_review_lock_stock_reason.sql"
dropdb -h "$H" -p "$P" -U postgres --if-exists "$DB"
createdb -h "$H" -p "$P" -U postgres "$DB"
PSQL=(psql -h "$H" -p "$P" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -Atq)
"${PSQL[@]}" -f "$DIR/00_fixture.sql"
"${PSQL[@]}" -c "INSERT INTO public.store_products (id, store_id, title, price, discount_price, product_status)
  VALUES ('00000000-0000-0000-0000-00000000bad1', '00000000-0000-0000-0000-0000000000a1', 'legacy bad', 100, 100, 'active')"
"${PSQL[@]}" -f "$MIG" 2>/dev/null
V=$("${PSQL[@]}" -c "SELECT convalidated FROM pg_constraint WHERE conname='store_products_discount_lt_price'")
[ "$V" = "f" ] || { echo "FAIL: expected NOT VALID, got $V"; exit 1; }
KEPT=$("${PSQL[@]}" -c "SELECT discount_price FROM public.store_products WHERE id='00000000-0000-0000-0000-00000000bad1'")
[ "$KEPT" = "100" ] || { echo "FAIL: historical row rewritten ($KEPT)"; exit 1; }
if "${PSQL[@]}" -c "INSERT INTO public.store_products (store_id, title, price, discount_price) VALUES ('00000000-0000-0000-0000-0000000000a1','new bad',100,120)" 2>/dev/null; then
  echo "FAIL: new violating row accepted"; exit 1
fi
echo "PASS: historical violation -> constraint NOT VALID, old row untouched, new violation rejected"
dropdb -h "$H" -p "$P" -U postgres "$DB"
