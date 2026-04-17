/**
 * 대시보드 30초 폴링 등으로 API가 매번 새 JSON을 줄 때,
 * 화면에 보이는 값이 이전과 같으면 하위 객체·배열·행 참조를 유지해 memo가 동작하게 한다.
 * `DashboardStats.updatedAt` 은 KPI에 표시되지 않아 동등 비교에서 제외한다(숫자 동일 시 스킵).
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

function dashboardStatsKpiEqual(a: DashboardStats, b: DashboardStats): boolean {
  return (
    a.totalUsers === b.totalUsers &&
    a.activeProducts === b.activeProducts &&
    a.newProductsToday === b.newProductsToday &&
    a.newUsersToday === b.newUsersToday &&
    a.pendingReports === b.pendingReports &&
    a.chatsToday === b.chatsToday &&
    a.completedTransactions === b.completedTransactions &&
    a.averageTrustScore === b.averageTrustScore &&
    a.totalFavorites === b.totalFavorites
  );
}

function productSummaryEqual(a: ProductStatusSummary, b: ProductStatusSummary): boolean {
  return (
    a.active === b.active &&
    a.reserved === b.reserved &&
    a.sold === b.sold &&
    a.hidden === b.hidden &&
    a.blinded === b.blinded &&
    a.deleted === b.deleted
  );
}

function userSummaryEqual(a: UserStatusSummary, b: UserStatusSummary): boolean {
  return (
    a.active === b.active &&
    a.warned === b.warned &&
    a.suspended === b.suspended &&
    a.banned === b.banned &&
    a.premium === b.premium &&
    a.admin === b.admin
  );
}

function reportSummaryEqual(a: ReportStatusSummary, b: ReportStatusSummary): boolean {
  return a.pending === b.pending && a.reviewed === b.reviewed && a.rejected === b.rejected;
}

function chatSummaryEqual(a: ChatStatusSummary, b: ChatStatusSummary): boolean {
  return (
    a.active === b.active &&
    a.blocked === b.blocked &&
    a.reported === b.reported &&
    a.archived === b.archived
  );
}

function recentProductEqual(a: RecentProduct, b: RecentProduct): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.sellerNickname === b.sellerNickname &&
    a.status === b.status &&
    a.createdAt === b.createdAt
  );
}

function recentUserEqual(a: RecentUser, b: RecentUser): boolean {
  return (
    a.id === b.id &&
    a.nickname === b.nickname &&
    a.memberType === b.memberType &&
    a.joinedAt === b.joinedAt
  );
}

function recentReportEqual(a: RecentReport, b: RecentReport): boolean {
  return (
    a.id === b.id &&
    a.targetType === b.targetType &&
    a.reasonLabel === b.reasonLabel &&
    a.status === b.status &&
    a.createdAt === b.createdAt
  );
}

function recentChatEqual(a: RecentChat, b: RecentChat): boolean {
  return (
    a.id === b.id &&
    a.productTitle === b.productTitle &&
    a.buyerNickname === b.buyerNickname &&
    a.sellerNickname === b.sellerNickname &&
    a.lastMessageAt === b.lastMessageAt
  );
}

function recentReviewEqual(a: RecentReview, b: RecentReview): boolean {
  return (
    a.id === b.id &&
    a.reviewerNickname === b.reviewerNickname &&
    a.targetNickname === b.targetNickname &&
    a.rating === b.rating &&
    a.createdAt === b.createdAt
  );
}

function trendRowEqual(a: DashboardTrendItem, b: DashboardTrendItem): boolean {
  return (
    a.date === b.date &&
    a.newUsers === b.newUsers &&
    a.newProducts === b.newProducts &&
    a.reports === b.reports &&
    a.completedTransactions === b.completedTransactions
  );
}

function mergeRecentList<T extends { id: string }>(
  prev: T[],
  next: T[],
  equal: (a: T, b: T) => boolean
): T[] {
  const prevById = new Map(prev.map((x) => [x.id, x]));
  const out = next.map((item) => {
    const p = prevById.get(item.id);
    return p && equal(p, item) ? p : item;
  });
  if (out.length === prev.length && out.every((v, i) => v === prev[i])) {
    return prev;
  }
  return out;
}

function mergeTrend(prev: DashboardTrendItem[], next: DashboardTrendItem[]): DashboardTrendItem[] {
  const prevByDate = new Map(prev.map((d) => [d.date, d]));
  const out = next.map((n) => {
    const p = prevByDate.get(n.date);
    return p && trendRowEqual(p, n) ? p : n;
  });
  if (out.length === prev.length && out.every((v, i) => v === prev[i])) {
    return prev;
  }
  return out;
}

export function mergeDashboardPayloadPreserveRefs(prev: DashboardPayload, next: DashboardPayload): DashboardPayload {
  const stats = dashboardStatsKpiEqual(prev.stats, next.stats) ? prev.stats : next.stats;
  const productSummary = productSummaryEqual(prev.productSummary, next.productSummary)
    ? prev.productSummary
    : next.productSummary;
  const userSummary = userSummaryEqual(prev.userSummary, next.userSummary) ? prev.userSummary : next.userSummary;
  const reportSummary = reportSummaryEqual(prev.reportSummary, next.reportSummary)
    ? prev.reportSummary
    : next.reportSummary;
  const chatSummary = chatSummaryEqual(prev.chatSummary, next.chatSummary) ? prev.chatSummary : next.chatSummary;

  const recentProducts = mergeRecentList(prev.recentProducts, next.recentProducts, recentProductEqual);
  const recentUsers = mergeRecentList(prev.recentUsers, next.recentUsers, recentUserEqual);
  const recentReports = mergeRecentList(prev.recentReports, next.recentReports, recentReportEqual);
  const recentChats = mergeRecentList(prev.recentChats, next.recentChats, recentChatEqual);
  const recentReviews = mergeRecentList(prev.recentReviews, next.recentReviews, recentReviewEqual);
  const trend = mergeTrend(prev.trend, next.trend);

  return {
    stats,
    productSummary,
    userSummary,
    reportSummary,
    chatSummary,
    recentProducts,
    recentUsers,
    recentReports,
    recentChats,
    recentReviews,
    trend,
  };
}
