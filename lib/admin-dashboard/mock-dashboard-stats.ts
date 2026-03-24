/**
 * 19단계: 대시보드 KPI mock (기존 admin mock 데이터 기반)
 */

import type { DashboardStats } from "@/lib/types/admin-dashboard";
import { getProductsForAdmin } from "@/lib/admin-products/mock-admin-products";
import { getUsersForAdmin } from "@/lib/admin-users/mock-admin-users";
import { getReportsForAdmin } from "@/lib/admin-reports/mock-admin-reports";
import { getAdminChatRooms } from "@/lib/admin-chats/mock-admin-chat-rooms";
import { getAdminReviews } from "@/lib/admin-reviews/mock-admin-reviews";
import { MOCK_TRANSACTIONS } from "@/lib/reviews/mock-transactions";
import { getTrustSummary } from "@/lib/reviews/trust-utils";

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export function getDashboardStats(): DashboardStats {
  const today = todayStart();
  const products = getProductsForAdmin();
  const users = getUsersForAdmin();
  const reports = getReportsForAdmin();
  const rooms = getAdminChatRooms();
  const reviews = getAdminReviews();

  const activeProducts = products.filter(
    (p) => p.status === "active" || p.status === "reserved"
  ).length;
  const newProductsToday = products.filter((p) => p.createdAt >= today).length;
  const newUsersToday = users.filter((u) => u.joinedAt >= today).length;
  const pendingReports = reports.filter((r) => r.status === "pending").length;
  const chatsToday = rooms.filter((r) => r.lastMessageAt >= today).length;
  const completedTransactions = MOCK_TRANSACTIONS.filter(
    (t) => t.status === "completed"
  ).length;

  const userIds = [...new Set(users.map((u) => u.id))];
  let sumTrust = 0;
  let countTrust = 0;
  userIds.forEach((id) => {
    const t = getTrustSummary(id);
    if (t.reviewCount > 0) {
      sumTrust += t.mannerScore;
      countTrust += 1;
    }
  });
  const averageTrustScore =
    countTrust > 0 ? Math.round((sumTrust / countTrust) * 10) / 10 : 0;

  return {
    totalUsers: users.length,
    activeProducts,
    newProductsToday,
    newUsersToday,
    pendingReports,
    chatsToday,
    completedTransactions,
    averageTrustScore,
    totalFavorites: 0,
    updatedAt: new Date().toISOString(),
  };
}
