/**
 * Data Reset only — audit insert whose result the caller checks (a destructive run must not report
 * SUCCESS when its audit record was lost). Kept inside data-reset so the shared appendAuditLog is untouched.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLogRow } from "@/lib/audit/append-audit-log";

export async function appendDataResetAuditChecked(
  sb: SupabaseClient,
  row: AuditLogRow
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.from("audit_logs").insert({
    actor_type: row.actor_type,
    actor_id: row.actor_id ?? null,
    target_type: row.target_type.slice(0, 120),
    target_id: row.target_id.slice(0, 120),
    action: row.action.slice(0, 200),
    before_json: row.before_json ?? null,
    after_json: row.after_json ?? null,
    ip: row.ip?.slice(0, 80) ?? null,
    user_agent: row.user_agent?.slice(0, 500) ?? null,
  });
  if (error) return { ok: false, error: error.message ?? "audit_insert_failed" };
  return { ok: true };
}
