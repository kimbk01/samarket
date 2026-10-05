/**
 * Member List (R2) presentation SSOT.
 * Consumes R1 Korean Copy + P0 lifecycle. Independent axes per R0.
 */

import { resolveAdminStoreApplicationHref } from "@/lib/admin/admin-ops-deeplink";
import {
  MEMBER_ADMIN_COPY,
  memberAdminLifecycleLabelKo,
} from "@/lib/admin-users/member-admin-copy-ssot";
import type {
  AdminMemberOriginFilter,
  AdminMemberPrivilegeFilter,
  AdminMemberStoreFilter,
  AdminMemberVerifyFilter,
} from "@/lib/admin-users/admin-member-list-query";
import type { AdminAuthProvider, AdminUser, AdminUserStatusCategory } from "@/lib/types/admin-user";
import { resolveCanonicalMemberStore } from "@/lib/admin-users/member-store-relation-ssot";

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
  | "suspended"
  | "blocked"
  | "store_ops"
  | "admin";

/** R0 search placeholder authority. */
export const MEMBER_LIST_SEARCH_PLACEHOLDER_KO =
  "이름, 닉네임, @회원 ID, 로그인 ID, 연락처, 매장명, 매장 ID";

export const MEMBER_LIST_PAGE_DESCRIPTION_KO =
  "회원 정보, 매장 연결, 계정 상태와 운영 이력을 관리합니다.";

export const MEMBER_LIST_EMPTY_KO = "조건에 맞는 회원이 없습니다.";
export const MEMBER_LIST_SEARCH_EMPTY_KO = "검색 결과가 없습니다";
export const MEMBER_LIST_ERROR_KO = "목록을 불러오지 못했습니다";
export const MEMBER_LIST_STORE_NONE_KO = "매장 없음";
export const MEMBER_LIST_DETAIL_ACTION_KO = "상세";
export const MEMBER_LIST_DELETION_REQUESTS_KO = "삭제 요청";
export const MEMBER_LIST_OPS_HISTORY_KO = MEMBER_ADMIN_COPY.ops_history;
export const MEMBER_LIST_AT_ID_COLUMN_KO = "@회원 ID";
export const MEMBER_LIST_VERIFY_DONE_KO = "인증 완료";
export const MEMBER_LIST_VERIFY_INCOMPLETE_KO = "인증 미완료";
export const MEMBER_LIST_ORIGIN_OTHER_KO = "기타";

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
  const canonical = resolveCanonicalMemberStore(user.storeRelation?.stores ?? []);
  if (!canonical) return null;
  return { id: canonical.id, name: canonical.name };
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
  return MEMBER_ADMIN_COPY.privilege_member;
}

/** OD-02 binary list presentation. */
export function memberListVerificationLabelKo(user: Pick<AdminUser, "phoneVerified">): string {
  return user.phoneVerified === true ? MEMBER_LIST_VERIFY_DONE_KO : MEMBER_LIST_VERIFY_INCOMPLETE_KO;
}

export function memberListSignupOriginLabelKo(
  provider: AdminAuthProvider | string | null | undefined,
): string {
  const value = String(provider ?? "").trim().toLowerCase();
  if (value === "manual") return MEMBER_ADMIN_COPY.origin_admin_manual;
  if (value === "kakao") return MEMBER_ADMIN_COPY.origin_kakao;
  if (value === "email") return MEMBER_ADMIN_COPY.origin_user_signup;
  if (value === "google") return "Google";
  if (value === "apple") return "Apple";
  if (value === "naver") return "네이버";
  if (value === "facebook") return "Facebook";
  return MEMBER_ADMIN_COPY.origin_user_signup;
}

export function memberListOriginFilterLabelKo(origin: AdminMemberOriginFilter): string {
  switch (origin) {
    case "email":
      return MEMBER_ADMIN_COPY.origin_user_signup;
    case "manual":
      return MEMBER_ADMIN_COPY.origin_admin_manual;
    case "kakao":
      return MEMBER_ADMIN_COPY.origin_kakao;
    case "other":
      return MEMBER_LIST_ORIGIN_OTHER_KO;
  }
}

