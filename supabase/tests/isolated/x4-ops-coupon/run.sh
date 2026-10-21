#!/usr/bin/env bash
# X-4 isolated suite (local throwaway PostgreSQL 16 only - never a Supabase project).
# Usage: supabase/tests/isolated/x4-ops-coupon/run.sh <pg_host_or_socket_dir> <pg_port> [dbname]
# Applies the exact production X-4 migrations (20270605100200..100500) twice and checks behaviour + grants.
set -euo pipefail
HOST="$1"; PORT="$2"; DB="${3:-iso_x4}"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../../.." && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
dropdb -h "$HOST" -p "$PORT" -U postgres --if-exists "$DB"; createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
"${PSQL[@]}" -d "$DB" -f "$HERE/00_fixture.sql"
for m in 20270605100200 20270605100300 20270605100400 20270605100500; do "${PSQL[@]}" -d "$DB" -f "$ROOT"/supabase/migrations/${m}_*.sql; done
# policies are CREATE POLICY (not idempotent) — idempotency checked on functions only
for m in 20270605100200 20270605100400 20270605100500; do "${PSQL[@]}" -d "$DB" -f "$ROOT"/supabase/migrations/${m}_*.sql; done
echo "PASS apply (functions re-applied)"
q() { "${PSQL[@]}" -d "$DB" -At -c "$1"; }
ok() { if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1: got [$2] want [$3]"; exit 1; fi; }
A=aaaaaaaa-0000-0000-0000-00000000000a; U=bbbbbbbb-0000-0000-0000-00000000000b; C=cccccccc-0000-0000-0000-00000000000c
q "INSERT INTO profiles VALUES ('$A','admin'),('$U','user'); INSERT INTO delivery_auto_actions_runtime_settings VALUES (1,true);"
# health
ok health.no_heartbeat "$(q "SELECT admin_delivery_operations_health()->'verdict'->>'overall'")" danger
q "SELECT touch_delivery_operation_job_heartbeat('sla_scan', true); SELECT touch_delivery_operation_job_heartbeat('alert_sync', true); SELECT touch_delivery_operation_job_heartbeat('auto_action_runner', true);" >/dev/null
ok health.fresh "$(q "SELECT admin_delivery_operations_health()->'verdict'->>'overall'")" ok
# recovery
ok recovery.non_admin "$(q "SELECT admin_delivery_operation_recovery_execute('sla_scan','$U')->>'error'")" not_platform_admin
ok recovery.sla_scan "$(q "SELECT admin_delivery_operation_recovery_execute('sla_scan','$A')->>'result'")" sla_scan_ok
ok recovery.scan_called "$(q "SELECT count(*) FROM calls WHERE fn='scan'")" 1
ok recovery.log_row "$(q "SELECT count(*) FROM delivery_operation_recovery_logs WHERE action_type='sla_scan' AND actor_admin_id='$A'")" 1
ok recovery.unknown "$(q "SELECT admin_delivery_operation_recovery_execute('nope','$A')->>'error'")" unknown_action
O=dddddddd-0000-0000-0000-00000000000d
q "INSERT INTO store_orders VALUES ('$O','delivering', now() - interval '3 hours', false)"
ok recovery.mark_attention "$(q "SELECT admin_delivery_operation_recovery_execute('delivering_mark_attention','$A')->'detail'->>'flagged_orders'")" 1
ok recovery.order_status_untouched "$(q "SELECT order_status FROM store_orders WHERE id='$O'")" delivering
# coupon revoke
q "INSERT INTO store_coupon_campaigns VALUES ('$C', 300); INSERT INTO coupon_user_entitlements(campaign_id,status,reserved_php) VALUES ('$C','available',100),('$C','restored',100),('$C','redeemed',100)"
ok revoke.count "$(q "SELECT revoke_campaign_active_entitlements('$C','$A','test')->>'revoked_count'")" 2
ok revoke.redeemed_kept "$(q "SELECT count(*) FROM coupon_user_entitlements WHERE status='redeemed'")" 1
ok revoke.reserved_released "$(q "SELECT reserved_spend_php::int FROM store_coupon_campaigns WHERE id='$C'")" 100
ok revoke.audit_rows "$(q "SELECT count(*) FROM coupon_audit_events WHERE action='revoke'")" 2
ok revoke.idempotent "$(q "SELECT revoke_campaign_active_entitlements('$C','$A','test')->>'revoked_count'")" 0
# grants: server only
for fn in "revoke_campaign_active_entitlements(uuid,uuid,text)" "admin_delivery_operations_health()" "admin_delivery_operation_recovery_execute(text,uuid)" "touch_delivery_operation_job_heartbeat(text,boolean,jsonb)"; do
  ok "grant.$fn" "$(q "SELECT has_function_privilege('authenticated','public.$fn','execute')::text || has_function_privilege('anon','public.$fn','execute')::text || has_function_privilege('service_role','public.$fn','execute')::text")" falsefalsetrue
done
ok grant.logs_client_insert "$(q "SELECT has_table_privilege('authenticated','public.delivery_operation_recovery_logs','INSERT')::text")" false
echo "ALL X-4 ISOLATED TESTS PASSED ($DB)"
