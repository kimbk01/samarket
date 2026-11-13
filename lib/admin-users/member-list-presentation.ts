/**
 * Member List (R2) presentation SSOT.
 * Consumes R1 Korean Copy + P0 lifecycle. Independent axes per R0.
 */

import { resolveAdminStoreApplicationHref } from "@/lib/admin/admin-ops-deeplink";
import {
  MEMBER_ADMIN_COPY,
  MEMBER_ADMIN_COPY_KEY,
  memberAdminCopy,
  memberAdminLifecycleLabel,
} from "@/lib/admin-users/member-admin-copy-ssot";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import type {
  AdminMemberOriginFilter,
  AdminMemberPrivilegeFilter,
  AdminMemberStoreFilter,
  AdminMemberVerifyFilter,
} from "@/lib/admin-users/admin-member-list-query";
import type { AdminAuthProvider, AdminUser, AdminUserStatusCategory } from "@/lib/types/admin-user";
import { resolveCanonicalMemberStore } from "@/lib/admin-users/member-store-relation-ssot";
import { ADMIN_LIST_QUERY_DEFAULT_SIZE, normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";

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

/** 문구 키(언어 SSOT L25) — 화면은 `t(MEMBER_LIST_*_KEY)`, `_KO` 는 기존 호출부·검사용 한국어 값. R0 search placeholder authority. */
export const MEMBER_LIST_SEARCH_PLACEHOLDER_KEY = "admin_member_list_search_placeholder";
export const MEMBER_LIST_PAGE_DESCRIPTION_KEY = "admin_member_list_page_description";
export const MEMBER_LIST_EMPTY_KEY = "admin_member_list_empty";
export const MEMBER_LIST_SEARCH_EMPTY_KEY = "admin_member_list_search_empty";
export const MEMBER_LIST_STORE_NONE_KEY = "admin_member_list_store_none";
export const MEMBER_LIST_DETAIL_ACTION_KEY = "admin_member_list_detail_action";
export const MEMBER_LIST_DELETION_REQUESTS_KEY = "admin_member_list_deletion_requests";
export const MEMBER_LIST_OPS_HISTORY_KEY = MEMBER_ADMIN_COPY_KEY.ops_history;
export const MEMBER_LIST_AT_ID_COLUMN_KEY = "admin_member_list_at_id_column";
export const MEMBER_LIST_VERIFY_DONE_KEY = "admin_member_list_verify_done";
export const MEMBER_LIST_VERIFY_INCOMPLETE_KEY = "admin_member_list_verify_incomplete";
export const MEMBER_LIST_ORIGIN_OTHER_KEY = "admin_member_list_origin_other";

export const MEMBER_LIST_SEARCH_PLACEHOLDER_KO = translate("ko", MEMBER_LIST_SEARCH_PLACEHOLDER_KEY);
export const MEMBER_LIST_PAGE_DESCRIPTION_KO = translate("ko", MEMBER_LIST_PAGE_DESCRIPTION_KEY);
export const MEMBER_LIST_EMPTY_KO = translate("ko", MEMBER_LIST_EMPTY_KEY);
export const MEMBER_LIST_SEARCH_EMPTY_KO = translate("ko", MEMBER_LIST_SEARCH_EMPTY_KEY);
export const MEMBER_LIST_STORE_NONE_KO = translate("ko", MEMBER_LIST_STORE_NONE_KEY);
export const MEMBER_LIST_DETAIL_ACTION_KO = translate("ko", MEMBER_LIST_DETAIL_ACTION_KEY);
export const MEMBER_LIST_DELETION_REQUESTS_KO = translate("ko", MEMBER_LIST_DELETION_REQUESTS_KEY);
export const MEMBER_LIST_OPS_HISTORY_KO = MEMBER_ADMIN_COPY.ops_history;
export const MEMBER_LIST_AT_ID_COLUMN_KO = translate("ko", MEMBER_LIST_AT_ID_COLUMN_KEY);
export const MEMBER_LIST_VERIFY_DONE_KO = translate("ko", MEMBER_LIST_VERIFY_DONE_KEY);
export const MEMBER_LIST_VERIFY_INCOMPLETE_KO = translate("ko", MEMBER_LIST_VERIFY_INCOMPLETE_KEY);
export const MEMBER_LIST_ORIGIN_OTHER_KO = translate("ko", MEMBER_LIST_ORIGIN_OTHER_KEY);

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

export function memberListAccountStateLabel(
  user: Pick<AdminUser, "statusCategory" | "moderationStatus">,
  lang: AppLanguageCode,
): string {
  return memberAdminLifecycleLabel(memberListLifecycleStateFromUser(user), lang);
}

export function memberListAccountStateLabelKo(user: Pick<
  AdminUser,
  "statusCategory" | "moderationStatus"
>): string {
  return memberListAccountStateLabel(user, "ko");
}

/** HARD FORBIDDEN: blocked must never render as suspended. */
export function memberListStatusCategoryLabel(status: AdminUserStatusCategory, lang: AppLanguageCode): string {
  switch (status) {
    case "active":
      return memberAdminCopy("status_active", lang);
    case "needs_review":
      return memberAdminCopy("status_needs_review", lang);
    case "suspended":
      return memberAdminCopy("status_suspended", lang);
    case "blocked":
      return memberAdminCopy("status_blocked", lang);
    case "deleted":
      return memberAdminCopy("status_withdrawn", lang);
  }
}

export function memberListStatusCategoryLabelKo(status: AdminUserStatusCategory): string {
  return memberListStatusCategoryLabel(status, "ko");
}

export function memberListPrivilegeLabel(
  user: Pick<AdminUser, "hasAdminMembership" | "isSuperAdmin">,
  lang: AppLanguageCode,
): string {
  if (user.isSuperAdmin) return memberAdminCopy("privilege_super_admin", lang);
  if (user.hasAdminMembership) return memberAdminCopy("privilege_admin", lang);
  return memberAdminCopy("privilege_member", lang);
}

export function memberListPrivilegeLabelKo(user: Pick<
  AdminUser,
  "hasAdminMembership" | "isSuperAdmin"
>): string {
  return memberListPrivilegeLabel(user, "ko");
}

/** OD-02 binary list presentation. */
export function memberListVerificationLabel(user: Pick<AdminUser, "phoneVerified">, lang: AppLanguageCode): string {
  return translate(lang, user.phoneVerified === true ? MEMBER_LIST_VERIFY_DONE_KEY : MEMBER_LIST_VERIFY_INCOMPLETE_KEY);
}

export function memberListVerificationLabelKo(user: Pick<AdminUser, "phoneVerified">): string {
  return memberListVerificationLabel(user, "ko");
}

export function memberListSignupOriginLabel(
  provider: AdminAuthProvider | string | null | undefined,
  lang: AppLanguageCode,
): string {
  const value = String(provider ?? "").trim().toLowerCase();
  if (value === "manual") return memberAdminCopy("origin_admin_manual", lang);
  if (value === "kakao") return memberAdminCopy("origin_kakao", lang);
  if (value === "email") return memberAdminCopy("origin_user_signup", lang);
  if (value === "google") return "Google";
  if (value === "apple") return "Apple";
  if (value === "naver") return translate(lang, "admin_member_list_origin_naver");
  return memberAdminCopy("origin_user_signup", lang);
}

export function memberListSignupOriginLabelKo(
  provider: AdminAuthProvider | string | null | undefined,
): string {
  return memberListSignupOriginLabel(provider, "ko");
}

export function memberListOriginFilterLabel(origin: AdminMemberOriginFilter, lang: AppLanguageCode): string {
  switch (origin) {
    case "email":
      return memberAdminCopy("origin_user_signup", lang);
    case "manual":
      return memberAdminCopy("origin_admin_manual", lang);
    case "kakao":
      return memberAdminCopy("origin_kakao", lang);
    case "google":
      return "Google";
    case "apple":
      return "Apple";
    case "other":
      return translate(lang, MEMBER_LIST_ORIGIN_OTHER_KEY);
  }
}

export function memberListOriginFilterLabelKo(origin: AdminMemberOriginFilter): string {
  return memberListOriginFilterLabel(origin, "ko");
}

export function memberListSummaryChipLabel(id: MemberListSummaryChipId, lang: AppLanguageCode): string {
  switch (id) {
    case "all":
      return translate(lang, "admin_member_list_summary_all");
    case "active":
      return memberAdminCopy("status_active", lang);
    case "suspended":
      return memberAdminCopy("status_suspended", lang);
    case "blocked":
      return memberAdminCopy("status_blocked", lang);
    case "store_ops":
      return memberAdminCopy("store_ops", lang);
    case "admin":
      return memberAdminCopy("privilege_admin", lang);
  }
}

export function memberListSummaryChipLabelKo(id: MemberListSummaryChipId): string {
  return memberListSummaryChipLabel(id, "ko");
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
  return v === "email" || v === "manual" || v === "kakao" || v === "google" || v === "apple" || v === "other"
    ? v
    : "";
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
  // R7 목록 표준 — 페이지 크기 20/50/100 (그 외·없음 → 20). 예전 10/20/50 링크의 10 은 20 으로 열린다.
  const pageSize = normalizeAdminListPageSize(sp.get("pageSize"));
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
  if (input.pageSize !== ADMIN_LIST_QUERY_DEFAULT_SIZE) params.set("pageSize", String(input.pageSize));
  return params.toString();
}
