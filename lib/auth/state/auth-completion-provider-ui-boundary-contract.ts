/**
 * Slice 8-4 — Completion / Provider / UI Boundary Contract.
 *
 * Reuses Slice 6 Completion owners. Does not redesign Completion, Profile, Destination, or Sync.
 * Provider + UI may deliver Thin Handoff / finish inputs only — never own Completion policy.
 *
 * @see lib/auth/completion/types.ts
 * @see lib/auth/completion/build-native-auth-completion-handoff.client.ts
 * @see lib/auth/state/auth-state-boundary-contract.ts
 */

/** Client Completion chain (Slice 6 CLOSED). */
export const AUTH_CLIENT_COMPLETION_CHAIN = [
  "finishClientAuthLogin",
  "runCommonAuthClientCompletion",
] as const;

/** Server Completion edge (Native exchange / Web / Naver). */
export const AUTH_SERVER_COMPLETION_EDGE = [
  "ensureAuthProfileForLogin",
  "resolveCommonAuthDestination",
] as const;

/** Thin Handoff builder — Provider client success → Completion input. */
export const AUTH_THIN_HANDOFF_BUILDER = "buildNativeAuthCompletionHandoff" as const;

/** Production modules that may call finishClientAuthLogin. */
export const AUTH_FINISH_CLIENT_AUTH_LOGIN_CALLERS = [
  "app/login/LoginPageClient.tsx",
  "components/auth/AuthModal.tsx",
  /** Google recover only — shared Thin Handoff then finish once (Slice 6-4). */
  "lib/auth/native/start-native-google-login.client.ts",
] as const;

/**
 * Production modules that may call runCommonAuthClientCompletion.
 * Must be exactly finishClientAuthLogin (tests excluded at verify time).
 */
export const AUTH_RUN_COMMON_COMPLETION_OWNER =
  "lib/auth/finish-client-auth-login.client.ts" as const;

/** Native Provider client modules — Thin Handoff only (except Google recover finish). */
export const AUTH_NATIVE_PROVIDER_CLIENT_MODULES = [
  "lib/auth/native/start-native-google-login.client.ts",
  "lib/auth/native/start-native-kakao-login.client.ts",
  "lib/auth/native/start-native-apple-login.client.ts",
] as const;

/** UI presentation / handoff forwarders. */
export const AUTH_UI_HANDOFF_FORWARDERS = [
  "app/login/LoginPageClient.tsx",
  "components/auth/AuthModal.tsx",
  "lib/auth/oauth/use-oauth-login.ts",
] as const;

/**
 * Handoff fields UI must forward without recomputing policy.
 * (Login/AuthModal OAuth success handlers.)
 */
export const AUTH_UI_REQUIRED_HANDOFF_FORWARD_FIELDS = [
  "redirectTo",
  "needsTermsAgreement",
  "consentComplete",
  "signupComplete",
  "syncFromNativeExchangeCookies",
] as const;

/**
 * Allowed non-success Navigation from Login UI (URL cleanup only — not login success).
 * Documented exception to "UI must not own success navigation".
 */
export const AUTH_UI_ALLOWED_NON_SUCCESS_NAV = {
  module: "app/login/LoginPageClient.tsx",
  pattern: 'router.replace(withNextSearchParam("/login"',
  purpose: "Clear loginReason / auth_error query while staying on /login — not post-login success nav",
} as const;

/** Client Provider/UI must not import or call these Completion policy owners. */
export const AUTH_PROVIDER_UI_FORBIDDEN_CLIENT_IMPORTS = [
  "ensure-auth-profile-for-login",
  "ensureAuthProfileForLogin",
  "resolve-common-auth-destination",
  "resolveCommonAuthDestination",
  "sync-common-client-session",
  "syncCommonClientSessionAfterAuth",
  "run-common-auth-client-completion",
  "runCommonAuthClientCompletion",
  "dibay-session-manager",
] as const;

/**
 * Approved server-side Profile/Destination edge (not a client Provider bypass).
 * Classified separately from client Provider/UI.
 */
export const AUTH_APPROVED_SERVER_PROFILE_DESTINATION_MODULES = [
  "lib/auth/native/google-native-session.server.ts",
  "lib/auth/native/kakao-native-session.server.ts",
  "lib/auth/native/apple-native-session.server.ts",
  "app/auth/callback/route.ts",
  "app/api/auth/naver/callback/route.ts",
] as const;

/** Web/Naver must keep HTTP redirect Completion (not client runCommon). */
export const AUTH_WEB_NAVER_HTTP_REDIRECT_MODULES = [
  "app/auth/callback/route.ts",
  "app/api/auth/naver/callback/route.ts",
] as const;
