/**
 * 배달 설정·구성 「처리 이력」 — `audit_logs` 읽기 전용 (서버 전용).
 * 변경자 표시 이름은 주문 감사 화면과 같은 `loadAdminUserLabels` 사용.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_CONFIG_AUDIT_SCOPES,
  extractAdminAuditReason,
  type AdminConfigAuditRow,
  type AdminConfigAuditScope,
} from "@/lib/admin/audit/admin-config-audit-scopes";
import { loadAdminUserLabels } from "@/lib/admin/store-orders/load-admin-store-order-detail";

export type LoadAdminConfigAuditOutcome =
  | { ok: true; rows: AdminConfigAuditRow[] }
  | { ok: false; error: "table_missing" | "query_failed" };

export async function loadAdminConfigAuditHistory(
  sb: SupabaseClient,
  input: { scope: AdminConfigAuditScope; targetId?: string | null; limit?: number }
): Promise<LoadAdminConfigAuditOutcome> {
  const types = [...ADMIN_CONFIG_AUDIT_SCOPES[input.scope]];
  const limit = Math.min(200, Math.max(1, Math.floor(Number(input.limit) || 50)));
  let q = sb
    .from("audit_logs")
    .select("id, actor_id, target_type, target_id, action, before_json, after_json, created_at")
    .in("target_type", types)
    .order("created_at", { ascending: false })
    .limit(limit);
  const tid = String(input.targetId ?? "").trim().slice(0, 120);
  if (tid) q = q.eq("target_id", tid);
  const { data, error } = await q;
  if (error) {
    if (error.message?.includes("audit_logs") && error.message.includes("does not exist")) {
      return { ok: false, error: "table_missing" };
    }
    console.error("[loadAdminConfigAuditHistory]", input.scope, error.message);
    return { ok: false, error: "query_failed" };
  }
  const raw = (data ?? []) as Array<Record<string, unknown>>;
  const labels = await loadAdminUserLabels(
    sb,
    raw.map((r) => String(r.actor_id ?? "")).filter(Boolean)
  ).catch(() => new Map<string, string>());
  const rows: AdminConfigAuditRow[] = raw.map((r) => {
    const actorId = r.actor_id ? String(r.actor_id) : null;
    return {
      id: String(r.id ?? ""),
      created_at: String(r.created_at ?? ""),
      action: String(r.action ?? ""),
      target_type: String(r.target_type ?? ""),
      target_id: String(r.target_id ?? ""),
      actor_id: actorId,
      actor_label: actorId ? labels.get(actorId) ?? null : null,
      reason: extractAdminAuditReason(r.after_json, r.before_json),
      before_json: r.before_json ?? null,
      after_json: r.after_json ?? null,
    };
  });
  return { ok: true, rows };
}
