/**
 * P0-R2 — Member mutation action-class policy (central authority).
 *
 * CLASS:
 * - PRODUCT_WRITE (DENY when restricted)
 * - EXEMPT (explicit restricted-safe)
 * - NON_MEMBER (not member-lifecycle gated)
 * - IDENTITY (authenticated identity only — no product-write gate)
 *
 * Do not paste per-route `if status === suspended|blocked`.
 */

import {
  isProductWriteDeniedMemberAccount,
  MEMBER_ACCOUNT_STATE_UNAVAILABLE,
  MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE,
  resolveLoginDeniedForMemberAccount,
  resolveMemberAccountLifecycle,
  type MemberAccountProfileLike,
} from "@/lib/auth/member-account-state";

export type MemberActionClass = "PRODUCT_WRITE" | "EXEMPT" | "NON_MEMBER" | "IDENTITY";

export type MemberMutationPolicyClass = "DENY" | "ALLOW" | "EXEMPT" | "NON_MEMBER";

const ALL_LIFECYCLE = ["active", "suspended", "blocked", "withdrawn"] as const;

/**
 * Explicit EXEMPT — exact method+path inventory (13). Never wildcard /auth/* /account/* /support/*.
 * Restricted states may still perform these. Never "unguarded = exempt".
 */
export const MEMBER_MUTATION_EXEMPT_RULES: ReadonlyArray<{
  match: (pathname: string) => boolean;
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  inventoryPath: string;
  why: string;
  actor: "member";
  allowedStates: ReadonlyArray<"active" | "suspended" | "blocked" | "withdrawn">;
  allowedAction: string;
  dataMutationEffect: string;
}> = [
  {
    match: (p) => p === "/api/account/phone/send-otp",
    method: "POST",
    inventoryPath: "POST /api/account/phone/send-otp",
    why: "security recovery — phone OTP send",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "phone_send_otp",
    dataMutationEffect: "sends OTP; does not restore product access or change lifecycle",
  },
  {
    match: (p) => p === "/api/account/phone/verify-otp",
    method: "POST",
    inventoryPath: "POST /api/account/phone/verify-otp",
    why: "security recovery — phone OTP verify",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "phone_verify_otp",
    dataMutationEffect: "verifies phone; does not clear suspend/block/withdraw",
  },
  {
    match: (p) => p === "/api/auth/logout",
    method: "POST",
    inventoryPath: "POST /api/auth/logout",
    why: "logout — restricted-safe account exit",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "logout",
    dataMutationEffect: "ends current session only",
  },
  {
    match: (p) => p === "/api/auth/logout-all",
    method: "POST",
    inventoryPath: "POST /api/auth/logout-all",
    why: "logout-all — restricted-safe account exit",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "logout_all",
    dataMutationEffect: "revokes all sessions; does not restore product access",
  },
  {
    match: (p) => p === "/api/auth/native/exchange",
    method: "POST",
    inventoryPath: "POST /api/auth/native/exchange",
    why: "native session exchange — auth bootstrap",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "native_exchange",
    dataMutationEffect: "session cookie exchange; lifecycle still enforced on PRODUCT_WRITE",
  },
  {
    match: (p) => p === "/api/auth/password-login/resolve-identifier",
    method: "POST",
    inventoryPath: "POST /api/auth/password-login/resolve-identifier",
    why: "login identifier resolve — access path",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "login_resolve",
    dataMutationEffect: "identifier lookup only; no product mutation",
  },
  {
    match: (p) => p === "/api/auth/profile/ensure",
    method: "POST",
    inventoryPath: "POST /api/auth/profile/ensure",
    why: "profile ensure — auth bootstrap",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "profile_ensure",
    dataMutationEffect: "ensures profile row exists; must not clear moderation state",
  },
  {
    match: (p) => p === "/api/auth/provider/conflict-check",
    method: "POST",
    inventoryPath: "POST /api/auth/provider/conflict-check",
    why: "provider conflict check — auth bootstrap",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "provider_conflict_check",
    dataMutationEffect: "read/check only",
  },
  {
    match: (p) => p === "/api/auth/provider/link/complete",
    method: "POST",
    inventoryPath: "POST /api/auth/provider/link/complete",
    why: "security recovery provider link complete",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "provider_link_complete",
    dataMutationEffect: "links auth provider; does not restore product access",
  },
  {
    match: (p) => p === "/api/auth/provider/link/start",
    method: "POST",
    inventoryPath: "POST /api/auth/provider/link/start",
    why: "security recovery provider link start",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "provider_link_start",
    dataMutationEffect: "starts link flow; no lifecycle change",
  },
  {
    match: (p) => /^\/api\/me\/auth-providers\/[^/]+$/.test(p),
    method: "DELETE",
    inventoryPath: "DELETE /api/me/auth-providers/[provider]",
    why: "security recovery provider unlink",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "provider_unlink",
    dataMutationEffect: "unlinks provider; does not clear suspend/block/withdraw",
  },
  {
    match: (p) => p === "/api/support/cases/open",
    method: "POST",
    inventoryPath: "POST /api/support/cases/open",
    why: "support appeal — restricted user contact",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "support_open",
    dataMutationEffect: "opens support case; does not restore product access",
  },
  {
    match: (p) => {
      if (p === "/api/support/cases/open") return false;
      return /^\/api\/support\/cases\/[^/]+$/.test(p);
    },
    method: "POST",
    inventoryPath: "POST /api/support/cases/[caseId]",
    why: "support appeal — restricted user case message",
    actor: "member",
    allowedStates: ALL_LIFECYCLE,
    allowedAction: "support_case_message",
    dataMutationEffect: "writes support case traffic; does not restore product access",
  },
];

