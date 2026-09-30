/**
 * Member Detail Control Center (P3) presentation SSOT.
 * Consumes P1 ActionPolicy + Copy and P2 store/lifecycle helpers. No local action forks.
 */

import {
  MEMBER_ADMIN_COPY,
  memberAdminLifecycleLabelKo,
} from "@/lib/admin-users/member-admin-copy-ssot";
import {
  normalizeMemberAdminLifecycle,
  resolveMemberAdminActionPolicy,
  type MemberAdminActionDecision,
  type MemberAdminActionId,
  type MemberAdminOperatorAuthorization,
} from "@/lib/admin-users/member-admin-action-policy";
import { memberBusinessDetailHref } from "@/lib/admin-users/member-deep-links";
import {
  memberListPrivilegeLabelKo,
  memberListSignupOriginLabelKo,
} from "@/lib/admin-users/member-list-presentation";
import type { AdminAuthProvider } from "@/lib/types/admin-user";

export const MEMBER_DETAIL_DANGER_ZONE_TITLE_KO = "위험 작업";
export const MEMBER_DETAIL_STORE_NONE_KO = "매장 없음";
export const MEMBER_DETAIL_STORE_OPERATOR_KO = MEMBER_ADMIN_COPY.store_operator;
export const MEMBER_DETAIL_BACK_LIST_KO = "회원 목록";
export const MEMBER_DETAIL_PASSWORD_CTA_KO = MEMBER_ADMIN_COPY.password_manage;
export const MEMBER_DETAIL_EDIT_CTA_KO = MEMBER_ADMIN_COPY.edit_profile;
export const MEMBER_DETAIL_SYSTEM_KEY_KO = MEMBER_ADMIN_COPY.system_member_key;
export const MEMBER_DETAIL_VERIFIED_KO = "인증 완료";
export const MEMBER_DETAIL_UNVERIFIED_KO = "인증 미완료";
export const MEMBER_DETAIL_ADMIN_BADGE_KO = MEMBER_ADMIN_COPY.privilege_admin;
export const MEMBER_DETAIL_SUPER_ADMIN_BADGE_KO = MEMBER_ADMIN_COPY.privilege_super_admin;

export const MEMBER_DETAIL_DANGER_ACTION_IDS = [
  "suspend",
  "unsuspend",
  "block",
  "unblock",
  "withdraw",
  "purge",
] as const satisfies readonly MemberAdminActionId[];

export type MemberDetailDangerActionId = (typeof MEMBER_DETAIL_DANGER_ACTION_IDS)[number];

export function memberDetailLifecycleFromModeration(
  moderationStatus: string | null | undefined,
  status?: string | null,
): ReturnType<typeof normalizeMemberAdminLifecycle> {
  const mod = String(moderationStatus ?? "").trim().toLowerCase();
  if (mod === "blocked" || mod === "banned") return "BLOCKED";
  if (mod === "suspended") return "SUSPENDED";
  if (mod === "withdrawn") return "WITHDRAWN";
  const st = String(status ?? "").trim().toLowerCase();
  if (st === "blocked" || st === "banned") return "BLOCKED";
  if (st === "suspended") return "SUSPENDED";
  if (st === "deleted" || st === "withdrawn" || st === "deactivated") return "WITHDRAWN";
  return normalizeMemberAdminLifecycle(moderationStatus ?? status);
}

/** Operator account-state labels — BLOCKED ≠ SUSPENDED. Never collapses verification into account state. */
export function memberDetailAccountStateLabelKo(
  moderationStatus: string | null | undefined,
  status?: string | null,
): string {
  const lifecycle = memberDetailLifecycleFromModeration(moderationStatus, status);
  switch (lifecycle) {
    case "ACTIVE":
      return MEMBER_ADMIN_COPY.status_active;
    case "SUSPENDED":
      return MEMBER_ADMIN_COPY.status_suspended;
    case "BLOCKED":
      return MEMBER_ADMIN_COPY.status_blocked;
    case "WITHDRAWN":
      return MEMBER_ADMIN_COPY.status_withdrawn;
    case "PURGED":
      return MEMBER_ADMIN_COPY.status_purged;
    default:
      return memberAdminLifecycleLabelKo(lifecycle);
  }
}

export function memberDetailVerificationLabelKo(phoneVerified: boolean | null | undefined): string {
  return phoneVerified === true ? MEMBER_DETAIL_VERIFIED_KO : MEMBER_DETAIL_UNVERIFIED_KO;
}

export function memberDetailPrivilegeLabelKo(input: {
  hasAdminMembership: boolean;
  isSuperAdmin: boolean;
}): string {
  return memberListPrivilegeLabelKo(input);
}

export function memberDetailSignupOriginLabelKo(
  provider: AdminAuthProvider | string | null | undefined,
): string {
  return memberListSignupOriginLabelKo(provider);
}

export function memberDetailStoreHref(storeId: string): string {
  return memberBusinessDetailHref(storeId);
}

/** Preserve P2 list query: prefer browser history; never invent empty /admin/users when back is available. */
export function memberDetailListHrefFallback(): string {
  return "/admin/users";
}

export function memberDetailShouldUseHistoryBack(referrer: string | null | undefined): boolean {
  const raw = String(referrer ?? "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw, "https://samarket.vercel.app");
    return url.pathname === "/admin/users" || url.pathname.startsWith("/admin/users?");
  } catch {
    return raw.includes("/admin/users");
  }
}

export function resolveMemberDetailActionPolicy(input: {
  moderationStatus: string | null | undefined;
  status?: string | null;
  operator: MemberAdminOperatorAuthorization;
  hasStoreRelationship: boolean;
  passwordResetSupported: boolean;
}): MemberAdminActionDecision[] {
  return resolveMemberAdminActionPolicy({
    lifecycle: memberDetailLifecycleFromModeration(input.moderationStatus, input.status),
    operator: input.operator,
    hasStoreRelationship: input.hasStoreRelationship,
    passwordResetSupported: input.passwordResetSupported,
  });
}

export function memberDetailDangerActions(
  decisions: readonly MemberAdminActionDecision[],
): MemberAdminActionDecision[] {
  const allow = new Set<string>(MEMBER_DETAIL_DANGER_ACTION_IDS);
  return decisions.filter((d) => allow.has(d.id) && d.visible);
}

export function memberDetailPrimaryActions(
  decisions: readonly MemberAdminActionDecision[],
): {
  editProfile: MemberAdminActionDecision | undefined;
  managePassword: MemberAdminActionDecision | undefined;
  managePrivilege: MemberAdminActionDecision | undefined;
  manageStore: MemberAdminActionDecision | undefined;
  opsHistory: MemberAdminActionDecision | undefined;
  moderation: MemberAdminActionDecision | undefined;
} {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  return {
    editProfile: byId.get("edit_profile"),
    managePassword: byId.get("manage_password"),
    managePrivilege: byId.get("manage_privilege"),
    manageStore: byId.get("manage_store"),
    opsHistory: byId.get("ops_history"),
    moderation: byId.get("moderation"),
  };
}

/** Operator tab IA labels (Korean). Existing panels keep their data; labels are presentation only. */
export const MEMBER_DETAIL_TAB_LABEL_KO = {
  overview: "개요",
  account: "계정·인증",
  store: "매장",
  community: "활동",
  trade: "거래",
  delivery: "배달·주문",
  chat: "채팅·그룹",
  reports: "신고·제재",
  address: "주소",
  ops: "운영 이력",
  points: "포인트",
  trust: "신뢰",
} as const;

export type MemberDetailTabId = keyof typeof MEMBER_DETAIL_TAB_LABEL_KO;
