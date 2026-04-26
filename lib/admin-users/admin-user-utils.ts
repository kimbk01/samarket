/**
 * 14단계: 관리자 회원 필터·검색·정렬
 */

import type { AdminAuthProvider, AdminUser } from "@/lib/types/admin-user";
import type { ModerationStatus } from "@/lib/types/report";

export type AdminUserSortKey =
  | "joined"
  | "lastSignIn"
  | "provider"
  | "loginIdentifier"
  | "nickname"
  | "phoneVerified"
  | "moderationStatus"
  | "products"
  | "reports"
  | "points";
export type AdminUserSortOrder = "asc" | "desc";

export const ADMIN_USER_SORT_KEYS: readonly AdminUserSortKey[] = [
  "joined",
  "lastSignIn",
  "provider",
  "loginIdentifier",
  "nickname",
  "phoneVerified",
  "moderationStatus",
  "products",
  "reports",
  "points",
] as const;

export function normalizeAdminUserSortKey(value: string | null | undefined): AdminUserSortKey {
  return ADMIN_USER_SORT_KEYS.includes(value as AdminUserSortKey) ? (value as AdminUserSortKey) : "joined";
}

export function normalizeAdminUserSortOrder(value: string | null | undefined): AdminUserSortOrder {
  return String(value ?? "").toLowerCase() === "asc" ? "asc" : "desc";
}

export const MODERATION_STATUS_OPTIONS: {
  value: ModerationStatus | "";
  label: string;
}[] = [
  { value: "", label: "전체" },
  { value: "normal", label: "정상" },
  { value: "warned", label: "경고" },
  { value: "suspended", label: "일시정지" },
  { value: "banned", label: "탈퇴/영구정지" },
];

export const AUTH_PROVIDER_OPTIONS: {
  value: AdminAuthProvider | "";
  label: string;
}[] = [
  { value: "", label: "가입수단 전체" },
  { value: "google", label: "Google" },
  { value: "kakao", label: "Kakao" },
  { value: "naver", label: "Naver" },
  { value: "apple", label: "Apple" },
  { value: "facebook", label: "Facebook" },
  { value: "email", label: "Email" },
  { value: "manual", label: "Manual" },
];

export const PHONE_VERIFIED_OPTIONS: {
  value: "" | "verified" | "unverified";
  label: string;
}[] = [
  { value: "", label: "전화 인증 전체" },
  { value: "verified", label: "인증 완료" },
  { value: "unverified", label: "미인증" },
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
  { value: "lastSignIn", label: "최근 로그인순" },
  { value: "provider", label: "가입수단순" },
  { value: "loginIdentifier", label: "로그인 아이디순" },
  { value: "nickname", label: "닉네임순" },
  { value: "phoneVerified", label: "전화 인증순" },
  { value: "moderationStatus", label: "상태순" },
  { value: "products", label: "상품많은순" },
  { value: "reports", label: "신고많은순" },
  { value: "points", label: "포인트많은순" },
];

export interface AdminUserFilters {
  authProvider: AdminAuthProvider | "";
  phoneVerified: "" | "verified" | "unverified";
  moderationStatus: ModerationStatus | "";
  memberType: AdminUser["memberType"] | "";
  location: string;
  sortKey: AdminUserSortKey;
  sortOrder: AdminUserSortOrder;
}

function compareText(a: string | null | undefined, b: string | null | undefined): number {
  return String(a ?? "").localeCompare(String(b ?? ""), "ko-KR", { numeric: true, sensitivity: "base" });
}

function compareNumber(a: number, b: number): number {
  return a - b;
}

function compareDate(a: string | null | undefined, b: string | null | undefined): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
}

export function filterAndSortUsers(
  users: AdminUser[],
  filters: AdminUserFilters,
  searchQuery: string
): AdminUser[] {
  let list = [...users];

  if (filters.authProvider) {
    list = list.filter((u) => u.authProvider === filters.authProvider);
  }
  if (filters.phoneVerified === "verified") {
    list = list.filter((u) => u.phoneVerified === true);
  } else if (filters.phoneVerified === "unverified") {
    list = list.filter((u) => u.phoneVerified !== true);
  }
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
      const matchLoginIdentifier = (u.loginIdentifier ?? "").toLowerCase().includes(q);
      const matchPhone = (u.phone ?? "").toLowerCase().includes(q);
      const matchLocation = (u.location ?? "").toLowerCase().includes(q);
      return matchNickname || matchEmail || matchId || matchLogin || matchLoginIdentifier || matchPhone || matchLocation;
    });
  }

  const key = filters.sortKey;
  const direction = filters.sortOrder === "asc" ? 1 : -1;
  list.sort((a, b) => {
    if (key === "joined") {
      return compareDate(a.joinedAt, b.joinedAt) * direction;
    }
    if (key === "lastSignIn") {
      return compareDate(a.lastSignInAt ?? a.lastActiveAt, b.lastSignInAt ?? b.lastActiveAt) * direction;
    }
    if (key === "provider") {
      return compareText(a.providerLabel ?? a.authProvider, b.providerLabel ?? b.authProvider) * direction;
    }
    if (key === "loginIdentifier") {
      return compareText(a.loginIdentifier ?? a.loginUsername ?? a.email, b.loginIdentifier ?? b.loginUsername ?? b.email) * direction;
    }
    if (key === "nickname") {
      return compareText(a.nickname, b.nickname) * direction;
    }
    if (key === "phoneVerified") {
      return compareNumber(a.phoneVerified ? 1 : 0, b.phoneVerified ? 1 : 0) * direction;
    }
    if (key === "moderationStatus") {
      return compareText(a.moderationStatus, b.moderationStatus) * direction;
    }
    if (key === "products") {
      return compareNumber((a.productCount ?? 0) + (a.soldCount ?? 0), (b.productCount ?? 0) + (b.soldCount ?? 0)) * direction;
    }
    if (key === "reports") {
      return compareNumber(a.reportCount ?? 0, b.reportCount ?? 0) * direction;
    }
    if (key === "points") {
      return compareNumber(a.pointBalance ?? 0, b.pointBalance ?? 0) * direction;
    }
    return 0;
  });

  return list;
}
