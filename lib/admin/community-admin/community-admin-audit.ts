/**
 * 커뮤니티 Admin 감사 기록 (설계 §E-7). 서버 전용.
 * - appendCommunityAdminAudit: 쓰기 성공 후 기록, 실패하면 결과로 알려 준다 (화면 경고용).
 * - 영구 삭제처럼 기록이 먼저 남아야 하는 작업은 ok=false 이면 작업을 중단한다.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";

export type CommunityAdminAuditInput = {
  actorId: string;
  targetType: string;
  targetId: string;
  action: string;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export async function appendCommunityAdminAudit(
  sb: SupabaseClient,
  req: Request | null,
  input: CommunityAdminAuditInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const meta = req ? getAuditRequestMeta(req) : { ip: null, userAgent: null };
    const after = { ...(input.after ?? {}), ...(input.reason ? { reason: input.reason } : {}) };
    const { error } = await sb.from("audit_logs").insert({
      actor_type: "admin",
      actor_id: input.actorId,
      target_type: input.targetType.slice(0, 120),
      target_id: input.targetId.slice(0, 120),
      action: input.action.slice(0, 200),
      before_json: input.before ?? null,
      after_json: Object.keys(after).length ? after : null,
      ip: meta.ip?.slice(0, 80) ?? null,
      user_agent: meta.userAgent?.slice(0, 500) ?? null,
    });
    if (error) {
      console.error("[communityAdminAudit]", input.action, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[communityAdminAudit]", input.action, msg);
    return { ok: false, error: msg };
  }
}
