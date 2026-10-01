/**
 * R3 Member Detail Control Center — IA / CTA → CAP map / Danger presentation SSOT.
 * Presentation + capability accounting only. R4+ mutation workflows stay deferred.
 */

import { isDibaySyntheticAuthEmail } from "@/lib/auth/synthetic-auth-email";
import { MEMBER_ADMIN_CAPABILITY_CATALOG } from "@/lib/admin-users/member-admin-capability-catalog";
import type { MemberAdminActionDecision, MemberAdminActionId } from "@/lib/admin-users/member-admin-action-policy";
import {
  MEMBER_DETAIL_TAB_LABEL_KO,
  type MemberDetailTabId,
  memberDetailLifecycleFromModeration,
} from "@/lib/admin-users/member-detail-presentation";
import {
  memberAdminAccountStatusBadge,
  memberAdminBadgeClassName,
  memberAdminPrivilegeBadge,
  memberAdminStoreBadge,
  memberAdminVerifyBadge,
  type MemberAdminBadgeSpec,
} from "@/lib/admin-users/member-admin-badge-presentation";
import { adminMemberNicknameSecondary } from "@/lib/admin-users/admin-member-identity";

/** Frozen Detail tab order (R0 + OD-01 KEEP points/trust). */
export const MEMBER_DETAIL_TAB_ORDER = [
  "overview",
  "account",
  "store",
  "community",
  "trade",
  "delivery",
  "chat",
  "reports",
  "address",
  "ops",
  "points",
  "trust",
] as const satisfies readonly MemberDetailTabId[];

export type MemberDetailCcTabId = (typeof MEMBER_DETAIL_TAB_ORDER)[number];

export function parseMemberDetailTab(raw: string | null | undefined): MemberDetailCcTabId {
  const value = String(raw ?? "").trim().toLowerCase();
  return (MEMBER_DETAIL_TAB_ORDER as readonly string[]).includes(value)
    ? (value as MemberDetailCcTabId)
    : "overview";
}

export function memberDetailTabLabelKo(tab: MemberDetailCcTabId): string {
  return MEMBER_DETAIL_TAB_LABEL_KO[tab];
}

/** Overview section hierarchy — operator questions, not equal grid filler. */
export const MEMBER_DETAIL_OVERVIEW_SECTION_ORDER = [
  "basic",
  "account_auth",
  "store",
  "privilege",
  "recent_activity",
  "recent_ops",
] as const;

export type MemberDetailOverviewSectionId = (typeof MEMBER_DETAIL_OVERVIEW_SECTION_ORDER)[number];

export const MEMBER_DETAIL_OVERVIEW_SECTION_LABEL_KO = {
  basic: "회원 기본 정보",
  account_auth: "계정 / 인증",
  store: "매장",
  privilege: "관리 권한",
  recent_activity: "최근 활동",
  recent_ops: "최근 운영 조치",
} as const satisfies Record<MemberDetailOverviewSectionId, string>;

/** Render plan for Overview — single authority; UI must map this order into the DOM. */
export function memberDetailOverviewSectionRenderPlan(): ReadonlyArray<{
  id: MemberDetailOverviewSectionId;
  labelKo: string;
}> {
  return MEMBER_DETAIL_OVERVIEW_SECTION_ORDER.map((id) => ({
    id,
    labelKo: MEMBER_DETAIL_OVERVIEW_SECTION_LABEL_KO[id],
  }));
}

export type MemberDetailDangerConsequenceGroup = "restriction" | "identity_end";

export const MEMBER_DETAIL_DANGER_GROUP_ORDER = ["restriction", "identity_end"] as const;

export const MEMBER_DETAIL_DANGER_GROUP_LABEL_KO: Record<MemberDetailDangerConsequenceGroup, string> = {
  restriction: "이용 제한 (되돌릴 수 있음)",
  identity_end: "계정 종료 (되돌리기 어려움)",
};

const DANGER_GROUP_BY_ACTION: Record<string, MemberDetailDangerConsequenceGroup> = {
  suspend: "restriction",
  unsuspend: "restriction",
  block: "restriction",
  unblock: "restriction",
  withdraw: "identity_end",
  purge: "identity_end",
};

export function memberDetailDangerConsequenceGroup(
  actionId: MemberAdminActionId | string,
): MemberDetailDangerConsequenceGroup {
  return DANGER_GROUP_BY_ACTION[actionId] ?? "restriction";
}

