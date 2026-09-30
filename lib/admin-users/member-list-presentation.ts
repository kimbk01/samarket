/**
 * Member List (P2) presentation SSOT.
 * Consumes P1 Korean Copy + P0 lifecycle. No local action-policy forks.
 */

import { resolveAdminStoreApplicationHref } from "@/lib/admin/admin-ops-deeplink";
import {
  MEMBER_ADMIN_COPY,
  memberAdminLifecycleLabelKo,
} from "@/lib/admin-users/member-admin-copy-ssot";
import type { AdminAuthProvider, AdminUser, AdminUserStatusCategory } from "@/lib/types/admin-user";

export type MemberListLifecycleState =
  | "ACTIVE"
  | "NEEDS_REVIEW"
  | "SUSPENDED"
  | "BLOCKED"
  | "WITHDRAWN"
  | "PURGED";

export type MemberListSummaryChipId =
  | "all"
  | "active"
  | "needs_review"
  | "suspended"
  | "store_ops"
  | "admin";

export const MEMBER_LIST_SEARCH_PLACEHOLDER_KO =
  "회원 ID, 이름, 닉네임, 이메일, 전화번호, 매장명 또는 매장 ID 검색";

export const MEMBER_LIST_PAGE_DESCRIPTION_KO =
  "회원 정보, 매장 연결, 계정 상태와 운영 이력을 관리합니다.";

export const MEMBER_LIST_EMPTY_KO = "조건에 맞는 회원이 없습니다.";
export const MEMBER_LIST_SEARCH_EMPTY_KO = "검색 결과 없음";
export const MEMBER_LIST_ERROR_KO = "목록을 불러오지 못했습니다";
export const MEMBER_LIST_STORE_NONE_KO = "매장 없음";
export const MEMBER_LIST_DETAIL_ACTION_KO = "상세";
export const MEMBER_LIST_DELETION_REQUESTS_KO = "삭제 요청";
export const MEMBER_LIST_OPS_HISTORY_KO = MEMBER_ADMIN_COPY.ops_history;

export function memberListDetailHref(userId: string): string {
  const id = String(userId ?? "").trim();
  if (!id) return "/admin/users";
  return `/admin/users/${encodeURIComponent(id)}`;
}

export function memberListStoreDetailHref(storeId: string): string {
  return resolveAdminStoreApplicationHref(storeId);
}

export function memberListPrimaryStore(user: Pick<AdminUser, "storeRelation">): {
  id: string;
  name: string;
} | null {
  const stores = user.storeRelation?.stores ?? [];
  for (const store of stores) {
    const id = String(store.id ?? "").trim();
    const name = String(store.name ?? "").trim();
    if (id) return { id, name: name || `#${id.slice(0, 8)}` };
  }
  return null;
}

export function memberListStoreCellLabel(user: Pick<AdminUser, "storeRelation">): {
  kind: "none" | "store";
  name?: string;
  storeId?: string;
  href?: string;
} {
  const primary = memberListPrimaryStore(user);
  if (!primary) return { kind: "none" };
  return {
    kind: "store",
    name: primary.name,
    storeId: primary.id,
    href: memberListStoreDetailHref(primary.id),
  };
}

export function memberListLifecycleStateFromUser(user: Pick<
  AdminUser,
  "statusCategory" | "moderationStatus"
>): MemberListLifecycleState {
  if (user.statusCategory === "blocked") return "BLOCKED";
  if (user.statusCategory === "suspended") return "SUSPENDED";
  if (user.statusCategory === "deleted") return "WITHDRAWN";
  if (user.statusCategory === "needs_review") return "NEEDS_REVIEW";
  if (user.statusCategory === "active") return "ACTIVE";

  if (user.moderationStatus === "blocked" || user.moderationStatus === "banned") return "BLOCKED";
  if (user.moderationStatus === "suspended") return "SUSPENDED";
  if (user.moderationStatus === "withdrawn") return "WITHDRAWN";
  return "ACTIVE";
}

