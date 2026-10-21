#!/usr/bin/env bash
# Isolated DB test runner for stage 2-C (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/stage2-2c/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
#   (cluster.sh start|stop manages /var/tmp/samarket_pgiso_2c on port 55443)
# Loads the fixture + production base definitions (repo files, md5-checked against production), the ORD-06
# migration (prod-identical), then the 2-C migration; runs assertions and two-session race checks.
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_stage2_2c}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/01_prod_base.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270602120000_store_order_cancel_ledger_atomic.sql"
"${PSQL[@]}" -d "$DB" -c "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;"
"${PSQL[@]}" -d "$DB" -f "$HERE/02_base_md5.test.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270603130000_stage2_2c_cancel_refund_money_atomic.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/10_stage2_2c.test.sql"
echo "new md5(prosrc):"
"${PSQL[@]}" -d "$DB" -At -c "SELECT proname || ' ' || md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('gift_certificate_refund_order_atomic','restore_store_coupon_entitlement','store_order_owner_cancel_atomic','store_order_cancel_request_decide_atomic','admin_store_coupon_campaign_page','store_order_apply_cancel_side_effects','store_order_cancel_direct_atomic') ORDER BY 1"

S="aaaaaaaa-0000-0000-0000-000000000001"
OWNER="11111111-1111-1111-1111-111111111111"
SR="SET test.jwt_role='service_role'"
q() { "${PSQL[@]}" -d "$DB" -At -c "$SR" -c "$1"; }

# Race 1: refund (session A holds the order lock) vs owner cancel of the same order (session B).
# B waits on the order row, then sees refunded -> transition_conflict. Exactly one money reversal.
OID=$(q "SELECT public.t_new_order('refund_requested')")
q "SELECT public.t_coupon('$OID', public.t_campaign())" >/dev/null
q "SELECT public.t_coin('$OID', 40)" >/dev/null
( "${PSQL[@]}" -d "$DB" -c "BEGIN; $SR; SELECT public.gift_certificate_refund_order_atomic('$OID', NULL); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES=$(q "SELECT public.store_order_owner_cancel_atomic('$OID','$S','$OWNER','refund_requested','late',null)::text")
wait $A
ST=$(q "SELECT order_status FROM store_orders WHERE id='$OID'")
NREV=$(q "SELECT count(*) FROM store_economic_point_ledger WHERE entry_kind='REVERSAL' AND meta->>'order_id'='$OID'")
CST=$(q "SELECT status FROM coupon_user_entitlements WHERE campaign_id IN (SELECT campaign_id FROM store_coupon_redemptions WHERE order_id='$OID')")
echo "race refund-vs-cancel: cancel=$RES status=$ST reversals=$NREV coupon=$CST"
case "$RES" in *transition_conflict*) ;; *) echo "FAIL race 1: expected transition_conflict"; exit 1;; esac
[ "$ST" = "refunded" ] && [ "$NREV" = "1" ] && [ "$CST" = "restored" ] || { echo "FAIL race 1 state"; exit 1; }

# Race 2: owner cancel (A holds the locks) vs refund of the same order (B) -> B sees cancelled, refuses.
OID2=$(q "SELECT public.t_new_order('accepted', 'waiting_rider')")
q "SELECT public.t_coupon('$OID2', public.t_campaign())" >/dev/null
( "${PSQL[@]}" -d "$DB" -c "BEGIN; $SR; SELECT public.store_order_owner_cancel_atomic('$OID2','$S','$OWNER','accepted','x',null); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES2=$(q "SELECT public.gift_certificate_refund_order_atomic('$OID2', NULL)::text")
wait $A
ST2=$(q "SELECT order_status FROM store_orders WHERE id='$OID2'")
echo "race cancel-vs-refund: refund=$RES2 status=$ST2"
case "$RES2" in *unexpected_from_status*) ;; *) echo "FAIL race 2: expected unexpected_from_status"; exit 1;; esac
[ "$ST2" = "cancelled" ] || { echo "FAIL race 2 state"; exit 1; }

