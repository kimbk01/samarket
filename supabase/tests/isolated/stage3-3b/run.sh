#!/usr/bin/env bash
# Isolated DB test runner for stage 3-B (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/stage3-3b/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
#   (cluster.sh start|stop manages /var/tmp/samarket_pgiso_3b on port 55453)
# Fixture + production base definitions (md5-checked against production) -> base defect reproduction ->
# OPS-07 + OPS-01 migrations (each applied twice: idempotency) -> assertions -> concurrency checks.
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_stage3_3b}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U postgres -E UTF8 -T template0 --locale=C "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/01_prod_base.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/02_base_md5.test.sql"
for M in 20270604120000_stores_first_listed_at_approved_only 20270604120100_store_notices_table_rls; do
  "${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/$M.sql"
  "${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/$M.sql"
done
"${PSQL[@]}" -d "$DB" -f "$HERE/10_stage3_3b.test.sql"
echo "new md5(prosrc):"
"${PSQL[@]}" -d "$DB" -At -c "SELECT proname || ' ' || md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('stores_protect_first_listed_at','block_client_role_direct_writes') ORDER BY 1"

q() { "${PSQL[@]}" -d "$DB" -At -c "$1"; }
# Race 1: admin approve_store (approved, hidden) holds the row while the owner visibility toggle waits; the toggle
# then sees the committed approval and stamps exactly once.
SID=$(q "INSERT INTO public.stores (approval_status) VALUES ('pending') RETURNING id")
( "${PSQL[@]}" -d "$DB" -c "BEGIN; UPDATE public.stores SET approval_status='approved', is_visible=false WHERE id='$SID'; SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
q "UPDATE public.stores SET is_visible=true WHERE id='$SID'" >/dev/null
wait $A
TS=$(q "SELECT (first_listed_at IS NOT NULL)::text FROM public.stores WHERE id='$SID'")
echo "race approve-vs-toggle: stamped=$TS"
[ "$TS" = "true" ] || { echo "FAIL race approve-vs-toggle"; exit 1; }
# Race 2: a pending-store toggle holds the row (unstamped); approval (hidden) commits after -> still unstamped.
SID2=$(q "INSERT INTO public.stores (approval_status) VALUES ('pending') RETURNING id")
( "${PSQL[@]}" -d "$DB" -c "BEGIN; UPDATE public.stores SET is_visible=true WHERE id='$SID2'; SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
q "UPDATE public.stores SET approval_status='approved', is_visible=false WHERE id='$SID2'" >/dev/null
wait $A
TS2=$(q "SELECT (first_listed_at IS NULL)::text FROM public.stores WHERE id='$SID2'")
echo "race toggle-vs-approve: unstamped=$TS2"
[ "$TS2" = "true" ] || { echo "FAIL race toggle-vs-approve"; exit 1; }

# OPS-03 x OPS-08: SQL twin store_front_commerce_open extended with weekly / closed_dates.
# Base = OPS-08 migration 20270604110000 (commit e649c0bb). Use the real migration when it is on this tree,
# otherwise the verbatim copy kept here (03_ops08_twin_base.copy.sql). Same for the OPS-08 fixture JSON.
TWIN="$ROOT/supabase/migrations/20270604110000_store_front_commerce_open_sql_twin.sql"
[ -f "$TWIN" ] || TWIN="$HERE/03_ops08_twin_base.copy.sql"
OPS08_FIX="$ROOT/supabase/tests/isolated/stage3-rpc/commerce-open-fixtures.json"
[ -f "$OPS08_FIX" ] || OPS08_FIX="$HERE/ops08-commerce-open-fixtures.copy.json"
"${PSQL[@]}" -d "$DB" -f "$TWIN"
BASE_MD5=$(q "SELECT md5(prosrc) FROM pg_proc WHERE proname='store_front_commerce_open' AND pronamespace='public'::regnamespace")
echo "twin base md5=$BASE_MD5"
[ "$BASE_MD5" = "0a0b29cb72251fa8fdaf4041d2c52a87" ] || { echo "FAIL twin base md5"; exit 1; }
GEN="$HERE/gen-commerce-open-assertions.mjs"
# base twin still satisfies the OPS-08 table (sanity) ...
node "$GEN" "$OPS08_FIX" | "${PSQL[@]}" -d "$DB" >/dev/null
# ... and does NOT yet satisfy the weekly table (defect reproduced: RPC ignores weekly / closed dates)
if node "$GEN" "$HERE/commerce-open-weekly-fixtures.json" | "${PSQL[@]}" -d "$DB" >/dev/null 2>&1; then
  echo "FAIL: base twin unexpectedly passes weekly fixtures"; exit 1
fi
echo "base twin: OPS-08 fixtures PASS, weekly fixtures FAIL (expected before fix)"
M3="$ROOT/supabase/migrations/20270604120200_store_front_commerce_open_weekly_closed_dates.sql"
"${PSQL[@]}" -d "$DB" -f "$M3"
"${PSQL[@]}" -d "$DB" -f "$M3"
node "$GEN" "$OPS08_FIX" "$HERE/commerce-open-weekly-fixtures.json" | "${PSQL[@]}" -d "$DB" 2>&1 | grep -E "PASS|FAIL" || true
node "$GEN" "$OPS08_FIX" "$HERE/commerce-open-weekly-fixtures.json" | "${PSQL[@]}" -d "$DB" >/dev/null
q "SELECT 'new md5 ' || proname || ' ' || md5(prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('store_front_commerce_open','store_front_day_intervals','store_front_hhmm_to_minutes') ORDER BY proname"
NONASCII=$(q "SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('store_front_commerce_open','store_front_day_intervals') AND prosrc ~ '[^[:ascii:]]'")
[ "$NONASCII" = "0" ] || { echo "FAIL non-ascii body"; exit 1; }
GR=$(q "SELECT has_function_privilege('authenticated','public.store_front_commerce_open(jsonb,boolean,timestamptz)','EXECUTE')::text || has_function_privilege('service_role','public.store_front_commerce_open(jsonb,boolean,timestamptz)','EXECUTE')::text")
[ "$GR" = "falsetrue" ] || { echo "FAIL grants $GR"; exit 1; }

echo "ALL ISOLATED TESTS PASSED ($DB)"
