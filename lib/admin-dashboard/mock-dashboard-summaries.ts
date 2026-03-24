/**
 * 19단계: 상태별 요약 mock
 */

import type {
  ProductStatusSummary,
  UserStatusSummary,
  ReportStatusSummary,
  ChatStatusSummary,
} from "@/lib/types/admin-dashboard";
import { getProductsForAdmin } from "@/lib/admin-products/mock-admin-products";
import { getUsersForAdmin } from "@/lib/admin-users/mock-admin-users";
import { getReportsForAdmin } from "@/lib/admin-reports/mock-admin-reports";
import { getAdminChatRooms } from "@/lib/admin-chats/mock-admin-chat-rooms";

export function getProductStatusSummary(): ProductStatusSummary {
  const products = getProductsForAdmin();
  const summary: ProductStatusSummary = {
    active: 0,
    reserved: 0,
    sold: 0,
    hidden: 0,
    blinded: 0,
    deleted: 0,
  };
  products.forEach((p) => {
    if (p.status in summary) summary[p.status as keyof ProductStatusSummary]++;
  });
  return summary;
}

export function getUserStatusSummary(): UserStatusSummary {
  const users = getUsersForAdmin();
  const summary: UserStatusSummary = {
    active: 0,
    warned: 0,
    suspended: 0,
    banned: 0,
    premium: 0,
    admin: 0,
  };
  users.forEach((u) => {
    if (u.moderationStatus === "normal") summary.active++;
    else if (
      u.moderationStatus === "warned" ||
      u.moderationStatus === "suspended" ||
      u.moderationStatus === "banned"
    )
      summary[u.moderationStatus]++;
    if (u.memberType === "premium") summary.premium++;
    if (u.memberType === "admin") summary.admin++;
  });
  return summary;
}

export function getReportStatusSummary(): ReportStatusSummary {
  const reports = getReportsForAdmin();
  return {
    pending: reports.filter((r) => r.status === "pending").length,
    reviewed: reports.filter((r) => r.status === "reviewed").length,
    rejected: reports.filter((r) => r.status === "rejected").length,
  };
}

export function getChatStatusSummary(): ChatStatusSummary {
  const rooms = getAdminChatRooms();
  const summary: ChatStatusSummary = {
    active: 0,
    blocked: 0,
    reported: 0,
    archived: 0,
  };
  rooms.forEach((r) => {
    if (r.roomStatus in summary) summary[r.roomStatus as keyof ChatStatusSummary]++;
  });
  return summary;
}