export function groupMemberDetailDangerActions(
  actions: readonly MemberAdminActionDecision[],
): Record<MemberDetailDangerConsequenceGroup, MemberAdminActionDecision[]> {
  const out: Record<MemberDetailDangerConsequenceGroup, MemberAdminActionDecision[]> = {
    restriction: [],
    identity_end: [],
  };
  for (const action of actions) {
    out[memberDetailDangerConsequenceGroup(action.id)].push(action);
  }
  return out;
}

/** Operator-facing deferred execution status — never "표시만". */
export const MEMBER_DETAIL_DANGER_EXECUTION_DEFERRED_KO = "제재 워크플로에서 실행";

/** Operator-facing deferred Support/쪽지 — CAP-MSG-SUPPORT DEAD until R8. */
export const MEMBER_DETAIL_SUPPORT_MESSAGE_DEFERRED_KO =
  "Support 워크플로에서 제공 (R8)";

export type MemberDetailVisibleCtaKey =
  | "edit"
  | "messenger"
  | "password"
  | "dibay_id"
  | "account_tab"
  | "store_detail"
  | "privilege_view"
  | "ops_history"
  | "danger_suspend"
  | "danger_unsuspend"
  | "danger_block"
  | "danger_unblock"
  | "danger_withdraw"
  | "danger_purge"
  | "support_note";

export type MemberDetailCtaCapabilityRow = {
  ctaKey: MemberDetailVisibleCtaKey;
  ctaKo: string;
  capId: string;
  currentState: string;
  targetPhase: string;
  handlerOrRoute: string;
  executableInR3: boolean;
};

/**
 * Mandatory Detail CTA → CAP map. Every visible action must appear here.
 * Dead/regressed capabilities stay represented without fake executable buttons.
 */
export const MEMBER_DETAIL_CTA_CAPABILITY_MAP: readonly MemberDetailCtaCapabilityRow[] = [
  {
    ctaKey: "edit",
    ctaKo: "정보 수정",
    capId: "CAP-PROFILE-EDIT",
    currentState: "YES",
    targetPhase: "R4",
    handlerOrRoute: "EditMemberForm S13 profile-only (nickname/email/phone)",
    executableInR3: true,
  },
  {
    ctaKey: "dibay_id",
    ctaKo: "@회원 ID 변경",
    capId: "CAP-DIBAY-ID",
    currentState: "YES",
    targetPhase: "R4",
    handlerOrRoute: "AdminMemberDibayIdDialog S14 → PATCH dibayId",
    executableInR3: true,
  },
  {
    ctaKey: "messenger",
    ctaKo: "메신저 보기",
    capId: "CAP-MSG-MESSENGER",
    currentState: "YES",
    targetPhase: "R8_PRESERVE",
    handlerOrRoute: "adminMemberMessengerHref → /community-messenger",
    executableInR3: true,
  },
  {
    ctaKey: "password",
    ctaKo: "비밀번호 관리",
    capId: "CAP-PASSWORD",
    currentState: "YES",
    targetPhase: "R4_PRESERVE",
    handlerOrRoute: "AdminMemberPasswordDialog (P4 backend unchanged)",
    executableInR3: true,
  },
  {
    ctaKey: "account_tab",
    ctaKo: "인증 관리",
    capId: "CAP-VERIFY-VIEW",
    currentState: "YES",
    targetPhase: "R4",
    handlerOrRoute: "AdminMemberVerificationDialog S15 (+ CAP-VERIFY-APPROVE/RESET)",
    executableInR3: true,
  },
  {
    ctaKey: "store_detail",
    ctaKo: "매장 상세",
    capId: "CAP-STORE-VIEW",
    currentState: "PARTIAL",
    targetPhase: "R5",
    handlerOrRoute: "/admin/business/[storeId]",
    executableInR3: true,
  },
  {
    ctaKey: "privilege_view",
    ctaKo: "관리 권한",
    capId: "CAP-PRIV-VIEW",
    currentState: "YES",
    targetPhase: "R6",
    handlerOrRoute: "overview privilege section / badge (mutation R6)",
    executableInR3: true,
  },
  {
    ctaKey: "ops_history",
    ctaKo: "운영 이력",
    capId: "CAP-OPS-HISTORY",
    currentState: "YES",
    targetPhase: "R9",
    handlerOrRoute: "tab=ops",
    executableInR3: true,
  },
  {
    ctaKey: "support_note",
    ctaKo: "쪽지 보내기",
    capId: "CAP-MSG-SUPPORT",
    currentState: "DEAD",
    targetPhase: "R8",
    handlerOrRoute: "NOT rendered as CTA (legacy 410; Ops deferred copy; R8 Support)",
    executableInR3: false,
  },
  {
    ctaKey: "danger_suspend",
    ctaKo: "이용 정지",
    capId: "CAP-SUSPEND",
    currentState: "REGRESSED",
    targetPhase: "R7",
    handlerOrRoute: "Danger Zone eligibility shell (execution R7)",
    executableInR3: false,
  },
  {
    ctaKey: "danger_unsuspend",
    ctaKo: "정지 해제",
    capId: "CAP-UNSUSPEND",
    currentState: "REGRESSED",
    targetPhase: "R7",
    handlerOrRoute: "Danger Zone eligibility shell (execution R7)",
    executableInR3: false,
  },
  {
    ctaKey: "danger_block",
    ctaKo: "이용 차단",
    capId: "CAP-BLOCK",
    currentState: "REGRESSED",
    targetPhase: "R7",
    handlerOrRoute: "Danger Zone eligibility shell (execution R7)",
    executableInR3: false,
  },
  {
    ctaKey: "danger_unblock",
    ctaKo: "차단 해제",
    capId: "CAP-UNBLOCK",
    currentState: "REGRESSED",
    targetPhase: "R7",
    handlerOrRoute: "Danger Zone eligibility shell (execution R7)",
    executableInR3: false,
  },
  {
    ctaKey: "danger_withdraw",
    ctaKo: "탈퇴 처리",
    capId: "CAP-WITHDRAW",
    currentState: "REGRESSED",
    targetPhase: "R7",
    handlerOrRoute: "Danger Zone eligibility shell (execution R7)",
    executableInR3: false,
  },
  {
    ctaKey: "danger_purge",
    ctaKo: "영구 삭제",
    capId: "CAP-PURGE",
    currentState: "REGRESSED",
    targetPhase: "R7",
    handlerOrRoute: "Danger Zone eligibility shell (execution R7)",
    executableInR3: false,
  },
] as const;

