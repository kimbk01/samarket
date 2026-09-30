/**
 * R1 Badge presentation primitives — visual only.
 * Axes stay independent: account · verify · store · privilege.
 * BLOCKED and SUSPENDED must remain visually/textually distinct.
 * R2/R3 own exact placement.
 */

import { MEMBER_ADMIN_COPY, memberAdminLifecycleLabelKo } from "@/lib/admin-users/member-admin-copy-ssot";
import { MEMBER_ADMIN_TYPOGRAPHY_CLASS } from "@/lib/admin-users/member-admin-visual-ssot";

export type MemberAdminBadgeAxis = "account" | "verify" | "store" | "privilege";

export type MemberAdminBadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "violet";

export type MemberAdminBadgeSpec = {
  axis: MemberAdminBadgeAxis;
  key: string;
  labelKo: string;
  tone: MemberAdminBadgeTone;
};

const TONE_CLASS: Record<MemberAdminBadgeTone, string> = {
  neutral: "bg-sam-surface-muted text-sam-fg border-sam-border",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  danger: "bg-red-50 text-red-800 border-red-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
  violet: "bg-violet-50 text-violet-800 border-violet-200",
};

export function memberAdminBadgeClassName(tone: MemberAdminBadgeTone): string {
  return `inline-flex items-center rounded-ui-rect border px-2 py-0.5 ${MEMBER_ADMIN_TYPOGRAPHY_CLASS.BADGE_TEXT} ${TONE_CLASS[tone]}`;
}

export function memberAdminAccountStatusBadge(
  state: "ACTIVE" | "SUSPENDED" | "BLOCKED" | "WITHDRAWN" | "PURGED" | "NEEDS_REVIEW",
): MemberAdminBadgeSpec {
  const labelKo = memberAdminLifecycleLabelKo(state);
  const tone: MemberAdminBadgeTone =
    state === "ACTIVE"
      ? "success"
      : state === "NEEDS_REVIEW"
        ? "warning"
        : state === "SUSPENDED"
          ? "warning"
          : state === "BLOCKED"
            ? "danger"
            : state === "WITHDRAWN"
              ? "neutral"
              : "neutral";
  return { axis: "account", key: state, labelKo, tone };
}

export function memberAdminVerifyBadge(verified: boolean): MemberAdminBadgeSpec {
  return verified
    ? { axis: "verify", key: "verified", labelKo: "인증 완료", tone: "success" }
    : { axis: "verify", key: "unverified", labelKo: "인증 미완료", tone: "neutral" };
}

export function memberAdminStoreBadge(hasStore: boolean): MemberAdminBadgeSpec {
  return hasStore
    ? { axis: "store", key: "linked", labelKo: MEMBER_ADMIN_COPY.store_operator, tone: "info" }
    : { axis: "store", key: "none", labelKo: "매장 없음", tone: "neutral" };
}

export function memberAdminPrivilegeBadge(
  role: "member" | "admin" | "super_admin",
): MemberAdminBadgeSpec {
  if (role === "super_admin") {
    return {
      axis: "privilege",
      key: "super_admin",
      labelKo: MEMBER_ADMIN_COPY.privilege_super_admin,
      tone: "violet",
    };
  }
  if (role === "admin") {
    return { axis: "privilege", key: "admin", labelKo: MEMBER_ADMIN_COPY.privilege_admin, tone: "info" };
  }
  return { axis: "privilege", key: "member", labelKo: MEMBER_ADMIN_COPY.privilege_member, tone: "neutral" };
}

/** Structural guard: labels must never collapse BLOCKED into SUSPENDED. */
export function memberAdminBlockedDistinctFromSuspended(): boolean {
  const blocked = memberAdminAccountStatusBadge("BLOCKED");
  const suspended = memberAdminAccountStatusBadge("SUSPENDED");
  const blockedCopy = String(MEMBER_ADMIN_COPY.status_blocked);
  const suspendedCopy = String(MEMBER_ADMIN_COPY.status_suspended);
  return (
    blockedCopy !== suspendedCopy &&
    blocked.labelKo !== suspended.labelKo &&
    blocked.tone !== suspended.tone
  );
}
