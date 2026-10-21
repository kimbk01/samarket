#!/usr/bin/env bash
# Isolated DB test runner for stage 3-A (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/stage3-3a/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
#   (cluster.sh start|stop manages /var/tmp/samarket_pgiso_3a on port 55451)
# Loads the fixture (prod-mirrored stores / store_delivery_service_areas + triggers, md5-checked), the LOC-005 and
# LOC-006 migrations, runs assertions, then two-session race checks for the service-area replace RPC.
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_stage3_3a}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/02_base_md5.test.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270604100000_stores_guard_delivery_requires_geo.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270604100100_replace_store_delivery_service_areas_atomic.sql"
# Idempotency: re-applying both migrations must succeed (CREATE OR REPLACE / IF NOT EXISTS).
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270604100000_stores_guard_delivery_requires_geo.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/20270604100100_replace_store_delivery_service_areas_atomic.sql"
"${PSQL[@]}" -d "$DB" -f "$HERE/10_stage3_3a.test.sql"
echo "new md5(prosrc):"
"${PSQL[@]}" -d "$DB" -At -c "SELECT proname || ' ' || md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('stores_guard_delivery_requires_geo','replace_store_delivery_service_areas') ORDER BY 1"
"${PSQL[@]}" -d "$DB" -At -c "SELECT 'trigger ' || pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid = 'public.stores'::regclass AND tgname = 'trg_stores_guard_delivery_requires_geo'"

S="aaaaaaaa-0000-0000-0000-000000000003"
SR="SET ROLE service_role"
q() { "${PSQL[@]}" -d "$DB" -At -c "$SR" -c "$1"; }

# Race: two editors loaded the same version V; A saves (holding the store lock), B saves with V -> B must get
# service_areas_version_conflict (not a silent overwrite), and the final set is A's.
V=$(q "SELECT max(updated_at) FROM store_delivery_service_areas WHERE store_id='$S'")
[ -n "$V" ] || { echo "FAIL race: no base version"; exit 1; }
( "${PSQL[@]}" -d "$DB" -c "BEGIN; $SR; SELECT public.replace_store_delivery_service_areas('$S', ARRAY['race-a'], ARRAY['A'], NULL, false, 'owner', '$V', true); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
RES=$(q "SELECT public.replace_store_delivery_service_areas('$S', ARRAY['race-b'], ARRAY['B'], NULL, false, 'admin', '$V', true)::text")
wait $A
SET_FINAL=$(q "SELECT string_agg(geo_identity, ',' ORDER BY geo_identity) FROM store_delivery_service_areas WHERE store_id='$S'")
echo "race replace-vs-replace: second=$RES final=$SET_FINAL"
case "$RES" in *service_areas_version_conflict*) ;; *) echo "FAIL race: expected version conflict"; exit 1;; esac
[ "$SET_FINAL" = "race-a" ] || { echo "FAIL race final set"; exit 1; }

# Race without version check (p_check_version=false): serialized by the store lock, never a mixed/empty set.
( "${PSQL[@]}" -d "$DB" -c "BEGIN; $SR; SELECT public.replace_store_delivery_service_areas('$S', ARRAY['x1','x2'], ARRAY['1','2'], NULL, false, 'owner', NULL, false); SELECT pg_sleep(2); COMMIT;" >/dev/null ) &
A=$!
sleep 0.5
q "SELECT public.replace_store_delivery_service_areas('$S', ARRAY['y1'], ARRAY['1'], NULL, false, 'owner', NULL, false)" >/dev/null
wait $A
SET2=$(q "SELECT string_agg(geo_identity, ',' ORDER BY geo_identity) FROM store_delivery_service_areas WHERE store_id='$S'")
echo "race unchecked: final=$SET2"
[ "$SET2" = "y1" ] || { echo "FAIL unchecked race final set"; exit 1; }

echo "ALL ISOLATED TESTS PASSED ($DB)"
