/**
 * Member Detail Control Center (P3) presentation SSOT.
 * Consumes P1 ActionPolicy + Copy and P2 store/lifecycle helpers. No local action forks.
 */

import {
  MEMBER_ADMIN_COPY,
  MEMBER_ADMIN_COPY_KEY,
  memberAdminCopy,
  memberAdminLifecycleLabel,
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
  memberListPrivilegeLabel,
  memberListSignupOriginLabel,
} from "@/lib/admin-users/member-list-presentation";
import type { AdminAuthProvider } from "@/lib/types/admin-user";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";

/** 문구 키(언어 SSOT L25) — 화면은 `t(MEMBER_DETAIL_*_KEY)`, `_KO` 는 기존 호출부·검사용 한국어 값. */
export const MEMBER_DETAIL_DANGER_ZONE_TITLE_KEY = "admin_member_detail_danger_zone_title";
export const MEMBER_DETAIL_STORE_NONE_KEY = "admin_member_detail_store_none";
export const MEMBER_DETAIL_STORE_OPERATOR_KEY = MEMBER_ADMIN_COPY_KEY.store_operator;
export const MEMBER_DETAIL_BACK_LIST_KEY = "admin_member_detail_back_list";
export const MEMBER_DETAIL_PASSWORD_CTA_KEY = MEMBER_ADMIN_COPY_KEY.password_manage;
export const MEMBER_DETAIL_EDIT_CTA_KEY = MEMBER_ADMIN_COPY_KEY.edit_profile;
export const MEMBER_DETAIL_SYSTEM_KEY_KEY = MEMBER_ADMIN_COPY_KEY.system_member_key;
export const MEMBER_DETAIL_VERIFIED_KEY = "admin_member_detail_verified";
export const MEMBER_DETAIL_UNVERIFIED_KEY = "admin_member_detail_unverified";
export const MEMBER_DETAIL_ADMIN_BADGE_KEY = MEMBER_ADMIN_COPY_KEY.privilege_admin;
export const MEMBER_DETAIL_SUPER_ADMIN_BADGE_KEY = MEMBER_ADMIN_COPY_KEY.privilege_super_admin;

export const MEMBER_DETAIL_DANGER_ZONE_TITLE_KO = translate("ko", MEMBER_DETAIL_DANGER_ZONE_TITLE_KEY);
export const MEMBER_DETAIL_STORE_NONE_KO = translate("ko", MEMBER_DETAIL_STORE_NONE_KEY);
export const MEMBER_DETAIL_STORE_OPERATOR_KO = MEMBER_ADMIN_COPY.store_operator;
export const MEMBER_DETAIL_BACK_LIST_KO = translate("ko", MEMBER_DETAIL_BACK_LIST_KEY);
export const MEMBER_DETAIL_PASSWORD_CTA_KO = MEMBER_ADMIN_COPY.password_manage;
export const MEMBER_DETAIL_EDIT_CTA_KO = MEMBER_ADMIN_COPY.edit_profile;
export const MEMBER_DETAIL_SYSTEM_KEY_KO = MEMBER_ADMIN_COPY.system_member_key;
export const MEMBER_DETAIL_VERIFIED_KO = translate("ko", MEMBER_DETAIL_VERIFIED_KEY);
export const MEMBER_DETAIL_UNVERIFIED_KO = translate("ko", MEMBER_DETAIL_UNVERIFIED_KEY);
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
export function memberDetailAccountStateLabel(
  moderationStatus: string | null | undefined,
  status: string | null | undefined,
  lang: AppLanguageCode,
): string {
  const lifecycle = memberDetailLifecycleFromModeration(moderationStatus, status);
  switch (lifecycle) {
    case "ACTIVE":
      return memberAdminCopy("status_active", lang);
    case "SUSPENDED":
      return memberAdminCopy("status_suspended", lang);
    case "BLOCKED":
      return memberAdminCopy("status_blocked", lang);
    case "WITHDRAWN":
      return memberAdminCopy("status_withdrawn", lang);
    case "PURGED":
      return memberAdminCopy("status_purged", lang);
    default:
      return memberAdminLifecycleLabel(lifecycle, lang);
  }
}

export function memberDetailAccountStateLabelKo(
  moderationStatus: string | null | undefined,
  status?: string | null,
): string {
  return memberDetailAccountStateLabel(moderationStatus, status, "ko");
}

export function memberDetailVerificationLabel(phoneVerified: boolean | null | undefined, lang: AppLanguageCode): string {
  return translate(lang, phoneVerified === true ? MEMBER_DETAIL_VERIFIED_KEY : MEMBER_DETAIL_UNVERIFIED_KEY);
}

export function memberDetailVerificationLabelKo(phoneVerified: boolean | null | undefined): string {
  return memberDetailVerificationLabel(phoneVerified, "ko");
}

export function memberDetailPrivilegeLabel(
  input: {
    hasAdminMembership: boolean;
    isSuperAdmin: boolean;
  },
  lang: AppLanguageCode,
): string {
  return memberListPrivilegeLabel(input, lang);
}

export function memberDetailPrivilegeLabelKo(input: {
  hasAdminMembership: boolean;
  isSuperAdmin: boolean;
}): string {
  return memberDetailPrivilegeLabel(input, "ko");
}

export function memberDetailSignupOriginLabel(
  provider: AdminAuthProvider | string | null | undefined,
  lang: AppLanguageCode,
): string {
  return memberListSignupOriginLabel(provider, lang);
}

export function memberDetailSignupOriginLabelKo(
  provider: AdminAuthProvider | string | null | undefined,
): string {
  return memberDetailSignupOriginLabel(provider, "ko");
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

/** Operator tab IA label keys. Existing panels keep their data; labels are presentation only. */
export const MEMBER_DETAIL_TAB_LABEL_KEY = {
  overview: "admin_member_detail_tab_overview",
  account: "admin_member_detail_tab_account",
  store: "admin_member_detail_tab_store",
  community: "admin_member_detail_tab_community",
  trade: "admin_member_detail_tab_trade",
  delivery: "admin_member_detail_tab_delivery",
  chat: "admin_member_detail_tab_chat",
  reports: "admin_member_detail_tab_reports",
  address: "admin_member_detail_tab_address",
  ops: "admin_member_detail_tab_ops",
  points: "admin_member_detail_tab_points",
  trust: "admin_member_detail_tab_trust",
} as const;

export type MemberDetailTabId = keyof typeof MEMBER_DETAIL_TAB_LABEL_KEY;

/** 한국어 탭 이름(기존 호출부·검사 호환). */
export const MEMBER_DETAIL_TAB_LABEL_KO = Object.fromEntries(
  (Object.keys(MEMBER_DETAIL_TAB_LABEL_KEY) as MemberDetailTabId[]).map((id) => [id, translate("ko", MEMBER_DETAIL_TAB_LABEL_KEY[id])]),
) as { readonly [K in MemberDetailTabId]: string };
