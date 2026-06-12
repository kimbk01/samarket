import type { AdminAuditLog, AuditSummary } from "@/lib/types/admin-audit";

export function buildAuditSummaryFromLogs(logs: AdminAuditLog[]): AuditSummary {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayCount = logs.filter((l) => new Date(l.createdAt).getTime() >= startOfDay).length;
  const warningCount = logs.filter((l) => l.result === "warning").length;
  const errorCount = logs.filter((l) => l.result === "error").length;

  const adminCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  for (const l of logs) {
    adminCounts.set(l.adminNickname, (adminCounts.get(l.adminNickname) ?? 0) + 1);
    categoryCounts.set(l.category, (categoryCounts.get(l.category) ?? 0) + 1);
  }

  let topAdminNickname = "—";
  let topAdminCount = 0;
  for (const [nick, count] of adminCounts) {
    if (count > topAdminCount) {
      topAdminCount = count;
      topAdminNickname = nick;
    }
  }

  let topCategory = logs[0]?.category ?? "setting";
  let topCategoryCount = 0;
  for (const [cat, count] of categoryCounts) {
    if (count > topCategoryCount) {
      topCategoryCount = count;
      topCategory = cat as AdminAuditLog["category"];
    }
  }

  return {
    todayCount,
    warningCount,
    errorCount,
    topAdminNickname,
    topCategory,
    latestActionAt: logs[0]?.createdAt ?? "",
  };
}