/** Inventory EXEMPT count Owner contract (exact 13). */
export const MEMBER_MUTATION_EXEMPT_INVENTORY_COUNT = 13;

export function isMemberMutationExemptPath(pathname: string): boolean {
  const p = normalizeApiPath(pathname);
  return MEMBER_MUTATION_EXEMPT_RULES.some((r) => r.match(p));
}

export function findMemberMutationExemptRule(pathname: string) {
  const p = normalizeApiPath(pathname);
  return MEMBER_MUTATION_EXEMPT_RULES.find((r) => r.match(p)) ?? null;
}

export function isNonMemberMutationPath(pathname: string): boolean {
  const p = normalizeApiPath(pathname);
  if (p.startsWith("/api/admin/")) return true;
  if (p.startsWith("/api/cron/")) return true;
  if (p.includes("/webhooks/")) return true;
  if (p.includes("/test-login") || p.includes("/test-logout")) return true;
  if (
    p.startsWith("/api/platform-popup/events") ||
    p.startsWith("/api/platform-popup/suppress") ||
    p.startsWith("/api/platform-promotion") ||
    p.includes("/increment-view")
  ) {
    return true;
  }
  return false;
}

export function normalizeApiPath(pathname: string): string {
  const raw = String(pathname ?? "").trim() || "/";
  if (!raw.startsWith("/")) return `/${raw}`;
  return raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/**
 * Classify an API mutation path for member-lifecycle enforcement.
 * Inventory CLASS DENY ↔ action PRODUCT_WRITE.
 */
export function resolveMemberActionClassForApiMutation(pathname: string): MemberActionClass {
  const p = normalizeApiPath(pathname);
  if (!p.startsWith("/api/")) return "NON_MEMBER";
  if (isNonMemberMutationPath(p)) return "NON_MEMBER";
  if (isMemberMutationExemptPath(p)) return "EXEMPT";
  return "PRODUCT_WRITE";
}

export function resolveMemberMutationPolicyClass(pathname: string): MemberMutationPolicyClass {
  const action = resolveMemberActionClassForApiMutation(pathname);
  if (action === "NON_MEMBER") return "NON_MEMBER";
  if (action === "EXEMPT") return "EXEMPT";
  // PRODUCT_WRITE / IDENTITY mutation surfaces → DENY when restricted (ACTIVE allow at runtime).
  return "DENY";
}

export type MemberActionDecision =
  | { ok: true }
  | {
      ok: false;
      status: 403 | 503;
      code:
        | "account_blocked"
        | "account_withdrawn"
        | "member_product_write_denied"
        | "account_state_unavailable";
      messageKo: string;
    };

/**
 * Central decision for a resolved member profile + action class.
 * Null/missing profile is not ACTIVE — DENY (P0-R3 fail-closed).
 * UNKNOWN lifecycle is DENY.
 */
export function assertMemberProductAction(
  profile: MemberAccountProfileLike | null | undefined,
  action: MemberActionClass
): MemberActionDecision {
  if (action === "NON_MEMBER" || action === "EXEMPT" || action === "IDENTITY") {
    return { ok: true };
  }
  if (!profile) {
    return {
      ok: false,
      status: MEMBER_ACCOUNT_STATE_UNAVAILABLE.status,
      code: MEMBER_ACCOUNT_STATE_UNAVAILABLE.code,
      messageKo: MEMBER_ACCOUNT_STATE_UNAVAILABLE.messageKo,
    };
  }
  const lifecycle = resolveMemberAccountLifecycle(profile);
  if (lifecycle === "unknown") {
    return {
      ok: false,
      status: MEMBER_ACCOUNT_STATE_UNAVAILABLE.status,
      code: MEMBER_ACCOUNT_STATE_UNAVAILABLE.code,
      messageKo: MEMBER_ACCOUNT_STATE_UNAVAILABLE.messageKo,
    };
  }
  // PRODUCT_WRITE — blocked/withdrawn also fail login elsewhere; still deny write here.
  const loginDenied = resolveLoginDeniedForMemberAccount(profile);
  if (loginDenied) {
    return {
      ok: false,
      status: 403,
      code: loginDenied.code,
      messageKo: loginDenied.messageKo,
    };
  }
  if (isProductWriteDeniedMemberAccount(profile)) {
    return {
      ok: false,
      status: 403,
      code: "member_product_write_denied",
      messageKo: MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE,
    };
  }
  return { ok: true };
}

export const MEMBER_PRODUCT_WRITE_HTTP = {
  status: 403 as const,
  code: "member_product_write_denied" as const,
};