export function memberListAccountStateLabelKo(user: Pick<
  AdminUser,
  "statusCategory" | "moderationStatus"
>): string {
  return memberAdminLifecycleLabelKo(memberListLifecycleStateFromUser(user));
}

/** HARD FORBIDDEN: blocked must never render as suspended. */
export function memberListStatusCategoryLabelKo(status: AdminUserStatusCategory): string {
  switch (status) {
    case "active":
      return MEMBER_ADMIN_COPY.status_active;
    case "needs_review":
      return MEMBER_ADMIN_COPY.status_needs_review;
    case "suspended":
      return MEMBER_ADMIN_COPY.status_suspended;
    case "blocked":
      return MEMBER_ADMIN_COPY.status_blocked;
    case "deleted":
      return MEMBER_ADMIN_COPY.status_withdrawn;
  }
}

export function memberListPrivilegeLabelKo(user: Pick<
  AdminUser,
  "hasAdminMembership" | "isSuperAdmin"
>): string {
  if (user.isSuperAdmin) return MEMBER_ADMIN_COPY.privilege_super_admin;
  if (user.hasAdminMembership) return MEMBER_ADMIN_COPY.privilege_admin;
  return "—";
}

export function memberListSignupOriginLabelKo(
  provider: AdminAuthProvider | string | null | undefined,
): string {
  const value = String(provider ?? "").trim().toLowerCase();
  if (value === "manual") return MEMBER_ADMIN_COPY.origin_admin_manual;
  if (value === "kakao") return MEMBER_ADMIN_COPY.origin_kakao;
  if (value === "email") return MEMBER_ADMIN_COPY.origin_user_signup;
  if (value === "google") return "Google 가입";
  if (value === "apple") return "Apple 가입";
  if (value === "naver") return "네이버 가입";
  if (value === "facebook") return "Facebook 가입";
  return MEMBER_ADMIN_COPY.origin_user_signup;
}

export function memberListSummaryChipLabelKo(id: MemberListSummaryChipId): string {
  switch (id) {
    case "all":
      return "전체 회원";
    case "active":
      return MEMBER_ADMIN_COPY.status_active;
    case "needs_review":
      return MEMBER_ADMIN_COPY.status_needs_review;
    case "suspended":
      return MEMBER_ADMIN_COPY.status_suspended;
    case "store_ops":
      return MEMBER_ADMIN_COPY.store_ops;
    case "admin":
      return MEMBER_ADMIN_COPY.privilege_admin;
  }
}

export function parseMemberListQueryState(sp: URLSearchParams): {
  search: string;
  status: AdminUserStatusCategory | "";
  role: "store_manager" | "admin" | "";
  page: number;
  pageSize: number;
} {
  const search = String(sp.get("search") ?? "").trim();
  const statusRaw = String(sp.get("status") ?? "").trim().toLowerCase();
  const status =
    statusRaw === "active" ||
    statusRaw === "needs_review" ||
    statusRaw === "suspended" ||
    statusRaw === "blocked" ||
    statusRaw === "deleted"
      ? (statusRaw as AdminUserStatusCategory)
      : "";
  const roleRaw = String(sp.get("role") ?? "").trim().toLowerCase();
  const role =
    roleRaw === "store_manager" || roleRaw === "admin"
      ? (roleRaw as "store_manager" | "admin")
      : "";
  const page = Math.max(1, Math.trunc(Number(sp.get("page")) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(sp.get("pageSize")) || 10)));
  return { search, status, role, page, pageSize };
}

export function buildMemberListQueryString(input: {
  search: string;
  status: AdminUserStatusCategory | "";
  role: "store_manager" | "admin" | "";
  page: number;
  pageSize: number;
}): string {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.status) params.set("status", input.status);
  if (input.role) params.set("role", input.role);
  if (input.page > 1) params.set("page", String(input.page));
  if (input.pageSize !== 10) params.set("pageSize", String(input.pageSize));
  return params.toString();
}
