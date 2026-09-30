/**
 * Member account state SSOT (P0 Owner policy).
 *
 * ACTIVE / SUSPENDED / BLOCKED / WITHDRAWN / PURGED
 * BLOCKED ≠ WITHDRAWN ≠ PURGED
 * SUSPENDED ≠ BLOCKED
 *
 * Operator UI copy lives elsewhere; this module is product/auth enforcement only.
 */

export type MemberAccountLifecycle =
  | "active"
  | "suspended"
  | "blocked"
  | "withdrawn"
  | "unknown";

export type MemberAccountProfileLike = {
  status?: string | null;
  deleted_at?: string | null;
};

export function normalizeMemberAccountStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

export function isWithdrawnMemberAccount(profile: MemberAccountProfileLike | null | undefined): boolean {
  if (!profile) return false;
  if (profile.deleted_at) return true;
  const status = normalizeMemberAccountStatus(profile.status);
  return status === "deleted" || status === "withdrawn" || status === "deactivated";
}

export function isBlockedMemberAccount(profile: MemberAccountProfileLike | null | undefined): boolean {
  if (!profile) return false;
  // Historical ban path wrote deleted; new path is status=blocked with PII retained.
  return normalizeMemberAccountStatus(profile.status) === "blocked";
}

export function isSuspendedMemberAccount(profile: MemberAccountProfileLike | null | undefined): boolean {
  return normalizeMemberAccountStatus(profile?.status) === "suspended";
}

/** Login denied: blocked or withdrawn. Suspended may still log in. */
export function isLoginDeniedMemberAccount(profile: MemberAccountProfileLike | null | undefined): boolean {
  return isWithdrawnMemberAccount(profile) || isBlockedMemberAccount(profile);
}

/** Major product writes denied for suspended/blocked/withdrawn. */
export function isProductWriteDeniedMemberAccount(
  profile: MemberAccountProfileLike | null | undefined
): boolean {
  return (
    isSuspendedMemberAccount(profile) ||
    isBlockedMemberAccount(profile) ||
    isWithdrawnMemberAccount(profile)
  );
}

export function resolveMemberAccountLifecycle(
  profile: MemberAccountProfileLike | null | undefined
): MemberAccountLifecycle {
  if (!profile) return "unknown";
  if (isWithdrawnMemberAccount(profile)) return "withdrawn";
  if (isBlockedMemberAccount(profile)) return "blocked";
  if (isSuspendedMemberAccount(profile)) return "suspended";
  const status = normalizeMemberAccountStatus(profile.status);
  if (
    !status ||
    status === "active" ||
    status === "sns_pending" ||
    status === "verified_user"
  ) {
    return "active";
  }
  return "unknown";
}

export const MEMBER_ACCOUNT_LOGIN_DENIED = {
  withdrawn: {
    code: "account_withdrawn" as const,
    messageKo: "탈퇴한 계정입니다. 다시 이용하려면 새로 가입해 주세요.",
  },
  blocked: {
    code: "account_blocked" as const,
    messageKo: "이용이 차단된 계정입니다. 관리자 차단 해제 후 다시 로그인해 주세요.",
  },
};

export const MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE =
  "이 회원은 현재 활동이 제한되어 있습니다.";

/** P0-R3 — lifecycle authority missing/unreadable (not ACTIVE). */
export const MEMBER_ACCOUNT_STATE_UNAVAILABLE = {
  code: "account_state_unavailable" as const,
  /** User-facing — no internal DB detail. */
  messageKo: "계정 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  status: 503 as const,
};

export function resolveLoginDeniedForMemberAccount(
  profile: MemberAccountProfileLike | null | undefined
): { code: "account_withdrawn" | "account_blocked"; messageKo: string } | null {
  if (isWithdrawnMemberAccount(profile)) return MEMBER_ACCOUNT_LOGIN_DENIED.withdrawn;
  if (isBlockedMemberAccount(profile)) return MEMBER_ACCOUNT_LOGIN_DENIED.blocked;
  return null;
}
