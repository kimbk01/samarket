/**
 * 19단계: 최근 활동 mock
 */

import type {
  RecentProduct,
  RecentUser,
  RecentReport,
  RecentChat,
  RecentReview,
} from "@/lib/types/admin-dashboard";
import { getProductsForAdmin } from "@/lib/admin-products/mock-admin-products";
import { getUsersForAdmin } from "@/lib/admin-users/mock-admin-users";
import { getReportsForAdmin } from "@/lib/admin-reports/mock-admin-reports";
import { getAdminChatRooms } from "@/lib/admin-chats/mock-admin-chat-rooms";
import { getAdminReviews } from "@/lib/admin-reviews/mock-admin-reviews";

const LIMIT = 5;

export function getRecentProducts(): RecentProduct[] {
  return getProductsForAdmin()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, LIMIT)
    .map((p) => ({
      id: p.id,
      title: p.title,
      sellerNickname: p.seller?.nickname ?? p.sellerId ?? "-",
      status: p.status,
      createdAt: p.createdAt,
    }));
}

export function getRecentUsers(): RecentUser[] {
  return getUsersForAdmin()
    .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime())
    .slice(0, LIMIT)
    .map((u) => ({
      id: u.id,
      nickname: u.nickname,
      memberType: u.memberType,
      joinedAt: u.joinedAt,
    }));
}

export function getRecentReports(): RecentReport[] {
  return getReportsForAdmin()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, LIMIT)
    .map((r) => ({
      id: r.id,
      targetType: r.targetType,
      reasonLabel: r.reasonLabel,
      status: r.status,
      createdAt: r.createdAt,
    }));
}

export function getRecentChats(): RecentChat[] {
  return getAdminChatRooms()
    .sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    )
    .slice(0, LIMIT)
    .map((r) => ({
      id: r.id,
      productTitle: r.productTitle,
      buyerNickname: r.buyerNickname,
      sellerNickname: r.sellerNickname,
      lastMessageAt: r.lastMessageAt,
    }));
}

export function getRecentReviews(): RecentReview[] {
  return getAdminReviews()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, LIMIT)
    .map((r) => ({
      id: r.id,
      reviewerNickname: r.reviewerNickname,
      targetNickname: r.targetNickname,
      rating: r.rating,
      createdAt: r.createdAt,
    }));
}
