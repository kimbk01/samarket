/**
 * 19단계: 관리자 대시보드 타입
 */

export interface DashboardStats {
  totalUsers: number;
  activeProducts: number;
  newProductsToday: number;
  newUsersToday: number;
  pendingReports: number;
  chatsToday: number;
  completedTransactions: number;
  averageTrustScore: number;
  /** DB favorites 전체 행 수 (총 찜 건수), API 로드 전에는 0 */
  totalFavorites: number;
  updatedAt: string;
}

export interface ProductStatusSummary {
  active: number;
  reserved: number;
  sold: number;
  hidden: number;
  blinded: number;
  deleted: number;
}

export interface UserStatusSummary {
  active: number;
  warned: number;
  suspended: number;
  banned: number;
  premium: number;
  admin: number;
}

export interface ReportStatusSummary {
  pending: number;
  reviewed: number;
  rejected: number;
}

export interface ChatStatusSummary {
  active: number;
  blocked: number;
  reported: number;
  archived: number;
}

export interface RecentProduct {
  id: string;
  title: string;
  sellerNickname: string;
  status: string;
  createdAt: string;
}

export interface RecentUser {
  id: string;
  nickname: string;
  memberType: string;
  joinedAt: string;
}

export interface RecentReport {
  id: string;
  targetType: string;
  reasonLabel: string;
  status: string;
  createdAt: string;
}

export interface RecentChat {
  id: string;
  productTitle: string;
  buyerNickname: string;
  sellerNickname: string;
  lastMessageAt: string;
}

export interface RecentReview {
  id: string;
  reviewerNickname: string;
  targetNickname: string;
  rating: number;
  createdAt: string;
}

export interface DashboardTrendItem {
  date: string;
  newUsers: number;
  newProducts: number;
  reports: number;
  completedTransactions: number;
}

/** GET /api/admin/stats/dashboard 응답과 관리자 UI 상태 */
export type DashboardPayload = {
  stats: DashboardStats;
  productSummary: ProductStatusSummary;
  userSummary: UserStatusSummary;
  reportSummary: ReportStatusSummary;
  chatSummary: ChatStatusSummary;
  recentProducts: RecentProduct[];
  recentUsers: RecentUser[];
  recentReports: RecentReport[];
  recentChats: RecentChat[];
  recentReviews: RecentReview[];
  trend: DashboardTrendItem[];
};