export function memberDetailCtaCapabilityMapAccountsForCatalog(): boolean {
  const mapped = new Set(MEMBER_DETAIL_CTA_CAPABILITY_MAP.map((r) => r.capId));
  // Structural: every map row resolves to a catalog CAP; catalog still 33.
  return (
    MEMBER_ADMIN_CAPABILITY_CATALOG.length === 33 &&
    MEMBER_DETAIL_CTA_CAPABILITY_MAP.every((row) =>
      MEMBER_ADMIN_CAPABILITY_CATALOG.some((c) => c.id === row.capId),
    ) &&
    mapped.size === MEMBER_DETAIL_CTA_CAPABILITY_MAP.length
  );
}

export function memberDetailContactEmail(email: string | null | undefined): string | null {
  const raw = String(email ?? "").trim();
  if (!raw) return null;
  if (isDibaySyntheticAuthEmail(raw)) return null;
  return raw;
}

export function memberDetailLoginIdLabel(username: string | null | undefined): string | null {
  const raw = String(username ?? "").trim();
  return raw || null;
}

export function memberDetailNicknameIfDistinct(
  displayName: string,
  nickname: string | null | undefined,
): string | null {
  return adminMemberNicknameSecondary(displayName, nickname);
}

export function resolveMemberDetailHeaderBadges(input: {
  moderationStatus: string | null | undefined;
  status?: string | null;
  phoneVerified: boolean | null | undefined;
  hasStore: boolean;
  hasAdminMembership: boolean;
  isSuperAdmin: boolean;
}): MemberAdminBadgeSpec[] {
  const lifecycle = memberDetailLifecycleFromModeration(input.moderationStatus, input.status);
  const privilegeRole = input.isSuperAdmin
    ? "super_admin"
    : input.hasAdminMembership
      ? "admin"
      : "member";
  return [
    memberAdminAccountStatusBadge(lifecycle),
    memberAdminVerifyBadge(input.phoneVerified === true),
    memberAdminStoreBadge(input.hasStore),
    memberAdminPrivilegeBadge(privilegeRole),
  ];
}

export { memberAdminBadgeClassName };

export function assertNoPlaceholderFinalCopy(text: string): void {
  if (text.includes("표시만")) {
    throw new Error('Forbidden placeholder final copy: "표시만"');
  }
}
