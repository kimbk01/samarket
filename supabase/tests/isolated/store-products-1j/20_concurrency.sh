#!/usr/bin/env bash
# 1-J 격리 DB 동시성 단언 — 00_fixture.sql + 마이그레이션 + 10_assertions.sql 이후 실행.
#   usage: bash 20_concurrency.sh <pg host/socket dir> <port> <db>
# (1) 재고 1개 상품을 두 세션이 동시에 주문 → 정확히 1건 성공, 1건 product_sold_out/insufficient_stock,
#     최종 stock 0 · sold_out_reason='stock'.
# (2) 같은 주문을 두 세션이 동시에 재고 복원 → 1건만 실복원(idempotent=false), stock 1 · active.
set -euo pipefail
H="$1"; P="$2"; DB="$3"
PSQL=(psql -h "$H" -p "$P" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -Atq)

"${PSQL[@]}" <<'SQL'
SET request.jwt.claim.role = 'service_role';
INSERT INTO public.store_products (id, store_id, title, price, product_status, track_inventory, stock_qty, menu_section_id)
VALUES ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000a1', 'race', 100, 'active', true, 1,
        '00000000-0000-0000-0000-00000000c001');
SQL

order_sql() {
  cat <<SQL
SET request.jwt.claim.role = 'service_role';
SELECT public.create_store_order_atomic(
  '$1'::uuid, '00000000-0000-0000-0000-0000000000a1'::uuid, '$2',
  jsonb_build_object('payment_amount', 100, 'total_amount', 100, 'fulfillment_type', 'pickup', 'order_no', 'RACE-$2'),
  jsonb_build_array(jsonb_build_object('product_id', '00000000-0000-0000-0000-00000000aa01', 'qty', 1, 'unit', 100,
    'base_unit_after_discount', 100, 'unit_options_delta', 0, 'subtotal', 100, 'title', 'race'))
) || jsonb_build_object('_t', pg_sleep(0.3)::text);
SQL
}

OUT1=$(mktemp); OUT2=$(mktemp)
order_sql 00000000-0000-0000-0000-0000000000e2 race-a | "${PSQL[@]}" >"$OUT1" &
order_sql 00000000-0000-0000-0000-0000000000e3 race-b | "${PSQL[@]}" >"$OUT2" &
wait
R1=$(tail -1 "$OUT1"); R2=$(tail -1 "$OUT2")
OKS=$(printf '%s\n%s\n' "$R1" "$R2" | grep -c '"ok": true' || true)
if [ "$OKS" != "1" ]; then echo "FAIL: concurrent last-unit order ok count=$OKS ($R1 | $R2)"; exit 1; fi
FINAL=$("${PSQL[@]}" -c "SELECT stock_qty || '/' || product_status || '/' || coalesce(sold_out_reason,'-') FROM public.store_products WHERE id='00000000-0000-0000-0000-00000000aa01'")
[ "$FINAL" = "0/sold_out/stock" ] || { echo "FAIL: after race stock/status/reason=$FINAL"; exit 1; }
echo "PASS: concurrent last-unit order -> exactly 1 ok; stock 0 sold_out(stock)"

OID=$("${PSQL[@]}" -c "SELECT id FROM public.store_orders WHERE order_no LIKE 'RACE-%' LIMIT 1")
restore_sql() {
  cat <<SQL
SET request.jwt.claim.role = 'service_role';
BEGIN;
SELECT public.restore_store_order_stock_atomic('$OID'::uuid);
SELECT pg_sleep(0.3);
COMMIT;
SQL
}
restore_sql | "${PSQL[@]}" >"$OUT1" &
restore_sql | "${PSQL[@]}" >"$OUT2" &
wait
REAL=$(cat "$OUT1" "$OUT2" | grep -c '"idempotent": false' || true)
[ "$REAL" = "1" ] || { echo "FAIL: concurrent restore real count=$REAL"; cat "$OUT1" "$OUT2"; exit 1; }
FINAL=$("${PSQL[@]}" -c "SELECT stock_qty || '/' || product_status || '/' || coalesce(sold_out_reason,'-') FROM public.store_products WHERE id='00000000-0000-0000-0000-00000000aa01'")
[ "$FINAL" = "1/active/-" ] || { echo "FAIL: after concurrent restore=$FINAL"; exit 1; }
echo "PASS: concurrent restore -> exactly 1 real restore; stock 1 active, reason cleared"
rm -f "$OUT1" "$OUT2"
echo "ALL 1-J CONCURRENCY ASSERTIONS PASSED"