export function memberListSummaryChipLabelKo(id: MemberListSummaryChipId): string {
  switch (id) {
    case "all":
      return "전체 회원";
    case "active":
      return MEMBER_ADMIN_COPY.status_active;
    case "suspended":
      return MEMBER_ADMIN_COPY.status_suspended;
    case "blocked":
      return MEMBER_ADMIN_COPY.status_blocked;
    case "store_ops":
      return MEMBER_ADMIN_COPY.store_ops;
    case "admin":
      return MEMBER_ADMIN_COPY.privilege_admin;
  }
}

export type MemberListSortId =
  | "created_at_desc"
  | "created_at_asc"
  | "last_login_desc"
  | "last_login_asc";

export type MemberListQueryState = {
  search: string;
  status: AdminUserStatusCategory | "";
  verify: AdminMemberVerifyFilter | "";
  store: AdminMemberStoreFilter | "";
  privilege: AdminMemberPrivilegeFilter | "";
  origin: AdminMemberOriginFilter | "";
  /** Inclusive YYYY-MM-DD (created_at / joined). */
  joinedFrom: string;
  joinedTo: string;
  sort: MemberListSortId;
  page: number;
  pageSize: number;
};

function parseStatus(raw: string): AdminUserStatusCategory | "" {
  const statusRaw = raw.trim().toLowerCase();
  return statusRaw === "active" ||
    statusRaw === "needs_review" ||
    statusRaw === "suspended" ||
    statusRaw === "blocked" ||
    statusRaw === "deleted"
    ? (statusRaw as AdminUserStatusCategory)
    : "";
}

function parseVerify(raw: string): AdminMemberVerifyFilter | "" {
  const v = raw.trim().toLowerCase();
  return v === "verified" || v === "unverified" ? v : "";
}

function parseStore(raw: string): AdminMemberStoreFilter | "" {
  const v = raw.trim().toLowerCase();
  return v === "has_store" || v === "no_store" ? v : "";
}

function parsePrivilege(raw: string): AdminMemberPrivilegeFilter | "" {
  const v = raw.trim().toLowerCase();
  return v === "admin" || v === "member" ? v : "";
}

function parseOrigin(raw: string): AdminMemberOriginFilter | "" {
  const v = raw.trim().toLowerCase();
  return v === "email" || v === "manual" || v === "kakao" || v === "other" ? v : "";
}

function parseDateYmd(raw: string): string {
  const v = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

function parseSort(raw: string): MemberListSortId {
  const v = raw.trim().toLowerCase();
  if (
    v === "created_at_asc" ||
    v === "created_at_desc" ||
    v === "last_login_asc" ||
    v === "last_login_desc"
  ) {
    return v;
  }
  return "created_at_desc";
}

export function parseMemberListQueryState(sp: URLSearchParams): MemberListQueryState {
  const search = String(sp.get("search") ?? "").trim();
  const status = parseStatus(String(sp.get("status") ?? ""));
  const verify = parseVerify(String(sp.get("verify") ?? ""));
  const store = parseStore(String(sp.get("store") ?? ""));
  const privilege = parsePrivilege(String(sp.get("privilege") ?? ""));
  const origin = parseOrigin(String(sp.get("origin") ?? ""));
  const joinedFrom = parseDateYmd(String(sp.get("joinedFrom") ?? ""));
  const joinedTo = parseDateYmd(String(sp.get("joinedTo") ?? ""));
  const sort = parseSort(String(sp.get("sort") ?? ""));
  const page = Math.max(1, Math.trunc(Number(sp.get("page")) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(sp.get("pageSize")) || 10)));
  return { search, status, verify, store, privilege, origin, joinedFrom, joinedTo, sort, page, pageSize };
}

export function buildMemberListQueryString(input: MemberListQueryState): string {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.status) params.set("status", input.status);
  if (input.verify) params.set("verify", input.verify);
  if (input.store) params.set("store", input.store);
  if (input.privilege) params.set("privilege", input.privilege);
  if (input.origin) params.set("origin", input.origin);
  if (input.joinedFrom) params.set("joinedFrom", input.joinedFrom);
  if (input.joinedTo) params.set("joinedTo", input.joinedTo);
  if (input.sort && input.sort !== "created_at_desc") params.set("sort", input.sort);
  if (input.page > 1) params.set("page", String(input.page));
  if (input.pageSize !== 10) params.set("pageSize", String(input.pageSize));
  return params.toString();
}
