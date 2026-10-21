#!/usr/bin/env bash
# OPS-08 race: owner turns delivery OFF while holding the store row lock; a concurrent order RPC blocks on
# the store FOR UPDATE, then sees the committed flag and rejects (store_delivery_disabled) — the TS check that
# passed earlier no longer lets one order through.
#   usage: bash 20_concurrency.sh <pg host/socket dir> <port> <dbname>
set -euo pipefail
H="$1"; P="$2"; DB="$3"
PSQL=(psql -h "$H" -p "$P" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -At)
STORE='00000000-0000-0000-0000-0000000000a1'
"${PSQL[@]}" -c "UPDATE public.stores SET is_open = true, pickup_available = true, delivery_available = true, business_hours_json = '{}'::jsonb WHERE id = '$STORE'"
N0=$("${PSQL[@]}" -c "SELECT count(*) FROM public.store_orders")

OUT="$(mktemp)"
# session A: lock store, flip delivery off, hold 2s, commit
"${PSQL[@]}" -c "BEGIN; UPDATE public.stores SET delivery_available = false WHERE id = '$STORE'; SELECT pg_sleep(2); COMMIT;" >/dev/null &
A=$!
sleep 0.5
# session B: order RPC (local_delivery) — must wait for A, then reject
"${PSQL[@]}" -c "SELECT public.create_store_order_atomic('00000000-0000-0000-0000-0000000000e1','$STORE','race-1',
  '{\"order_no\":\"ISO3-race-1\",\"fulfillment_type\":\"local_delivery\",\"total_amount\":100,\"payment_amount\":100,\"delivery_fee_amount\":0}'::jsonb,
  '[{\"product_id\":\"00000000-0000-0000-0000-00000000e001\",\"qty\":1,\"unit\":100,\"base_unit_after_discount\":100,\"unit_options_delta\":0,\"subtotal\":100}]'::jsonb)->>'error'" > "$OUT"
wait $A
GOT="$(cat "$OUT")"; rm -f "$OUT"
N1=$("${PSQL[@]}" -c "SELECT count(*) FROM public.store_orders")
[ "$GOT" = "store_delivery_disabled" ] || { echo "FAIL: race expected store_delivery_disabled, got '$GOT'"; exit 1; }
[ "$N0" = "$N1" ] || { echo "FAIL: race created an order ($N0 -> $N1)"; exit 1; }
echo "PASS: concurrent delivery OFF (row lock held) -> blocked RPC rejects store_delivery_disabled, 0 orders"
