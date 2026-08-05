/**
 * Slice 8-3 — Session Lifecycle Ownership Contract.
 *
 * Cold / Resume / Restore / Logout / restore-block Authority is
 * dibay-session-manager (+ official markSession* / ensureSessionHealthy).
 *
 * NO_MEGA_FSM. This file is ownership SSOT only — not a phase engine.
 *
 * @see lib/auth/state/auth-state-boundary-contract.ts
 * @see lib/auth/dibay-session-manager.ts
 * @see lib/auth/dibay-session-policy.ts
 */

export const AUTH_SESSION_LIFECYCLE_OWNER_MODULE =
  "lib/auth/dibay-session-manager.ts" as const;

export const AUTH_SESSION_PHASE_POLICY_MODULE =
  "lib/auth/dibay-session-policy.ts" as const;

/** Only these product phases exist — QA EXTERNAL_* must never be added. */
export const AUTH_SESSION_PRODUCT_PHASES = [
  "loading",
  "authenticated",
  "recovering",
  "terminal_guest",
  "corrupt",
] as const;

/** Private setter — must exist only inside dibay-session-manager. */
export const AUTH_SESSION_PRIVATE_PHASE_SETTER = "setSessionPhase" as const;

/** Official Session Lifecycle APIs (callers may invoke; may not reimplement phase rules). */
export const AUTH_SESSION_OFFICIAL_APIS = [
  "getSessionPhase",
  "markSessionAuthenticatedFromClient",
  "markSessionTerminalGuestFromClient",
  "markSessionRecoveringFromClient",
  "ensureSessionHealthy",
  "bindDibaySessionManagerAuthListener",
  "subscribeSessionPhase",
  "attemptRecoverableGuestSession",
  "handleApi401",
] as const;

/** Modules allowed to call official markSession* (not direct setSessionPhase). */
export const AUTH_SESSION_OFFICIAL_MARK_CALLERS = [
  "lib/auth/dibay-session-manager.ts",
  "lib/auth/auth-session-immediate.client.ts",
  "lib/app-boot/run-app-boot.ts",
  "lib/auth/explicit-logout-flow.ts",
  "lib/auth/logout-client.ts",
] as const;

/** Cold / Resume entry surfaces — must not re-run Common Completion. */
export const AUTH_SESSION_COLD_RESUME_SURFACES = [
  "lib/app-boot/run-app-boot.ts",
  "lib/auth/dibay-session-manager.ts",
  "hooks/use-client-membership-state.ts",
  "components/auth/SessionLostRedirect.tsx",
  "components/auth/SupabaseAuthSync.tsx",
] as const;

/** Modules that must never write DibaySessionPhase / call setSessionPhase. */
export const AUTH_SESSION_PHASE_WRITE_FORBIDDEN_MODULES = [
  "app/login/LoginPageClient.tsx",
  "components/auth/AuthModal.tsx",
  "lib/auth/oauth/use-oauth-login.ts",
  "lib/auth/oauth/auth-lifecycle-trace.ts",
  "lib/auth/oauth/native-oauth-contract.ts",
  "lib/auth/finish-client-auth-login.client.ts",
  "lib/auth/completion/run-common-auth-client-completion.client.ts",
  "lib/auth/completion/sync-common-client-session.client.ts",
  "lib/auth/completion/resolve-common-auth-destination.server.ts",
  "lib/auth/completion/ensure-auth-profile-for-login.server.ts",
] as const;

/** Completion may use these only as side-effect paths — never own Cold/Resume. */
export const AUTH_SESSION_COMPLETION_ALLOWED_SIDE_EFFECTS = [
  "primeClientAuthSessionFromSupabase",
  "markSessionAuthenticatedFromClient",
] as const;

/** Logout restore-block stack (not UI-only / not wipe-skip timeout alone). */
export const AUTH_SESSION_LOGOUT_RESTORE_BLOCK = {
  flow: "lib/auth/explicit-logout-flow.ts",
  wipe: "lib/auth/client-session-wipe.ts",
  guestTerminal: "establishGuestAuthState",
  phase: "markSessionTerminalGuestFromClient",
  ensureHealthyGate: "shouldSkipEnsureHealthyForTerminalGuestGate",
  bfcacheGuard: "POST_LOGOUT_BFCACHE_GUARD_KEY",
  wipeSkipIsNotRestoreBlock: "shouldSkipSignedOutEventWipe",
} as const;

/** Account switch wipe reason — must clear prior user caches. */
export const AUTH_SESSION_ACCOUNT_SWITCH_WIPE_REASON = "account_switched" as const;

export const AUTH_SESSION_QA_EXTERNAL_NOT_PHASES = [
  "EXTERNAL_AUTH_CHALLENGE_BLOCKED",
  "EXTERNAL_INSTRUMENTATION_BLOCKED",
  "NOT_RUN",
  "NOT_PROVEN",
  "PARTIAL_EXTERNAL_CLOSED",
] as const;

/** Session manager must never import these Completion / destination / nav authorities. */
export const AUTH_SESSION_MANAGER_FORBIDDEN_IMPORT_NEEDLES = [
  "finish-client-auth-login",
  "finishClientAuthLogin",
  "run-common-auth-client-completion",
  "runCommonAuthClientCompletion",
  "resolve-common-auth-destination",
  "resolveCommonAuthDestination",
  "ensure-auth-profile-for-login",
  "ensureAuthProfileForLogin",
  "next/navigation",
  "next/router",
] as const;

/** Cold/Resume surfaces must not call these Completion/nav entrypoints. */
export const AUTH_SESSION_COLD_RESUME_FORBIDDEN_CALLS = [
  "finishClientAuthLogin",
  "runCommonAuthClientCompletion",
  "resolveCommonAuthDestination",
] as const;
