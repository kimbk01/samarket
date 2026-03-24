import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditLogRow = {
  actor_type: "admin" | "user" | "system";
  actor_id?: string | null;
  target_type: string;
  target_id: string;
  action: string;
  before_json?: Record<string, unknown> | null;
  after_json?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
};

/**
 * 감사 로그 1건 (실패해도 메인 요청에는 영향 없음)
 */
export async function appendAuditLog(sb: SupabaseClient, row: AuditLogRow): Promise<void> {
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

  if (error) {
    if (error.message?.includes("audit_logs") && error.message.includes("does not exist")) {
      return;
    }
    console.error("[appendAuditLog]", error.message);
  }
}
