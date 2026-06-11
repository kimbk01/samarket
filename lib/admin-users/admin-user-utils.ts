/**
 * 14단계: 관리자 회원 필터·검색·정렬
 */

import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminAuthProvider, AdminUser } from "@/lib/types/admin-user";
import type { ModerationStatus } from "@/lib/types/report";

/** 가입수단·표·요약 카드 공통 라벨 키 */
export const ADMIN_USER_PROVIDER_LABEL_KEY: Record<AdminAuthProvider, MessageKey> = {
  google: "admin_user_provider_google",
  kakao: "admin_user_provider_kakao",
  naver: "admin_user_provider_naver",
  apple: "admin_user_provider_apple",
  facebook: "admin_user_provider_facebook",
  email: "admin_user_provider_email",
  manual: "admin_user_provider_manual",
  unknown: "admin_user_provider_unknown",
};

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
  labelKey: MessageKey;
}[] = [
  { value: "", labelKey: "admin_report_filter_all" },
  { value: "normal", labelKey: "admin_user_mod_normal" },
  { value: "warned", labelKey: "admin_user_mod_warned" },
  { value: "suspended", labelKey: "admin_user_mod_suspended" },
  { value: "banned", labelKey: "admin_user_mod_filter_banned" },
];

export const AUTH_PROVIDER_OPTIONS: {
  value: AdminAuthProvider | "";
  labelKey: MessageKey;
}[] = [
  { value: "", labelKey: "admin_user_filter_auth_all" },
  { value: "google", labelKey: "admin_user_provider_google" },
  { value: "kakao", labelKey: "admin_user_provider_kakao" },
  { value: "naver", labelKey: "admin_user_provider_naver" },
  { value: "apple", labelKey: "admin_user_provider_apple" },
  { value: "facebook", labelKey: "admin_user_provider_facebook" },
  { value: "email", labelKey: "admin_user_provider_email" },
  { value: "manual", labelKey: "admin_user_provider_manual" },
];

export const PHONE_VERIFIED_OPTIONS: {
  value: "" | "verified" | "unverified";
  labelKey: MessageKey;
}[] = [
  { value: "", labelKey: "admin_user_filter_phone_all" },
  { value: "verified", labelKey: "admin_user_filter_phone_verified" },
  { value: "unverified", labelKey: "admin_user_filter_phone_unverified" },
];

export const MEMBER_TYPE_OPTIONS: {
  value: AdminUser["memberType"] | "";
  labelKey: MessageKey;
}[] = [
  { value: "", labelKey: "admin_report_filter_all" },
  { value: "normal", labelKey: "admin_user_member_type_normal" },
  { value: "premium", labelKey: "admin_user_member_type_premium" },
  { value: "admin", labelKey: "admin_user_member_type_admin" },
];

export const SORT_OPTIONS: { value: AdminUserSortKey; labelKey: MessageKey }[] = [
  { value: "joined", labelKey: "admin_user_sort_joined" },
  { value: "lastSignIn", labelKey: "admin_user_sort_last_signin" },
  { value: "provider", labelKey: "admin_user_sort_provider" },
  { value: "loginIdentifier", labelKey: "admin_user_sort_login_id" },
  { value: "nickname", labelKey: "admin_user_sort_nickname" },
  { value: "phoneVerified", labelKey: "admin_user_sort_phone_verified" },
  { value: "moderationStatus", labelKey: "admin_user_sort_moderation" },
  { value: "products", labelKey: "admin_user_sort_products" },
  { value: "reports", labelKey: "admin_user_sort_reports" },
  { value: "points", labelKey: "admin_user_sort_points" },
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
      const matchDisplayName = String(u.displayName ?? "").toLowerCase().includes(q);
      const matchUsername = String(u.username ?? "").toLowerCase().includes(q.replace(/^@/, ""));
      const matchDibayId = String(u.dibay_id ?? "").toLowerCase().includes(q.replace(/^@/, ""));
      const matchEmail = (u.email ?? "").toLowerCase().includes(q);
      const matchId = u.id.toLowerCase().includes(q);
      const matchLogin = (u.loginUsername ?? "").toLowerCase().includes(q);
      const matchLoginIdentifier = (u.loginIdentifier ?? "").toLowerCase().includes(q);
      const matchPhone = (u.phone ?? "").toLowerCase().includes(q);
      const matchLocation = (u.location ?? "").toLowerCase().includes(q);
      return (
        matchNickname ||
        matchDisplayName ||
        matchUsername ||
        matchDibayId ||
        matchEmail ||
        matchId ||
        matchLogin ||
        matchLoginIdentifier ||
        matchPhone ||
        matchLocation
      );
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
