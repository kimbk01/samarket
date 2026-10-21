#!/usr/bin/env bash
# Isolated DB test runner (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/stage2-2b/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
# Creates a fresh database, loads the fixture + legacy rows + the four stage 2-B migrations, runs assertions,
# then a two-session concurrency check (two admin payouts of the full available amount -> exactly one succeeds).
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_stage2_2b}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/05_legacy_rows.sql"
for m in \
  20270603120000_stage2b_fin03_gift_rail_payout.sql \
  20270603120100_stage2b_fin03_gft02_sale_coin_platform_coupon_only.sql \
  20270603120200_stage2b_gft02_integrity_sale_coin_cap.sql \
  20270603120300_stage2b_fin13_fee_policy_no_delivery_percent.sql; do
  "${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/$m"
done
# Migrations must be re-runnable (CREATE OR REPLACE / IF NOT EXISTS guards).
for m in \
  20270603120000_stage2b_fin03_gift_rail_payout.sql \
  20270603120300_stage2b_fin13_fee_policy_no_delivery_percent.sql; do
  "${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/$m"
done
"${PSQL[@]}" -d "$DB" -f "$HERE/10_stage2b.test.sql"

ADMIN="44444444-4444-4444-4444-444444444444"
S="aaaaaaaa-0000-0000-0000-000000000001"
AVAIL=$("${PSQL[@]}" -d "$DB" -At -c "SELECT public.gift_certificate_store_revenue_available('$S')")
[ "$AVAIL" = "170" ] || { echo "FAIL: expected available 170 before concurrency, got $AVAIL"; exit 1; }

# Concurrency: session A pays the full available amount and holds its TX open; session B pays the full
# amount with another key/reference meanwhile. B must wait on the per-store lock and then be refused.
( "${PSQL[@]}" -d "$DB" -At -c "BEGIN; SET LOCAL test.jwt_role='service_role'; SELECT public.gift_certificate_admin_store_payout('$ADMIN','$S',170,'gcash','GC-A',null,'conc-a')->>'ok'; SELECT pg_sleep(2); COMMIT;" > "$HERE/.conc_a.out" ) &
A=$!
sleep 0.5
RES_B=$("${PSQL[@]}" -d "$DB" -At -c "SET test.jwt_role='service_role'" -c "SELECT public.gift_certificate_admin_store_payout('$ADMIN','$S',170,'gcash','GC-B',null,'conc-b')::text")
wait $A
RES_A=$(cat "$HERE/.conc_a.out" | head -1); rm -f "$HERE/.conc_a.out"
N=$("${PSQL[@]}" -d "$DB" -At -c "SELECT count(*) FROM gift_certificate_store_payouts WHERE idempotency_key IN ('conc-a','conc-b')")
AV=$("${PSQL[@]}" -d "$DB" -At -c "SELECT public.gift_certificate_store_revenue_available('$S')")
echo "concurrency double payout: A.ok=$RES_A B=$RES_B rows=$N available_after=$AV"
[ "$RES_A" = "true" ] || { echo "FAIL concurrency: A must succeed"; exit 1; }
case "$RES_B" in *payout_exceeds_available*) ;; *) echo "FAIL concurrency: B must be refused"; exit 1;; esac
[ "$N" = "1" ] || { echo "FAIL concurrency: exactly one payout row expected"; exit 1; }
[ "$AV" = "0" ] || { echo "FAIL concurrency: available must be 0"; exit 1; }

# Same idempotency key from two sessions at once -> one row, second returns idempotent.
"${PSQL[@]}" -d "$DB" -c "SET test.jwt_role='service_role'; INSERT INTO gift_certificate_redemptions(order_id, store_id, redeemed_amount, platform_fee_amount, merchant_net_amount) VALUES ('bbbbbbbb-0000-0000-0000-000000000003','$S',100,10,90); UPDATE store_orders SET gift_redemption_amount = 100 WHERE id = 'bbbbbbbb-0000-0000-0000-000000000003'; SELECT public.gift_certificate_recognize_revenue_for_completed_order('bbbbbbbb-0000-0000-0000-000000000003');" >/dev/null
( "${PSQL[@]}" -d "$DB" -At -c "BEGIN; SET LOCAL test.jwt_role='service_role'; SELECT public.gift_certificate_admin_store_payout('$ADMIN','$S',90,'gcash','GC-C',null,'conc-c')->>'ok'; SELECT pg_sleep(2); COMMIT;" > "$HERE/.conc_c.out" ) &
C=$!
sleep 0.5
RES_D=$("${PSQL[@]}" -d "$DB" -At -c "SET test.jwt_role='service_role'" -c "SELECT public.gift_certificate_admin_store_payout('$ADMIN','$S',90,'gcash','GC-C',null,'conc-c')::text")
wait $C
rm -f "$HERE/.conc_c.out"
N2=$("${PSQL[@]}" -d "$DB" -At -c "SELECT count(*) FROM gift_certificate_store_payouts WHERE idempotency_key = 'conc-c'")
echo "concurrency same key: second=$RES_D rows=$N2"
case "$RES_D" in *'"idempotent": true'*) ;; *) echo "FAIL concurrency same key: second must be idempotent"; exit 1;; esac
[ "$N2" = "1" ] || { echo "FAIL concurrency same key: one row expected"; exit 1; }

echo "ALL ISOLATED TESTS PASSED ($DB)"