# Race 3: two concurrent refunds -> one does the reversal, the other is idempotent (no second REVERSAL/budget).
OID3=$(q "SELECT public.t_new_order('refund_requested')")
CID3=$(q "SELECT public.t_campaign()")
q "SELECT public.t_coupon('$OID3', '$CID3')" >/dev/null
q "SELECT public.t_coin('$OID3', 40)" >/dev/null
( "${PSQL[@]}" -d "$DB" -c "BEGIN; $SR; SELECT public.gift_certificate_refund_order_atomic('$OID3', NULL); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES3=$(q "SELECT public.gift_certificate_refund_order_atomic('$OID3', NULL)::text")
wait $A
NREV3=$(q "SELECT count(*) FROM store_economic_point_ledger WHERE entry_kind='REVERSAL' AND meta->>'order_id'='$OID3'")
BUD3=$(q "SELECT reserved_spend_php FROM store_coupon_campaigns WHERE id='$CID3'")
echo "race refund-vs-refund: second=$RES3 reversals=$NREV3 budget=$BUD3"
case "$RES3" in *'"idempotent": true'*) ;; *) echo "FAIL race 3: expected idempotent"; exit 1;; esac
[ "$NREV3" = "1" ] && [ "$BUD3" = "1040" ] || { echo "FAIL race 3 state"; exit 1; }

# Race 4: SYSTEM accept_timeout vs buyer cancel on the same pending order -> one wins, side effects once.
OID4=$(q "SELECT public.t_new_order('pending')")
CID4=$(q "SELECT public.t_campaign()")
q "SELECT public.t_coupon('$OID4', '$CID4')" >/dev/null
( "${PSQL[@]}" -d "$DB" -c "BEGIN; $SR; SELECT public.store_order_cancel_direct_atomic('$OID4','pending','cancelled','SYSTEM'); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES4=$(q "SELECT public.store_order_cancel_direct_atomic('$OID4','pending','cancelled','CUSTOMER')::text")
wait $A
BUD4=$(q "SELECT reserved_spend_php FROM store_coupon_campaigns WHERE id='$CID4'")
echo "race cancel-vs-cancel: second=$RES4 budget=$BUD4"
case "$RES4" in *transition_conflict*) ;; *) echo "FAIL race 4: expected transition_conflict"; exit 1;; esac
[ "$BUD4" = "1040" ] || { echo "FAIL race 4 budget"; exit 1; }

# Race 5 (ORD-06 regression with the NO KEY UPDATE delivery lock): courier pickup holds the delivery row,
# owner cancel waits, then sees the pickup -> picked_up, order unchanged.
OID5=$(q "SELECT public.t_new_order('ready_for_pickup', 'rider_assigned')")
( "${PSQL[@]}" -d "$DB" -c "BEGIN; UPDATE store_order_deliveries SET delivery_status='pickup_in_progress' WHERE order_id='$OID5'; SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES5=$(q "SELECT public.store_order_owner_cancel_atomic('$OID5','$S','$OWNER','ready_for_pickup','late',null)::text")
wait $A
ST5=$(q "SELECT order_status FROM store_orders WHERE id='$OID5'")
echo "race pickup-vs-cancel: rpc=$RES5 status=$ST5"
case "$RES5" in *picked_up*) ;; *) echo "FAIL race 5"; exit 1;; esac
[ "$ST5" = "ready_for_pickup" ] || { echo "FAIL race 5 state"; exit 1; }

# Race 6: owner cancel commits (closing the delivery row) while a dispatch waits -> dispatch refused.
OID6=$(q "SELECT public.t_new_order('ready_for_pickup', 'rider_assigned')")
( "${PSQL[@]}" -d "$DB" -c "BEGIN; $SR; SELECT public.store_order_owner_cancel_atomic('$OID6','$S','$OWNER','ready_for_pickup','sold out',null); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
OUT6=$("${PSQL[@]}" -d "$DB" -At -c "UPDATE store_order_deliveries SET delivery_status='pickup_in_progress' WHERE order_id='$OID6' AND delivery_status='rider_assigned' RETURNING order_id" 2>&1 || true)
wait $A
DS6=$(q "SELECT delivery_status FROM store_order_deliveries WHERE order_id='$OID6'")
echo "race cancel-vs-pickup: dispatch='$OUT6' delivery=$DS6"
[ -z "$OUT6" ] && [ "$DS6" = "delivery_failed" ] || { echo "FAIL race 6"; exit 1; }

echo "ALL ISOLATED TESTS PASSED ($DB)"
