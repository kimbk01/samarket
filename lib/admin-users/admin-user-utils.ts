/**
 * 14단계: 관리자 회원 필터·검색·정렬
 */

import type { AdminUser } from "@/lib/types/admin-user";
import type { ModerationStatus } from "@/lib/types/report";

export type AdminUserSortKey =
  | "joined"
  | "lastActive"
  | "products"
  | "reports"
  | "points";

export const MODERATION_STATUS_OPTIONS: {
  value: ModerationStatus | "";
  label: string;
}[] = [
  { value: "", label: "전체" },
  { value: "normal", label: "정상" },
  { value: "warned", label: "경고" },
  { value: "suspended", label: "일시정지" },
  { value: "banned", label: "영구정지" },
];

export const MEMBER_TYPE_OPTIONS: {
  value: AdminUser["memberType"] | "";
  label: string;
}[] = [
  { value: "", label: "전체" },
  { value: "normal", label: "일반회원" },
  { value: "premium", label: "특별회원" },
  { value: "admin", label: "관리자" },
];

export const SORT_OPTIONS: { value: AdminUserSortKey; label: string }[] = [
  { value: "joined", label: "최근가입순" },
  { value: "lastActive", label: "최근활동순" },
  { value: "products", label: "상품많은순" },
  { value: "reports", label: "신고많은순" },
  { value: "points", label: "포인트많은순" },
];

export interface AdminUserFilters {
  moderationStatus: ModerationStatus | "";
  memberType: AdminUser["memberType"] | "";
  location: string;
  sortKey: AdminUserSortKey;
}

export function filterAndSortUsers(
  users: AdminUser[],
  filters: AdminUserFilters,
  searchQuery: string
): AdminUser[] {
  let list = [...users];

  if (filters.moderationStatus) {
    list = list.filter((u) => u.moderationStatus === filters.moderationStatus);
  }
  if (filters.memberType) {
    list = list.filter((u) => u.memberType === filters.memberType);
  }
  if (filters.location.trim()) {
    list = list.filter((u) =>
      (u.location ?? "").toLowerCase().includes(filters.location.trim().toLowerCase())
    );
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter((u) => {
      const matchNickname = u.nickname.toLowerCase().includes(q);
      const matchEmail = (u.email ?? "").toLowerCase().includes(q);
      const matchId = u.id.toLowerCase().includes(q);
      const matchLogin = (u.loginUsername ?? "").toLowerCase().includes(q);
      return matchNickname || matchEmail || matchId || matchLogin;
    });
  }

  const key = filters.sortKey;
  list.sort((a, b) => {
    if (key === "joined") {
      return new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
    }
    if (key === "lastActive") {
      const at = (x: AdminUser) =>
        x.lastActiveAt ? new Date(x.lastActiveAt).getTime() : new Date(x.joinedAt).getTime();
      return at(b) - at(a);
    }
    if (key === "products") {
      return (b.productCount ?? 0) - (a.productCount ?? 0);
    }
    if (key === "reports") {
      return (b.reportCount ?? 0) - (a.reportCount ?? 0);
    }
    if (key === "points") {
      return (b.pointBalance ?? 0) - (a.pointBalance ?? 0);
    }
    return 0;
  });

  return list;
}
