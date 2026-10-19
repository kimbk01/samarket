import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";

export type AdminRouteAuditInput = {
  actorId: string | null | undefined;
  targetType: string;
  targetId?: string | null;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/**
 * 관리자 변경 API 감사 로그 (best-effort — 실패해도 throw 하지 않음).
 * 반드시 쓰기 성공 이후에 호출한다.
 */
export async function appendAdminRouteAudit(
  sb: SupabaseClient,
  req: Request,
  input: AdminRouteAuditInput
): Promise<void> {
  try {
    const meta = getAuditRequestMeta(req);
    await appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: input.actorId ?? null,
      target_type: input.targetType,
      target_id: String(input.targetId ?? ""),
      action: input.action,
      before_json: input.before ?? null,
      after_json: input.after ?? null,
      ip: meta.ip,
      user_agent: meta.userAgent,
    });
  } catch (e) {
    console.error("[appendAdminRouteAudit]", input.action, e instanceof Error ? e.message : e);
  }
}
