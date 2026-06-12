import type { AdminAuditLog, AuditLogCategory, AuditLogResult } from "@/lib/types/admin-audit";

function mapCategory(targetType: string): AuditLogCategory {
  const t = targetType.toLowerCase();
  if (t.includes("user") || t.includes("profile")) return "user";
  if (t.includes("chat") || t.includes("room")) return "chat";
  if (t.includes("report")) return "report";
  if (t.includes("review")) return "review";
  if (t.includes("setting")) return "setting";
  if (t.includes("auth") || t.includes("login")) return "auth";
  if (t.includes("post") || t.includes("product")) return "product";
  return "setting";
}

export function mapAuditLogRow(
  row: Record<string, unknown>,
  nicknameById: Record<string, string> = {}
): AdminAuditLog {
  const actorId = String(row.actor_id ?? "");
  const action = String(row.action ?? "update");
  const targetType = String(row.target_type ?? "");
  const targetId = String(row.target_id ?? "");
  return {
    id: String(row.id ?? ""),
    category: mapCategory(targetType),
    actionType: action as AdminAuditLog["actionType"],
    result: "success" as AuditLogResult,
    adminId: actorId,
    adminNickname: nicknameById[actorId] ?? (actorId ? actorId.slice(0, 8) : "system"),
    targetType: targetType || undefined,
    targetId: targetId || undefined,
    targetLabel: targetId ? `${targetType}:${targetId.slice(0, 8)}` : undefined,
    summary: action,
    afterData: row.after_json as Record<string, unknown> | undefined,
    createdAt: String(row.created_at ?? ""),
  };
}
