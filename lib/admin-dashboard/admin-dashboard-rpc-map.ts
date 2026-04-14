import type {
  ChatStatusSummary,
  DashboardStats,
  DashboardTrendItem,
  ProductStatusSummary,
  ReportStatusSummary,
  UserStatusSummary,
} from "@/lib/types/admin-dashboard";

function int(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function numScore(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 50;
}

export function parseAdminDashboardAggregateRpc(
  raw: unknown,
  nowIso: string
): {
  stats: DashboardStats;
  productSummary: ProductStatusSummary;
  reportSummary: ReportStatusSummary;
  chatSummary: ChatStatusSummary;
  userSummary: UserStatusSummary;
} {
  if (!raw || typeof raw !== "object") {
    throw new Error("admin_dashboard_aggregate_json: invalid payload");
  }
  const a = raw as Record<string, unknown>;
  const ps = a.productSummary;
  const rs = a.reportSummary;
  const cs = a.chatSummary;
  const us = a.userSummary;
  if (!ps || typeof ps !== "object" || !rs || typeof rs !== "object" || !cs || typeof cs !== "object" || !us || typeof us !== "object") {
    throw new Error("admin_dashboard_aggregate_json: missing summary objects");
  }
  const p = ps as Record<string, unknown>;
  const r = rs as Record<string, unknown>;
  const c = cs as Record<string, unknown>;
  const u = us as Record<string, unknown>;

  const stats: DashboardStats = {
    totalUsers: int(a.totalUsers),
    activeProducts: int(a.activeProducts),
    newProductsToday: int(a.newProductsToday),
    newUsersToday: int(a.newUsersToday),
    pendingReports: int(a.pendingReports),
    chatsToday: int(a.chatsToday),
    completedTransactions: int(a.completedTransactions),
    averageTrustScore: numScore(a.averageTrustScore),
    totalFavorites: int(a.totalFavorites),
    updatedAt: nowIso,
  };

  const productSummary: ProductStatusSummary = {
    active: int(p.active),
    reserved: int(p.reserved),
    sold: int(p.sold),
    hidden: int(p.hidden),
    blinded: int(p.blinded),
    deleted: int(p.deleted),
  };

  const reportSummary: ReportStatusSummary = {
    pending: int(r.pending),
    reviewed: int(r.reviewed),
    rejected: int(r.rejected),
  };

  const chatSummary: ChatStatusSummary = {
    active: int(c.active),
    blocked: int(c.blocked),
    reported: int(c.reported),
    archived: int(c.archived),
  };

  const userSummary: UserStatusSummary = {
    active: int(u.active),
    warned: int(u.warned),
    suspended: int(u.suspended),
    banned: int(u.banned),
    premium: int(u.premium),
    admin: int(u.admin),
  };

  return { stats, productSummary, reportSummary, chatSummary, userSummary };
}

export function parseAdminDashboardTrendRpc(raw: unknown): DashboardTrendItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const o = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    return {
      date: String(o.date ?? ""),
      newUsers: int(o.newUsers),
      newProducts: int(o.newProducts),
      reports: int(o.reports),
      completedTransactions: int(o.completedTransactions),
    };
  });
}
