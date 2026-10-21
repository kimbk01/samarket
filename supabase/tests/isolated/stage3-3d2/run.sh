#!/usr/bin/env bash
# Isolated DB test runner for stage 3-D part 2 (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/stage3-3d2/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
#   (cluster.sh start|stop manages /var/tmp/samarket_pgiso_3d2 on port 55456)
# Loads the fixture + production base definitions (md5-checked against production), the two 3-D2 migrations,
# runs assertions and two-session race checks (ADS-03 approve vs reject, ADS-04 concurrent apply, ADS-13 submit).
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_stage3_3d2}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/01_prod_base.sql"
"${PSQL[@]}" -d "$DB" -c "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;"
"${PSQL[@]}" -d "$DB" -f "$HERE/02_base_md5.test.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270604150000_ads_partner_membership_atomic.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270604150100_platform_popup_owner_submit_atomic.sql"
# Re-apply is a no-op (idempotent DDL).
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270604150000_ads_partner_membership_atomic.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/10_stage3_3d2.test.sql"
echo "new md5(prosrc):"
"${PSQL[@]}" -d "$DB" -At -c "SELECT proname || ' ' || md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('owner_apply_partner_membership','admin_partner_membership_decide','delivery_ad_partner_membership_expire_due','delivery_ad_partner_membership_expire_due_internal','owner_submit_platform_popup_request') ORDER BY 1"

q() { "${PSQL[@]}" -d "$DB" -At -c "$1"; }
OWN="11111111-1111-1111-1111-111111111111"
ADM="99999999-9999-9999-9999-999999999999"

# Race 1 (ADS-04): two concurrent applies for the same store with different request ids -> exactly one row/debit.
S="cccccccc-0000-0000-0000-000000000001"
q "INSERT INTO stores (id, owner_user_id) VALUES ('$S', '$OWN'); INSERT INTO business_cash_accounts VALUES ('$S', 50000, now());"
( "${PSQL[@]}" -d "$DB" -c "BEGIN; SELECT owner_apply_partner_membership('$S','$OWN','ra'); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES=$(q "SELECT owner_apply_partner_membership('$S','$OWN','rb')::text")
wait $A
N=$(q "SELECT count(*) FROM delivery_ad_partner_memberships WHERE store_id='$S'")
BAL=$(q "SELECT balance_minor FROM business_cash_accounts WHERE store_id='$S'")
NL=$(q "SELECT count(*) FROM business_cash_ledger WHERE store_id='$S'")
echo "race apply-vs-apply: second=$RES rows=$N balance=$BAL ledger=$NL"
case "$RES" in *already_open*) ;; *) echo "FAIL race 1: expected already_open"; exit 1;; esac
[ "$N" = "1" ] && [ "$BAL" = "40000" ] && [ "$NL" = "1" ] || { echo "FAIL race 1 state"; exit 1; }

# Race 2 (ADS-03): reject (A holds the membership lock) vs approve (B) -> B refused; REJECTED + REFUNDED only.
MID=$(q "SELECT id FROM delivery_ad_partner_memberships WHERE store_id='$S'")
( "${PSQL[@]}" -d "$DB" -c "BEGIN; SELECT admin_partner_membership_decide('$ADM','$MID','reject','r',NULL); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES2=$(q "SELECT admin_partner_membership_decide('$ADM','$MID','approve','a',NULL)::text")
wait $A
ST=$(q "SELECT status FROM delivery_ad_partner_memberships WHERE id='$MID'")
FS=$(q "SELECT status FROM delivery_ad_canonical_bc_fundings WHERE application_id='$MID'")
BAL2=$(q "SELECT balance_minor FROM business_cash_accounts WHERE store_id='$S'")
echo "race reject-vs-approve: approve=$RES2 status=$ST funding=$FS balance=$BAL2"
case "$RES2" in *illegal_transition*) ;; *) echo "FAIL race 2: expected illegal_transition"; exit 1;; esac
[ "$ST" = "REJECTED" ] && [ "$FS" = "REFUNDED" ] && [ "$BAL2" = "50000" ] || { echo "FAIL race 2 state"; exit 1; }

# Race 3 (ADS-03): approve (A) vs reject (B) -> B refused; ACTIVE + SECURED, no refund.
q "SELECT owner_apply_partner_membership('$S','$OWN','rc')" >/dev/null
MID3=$(q "SELECT id FROM delivery_ad_partner_memberships WHERE store_id='$S' AND status='PENDING_REVIEW'")
( "${PSQL[@]}" -d "$DB" -c "BEGIN; SELECT admin_partner_membership_decide('$ADM','$MID3','approve','a',NULL); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES3=$(q "SELECT admin_partner_membership_decide('$ADM','$MID3','reject','r',NULL)::text")
wait $A
ST3=$(q "SELECT status FROM delivery_ad_partner_memberships WHERE id='$MID3'")
FS3=$(q "SELECT status FROM delivery_ad_canonical_bc_fundings WHERE application_id='$MID3'")
NR3=$(q "SELECT count(*) FROM business_cash_ledger WHERE store_id='$S' AND entry_kind='PARTNER_REFUND'")
echo "race approve-vs-reject: reject=$RES3 status=$ST3 funding=$FS3 refunds=$NR3"
case "$RES3" in *illegal_transition*) ;; *) echo "FAIL race 3: expected illegal_transition"; exit 1;; esac
[ "$ST3" = "ACTIVE" ] && [ "$FS3" = "SECURED" ] && [ "$NR3" = "1" ] || { echo "FAIL race 3 state"; exit 1; }

# Race 4 (ADS-13): two concurrent popup submits with different keys -> one debit, the other refused.
QID=$(q "INSERT INTO platform_popup_owner_requests (owner_user_id, store_id, package_id, price_minor, creative_asset_path) VALUES ('$OWN','$S',gen_random_uuid(),3000,'a.png') RETURNING id" | head -1)
( "${PSQL[@]}" -d "$DB" -c "BEGIN; SELECT owner_submit_platform_popup_request('$QID','$OWN','pa'); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES4=$(q "SELECT owner_submit_platform_popup_request('$QID','$OWN','pb')::text")
wait $A
ST4=$(q "SELECT request_status || '/' || payment_status || '/' || submit_idempotency_key FROM platform_popup_owner_requests WHERE id='$QID'")
NL4=$(q "SELECT count(*) FROM business_cash_ledger WHERE related_id='$QID'")
echo "race popup submit: second=$RES4 state=$ST4 ledger=$NL4"
case "$RES4" in *illegal_transition*) ;; *) echo "FAIL race 4: expected illegal_transition"; exit 1;; esac
[ "$ST4" = "submitted/funded/pa" ] && [ "$NL4" = "1" ] || { echo "FAIL race 4 state"; exit 1; }

echo "ALL ISOLATED TESTS PASSED ($DB)"
