/**
 * 18단계: 감사 통계 mock (MOCK_ADMIN_AUDIT_LOGS 기반)
 */

import type { AuditSummary, AuditLogCategory } from "@/lib/types/admin-audit";
import { MOCK_ADMIN_AUDIT_LOGS } from "./mock-admin-audit-logs";

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export function getAuditSummary(): AuditSummary {
  const logs = MOCK_ADMIN_AUDIT_LOGS;
  const today = todayStart();
  const todayCount = logs.filter((l) => l.createdAt >= today).length;
  const warningCount = logs.filter((l) => l.result === "warning").length;
  const errorCount = logs.filter((l) => l.result === "error").length;

  const adminCount: Record<string, number> = {};
  const categoryCount: Record<AuditLogCategory, number> = {
    product: 0,
    user: 0,
    chat: 0,
    report: 0,
    review: 0,
    setting: 0,
    auth: 0,
  };
  let latestActionAt = "";
  logs.forEach((l) => {
    adminCount[l.adminNickname] = (adminCount[l.adminNickname] ?? 0) + 1;
    categoryCount[l.category]++;
    if (!latestActionAt || l.createdAt > latestActionAt) latestActionAt = l.createdAt;
  });

  const topAdmin = Object.entries(adminCount).sort((a, b) => b[1] - a[1])[0];
  const topCategory = (Object.entries(categoryCount).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0] ?? "setting") as AuditLogCategory;

  return {
    todayCount,
    warningCount,
    errorCount,
    topAdminNickname: topAdmin?.[0] ?? "-",
    topCategory,
    latestActionAt: latestActionAt || new Date().toISOString(),
  };
}
