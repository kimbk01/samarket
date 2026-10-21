#!/usr/bin/env bash
# Isolated DB test runner for stage 3-D1 (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/stage3-3d1/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
#   (cluster.sh start|stop manages /var/tmp/samarket_pgiso_3d1 on port 55455)
# Loads the fixture + production base definitions (repo files, md5-checked against production), then the 3-D1
# migration; runs assertions and two-session race checks.
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_stage3_3d1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/01_prod_base.sql"
"${PSQL[@]}" -d "$DB" -c "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;"
"${PSQL[@]}" -d "$DB" -f "$HERE/02_base_md5.test.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270604140000_stage3_3d1_ads_lifecycle_period_snapshot.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/10_stage3_3d1.test.sql"
echo "new md5(prosrc):"
"${PSQL[@]}" -d "$DB" -At -c "SELECT proname || ' ' || md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('admin_delivery_ad_transition','owner_delivery_ad_transition','delivery_ad_system_schedule_transition','owner_submit_delivery_ad_with_business_cash','admin_delivery_ad_campaign_index','business_cash_delivery_ad_refund_system','delivery_ad_owner_snapshot_binding_error') ORDER BY 1"

SR="SET test.jwt_role='service_role'"
q() { "${PSQL[@]}" -d "$DB" -At -c "$SR" -c "$1"; }
ADMIN="99999999-9999-9999-9999-999999999999"

# Race 1: system expire_unreviewed (A holds the campaign lock) vs admin reject-with-refund (B) on the same
# expired UNDER_REVIEW application -> exactly one AD_REFUND ledger row, B refused (stale/illegal).
C1=$(q "SELECT public.t_sponsored(now() + interval '1 minute', now() + interval '1 minute' + interval '7 days', 7)")
q "SELECT public.owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','store_sponsored','$C1','submit','DRAFT','submitted')" >/dev/null
q "SELECT public.admin_delivery_ad_transition('$ADMIN','store_sponsored','$C1','start_review','SUBMITTED',NULL)" >/dev/null
q "UPDATE store_paid_ad_campaigns SET start_at = now() - interval '10 days', end_at = now() - interval '3 days' WHERE id = '$C1'" >/dev/null
( "${PSQL[@]}" -d "$DB" -c "BEGIN; $SR; SELECT public.delivery_ad_system_schedule_transition('store_sponsored','$C1','expire_unreviewed','UNDER_REVIEW',NULL); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES=$(q "SELECT public.admin_delivery_ad_reject_with_refund('$ADMIN','store_sponsored','$C1','UNDER_REVIEW',NULL,'late')::text")
wait $A
NREF=$(q "SELECT count(*) FROM business_cash_ledger WHERE idempotency_key = 'bc_refund:store_sponsored:$C1'")
ST=$(q "SELECT lifecycle_status FROM store_paid_ad_campaigns WHERE id = '$C1'")
echo "race expire-vs-reject: reject=$RES status=$ST refunds=$NREF"
case "$RES" in *stale_lifecycle*) ;; *) echo "FAIL race 1: expected stale_lifecycle"; exit 1;; esac
[ "$ST" = "REJECTED" ] && [ "$NREF" = "1" ] || { echo "FAIL race 1 state"; exit 1; }

# Race 2: admin reject-with-refund first (A holds the lock) vs system expire (B) -> B refused, one refund.
C2=$(q "SELECT public.t_sponsored(now() + interval '1 minute', now() + interval '1 minute' + interval '7 days', 7)")
q "SELECT public.owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','store_sponsored','$C2','submit','DRAFT','submitted')" >/dev/null
q "SELECT public.admin_delivery_ad_transition('$ADMIN','store_sponsored','$C2','start_review','SUBMITTED',NULL)" >/dev/null
q "UPDATE store_paid_ad_campaigns SET start_at = now() - interval '10 days', end_at = now() - interval '3 days' WHERE id = '$C2'" >/dev/null
( "${PSQL[@]}" -d "$DB" -c "BEGIN; $SR; SELECT public.admin_delivery_ad_reject_with_refund('$ADMIN','store_sponsored','$C2','UNDER_REVIEW',NULL,'no'); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES2=$(q "SELECT public.delivery_ad_system_schedule_transition('store_sponsored','$C2','expire_unreviewed','UNDER_REVIEW',NULL)::text")
wait $A
NREF2=$(q "SELECT count(*) FROM business_cash_ledger WHERE idempotency_key = 'bc_refund:store_sponsored:$C2'")
echo "race reject-vs-expire: expire=$RES2 refunds=$NREF2"
case "$RES2" in *stale_lifecycle*) ;; *) echo "FAIL race 2: expected stale_lifecycle"; exit 1;; esac
[ "$NREF2" = "1" ] || { echo "FAIL race 2 state"; exit 1; }

# Race 3: two concurrent expire calls -> one REJECTED + one refund.
C3=$(q "SELECT public.t_sponsored(now() + interval '1 minute', now() + interval '1 minute' + interval '7 days', 7)")
q "SELECT public.owner_submit_delivery_ad_with_business_cash('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','store_sponsored','$C3','submit','DRAFT','submitted')" >/dev/null
q "UPDATE store_paid_ad_campaigns SET start_at = now() - interval '10 days', end_at = now() - interval '3 days' WHERE id = '$C3'" >/dev/null
( "${PSQL[@]}" -d "$DB" -c "BEGIN; $SR; SELECT public.delivery_ad_system_schedule_transition('store_sponsored','$C3','expire_unreviewed',NULL,NULL); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES3=$(q "SELECT public.delivery_ad_system_schedule_transition('store_sponsored','$C3','expire_unreviewed',NULL,NULL)::text")
wait $A
NREF3=$(q "SELECT count(*) FROM business_cash_ledger WHERE idempotency_key = 'bc_refund:store_sponsored:$C3'")
echo "race expire-vs-expire: second=$RES3 refunds=$NREF3"
case "$RES3" in *illegal_transition*) ;; *) echo "FAIL race 3: expected illegal_transition"; exit 1;; esac
[ "$NREF3" = "1" ] || { echo "FAIL race 3 state"; exit 1; }

echo "ALL ISOLATED TESTS PASSED ($DB)"
