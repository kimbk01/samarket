/**
 * 관리자 대시보드 — API 응답 전·오류 시 사용하는 빈 페이로드 (mock 데모 숫자 대신 0·빈 목록).
 */
import type {
  ChatStatusSummary,
  DashboardPayload,
  DashboardStats,
  DashboardTrendItem,
  ProductStatusSummary,
  RecentChat,
  RecentProduct,
  RecentReport,
  RecentReview,
  RecentUser,
  ReportStatusSummary,
  UserStatusSummary,
} from "@/lib/types/admin-dashboard";

function utcDayLabelsLast7(now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function emptyTrend(): DashboardTrendItem[] {
  return utcDayLabelsLast7().map((date) => ({
    date,
    newUsers: 0,
    newProducts: 0,
    reports: 0,
    completedTransactions: 0,
  }));
}

function emptyStats(): DashboardStats {
  const now = new Date().toISOString();
  return {
    totalUsers: 0,
    activeProducts: 0,
    newProductsToday: 0,
    newUsersToday: 0,
    pendingReports: 0,
    chatsToday: 0,
    completedTransactions: 0,
    averageTrustScore: 0,
    totalFavorites: 0,
    updatedAt: now,
  };
}

function emptyProductSummary(): ProductStatusSummary {
  return {
    active: 0,
    reserved: 0,
    sold: 0,
    hidden: 0,
    blinded: 0,
    deleted: 0,
  };
}

function emptyUserSummary(): UserStatusSummary {
  return {
    active: 0,
    warned: 0,
    suspended: 0,
    banned: 0,
    premium: 0,
    admin: 0,
  };
}

function emptyReportSummary(): ReportStatusSummary {
  return { pending: 0, reviewed: 0, rejected: 0 };
}

function emptyChatSummary(): ChatStatusSummary {
  return { active: 0, blocked: 0, reported: 0, archived: 0 };
}

/** 클라이언트 초기 상태·API 실패 시 — 데모용 가짜 KPI를 쓰지 않음 */
export function createEmptyDashboardPayload(): DashboardPayload {
  return {
    stats: emptyStats(),
    productSummary: emptyProductSummary(),
    userSummary: emptyUserSummary(),
    reportSummary: emptyReportSummary(),
    chatSummary: emptyChatSummary(),
    recentProducts: [] as RecentProduct[],
    recentUsers: [] as RecentUser[],
    recentReports: [] as RecentReport[],
    recentChats: [] as RecentChat[],
    recentReviews: [] as RecentReview[],
    trend: emptyTrend(),
  };
}

export function isDashboardApiPayload(x: unknown): x is DashboardPayload {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const stats = o.stats;
  if (stats == null || typeof stats !== "object") return false;
  const s = stats as Record<string, unknown>;
  return typeof s.totalUsers === "number" && typeof s.updatedAt === "string";
}
