/**
 * Slice 8-2 — Auth Lifecycle Trace Observability-Only Contract (PLAN_T1).
 *
 * Trace records stages/results for Runtime evidence. It must not drive
 * session, completion, profile, destination, navigation, or logout.
 *
 * Stage names (e.g. profile_resolved) are observational labels only — PLAN_T1 keeps them.
 *
 * @see lib/auth/state/auth-state-boundary-contract.ts
 * @see lib/auth/oauth/auth-lifecycle-trace.ts
 */

export const AUTH_TRACE_OBSERVABILITY_PLAN = "PLAN_T1" as const;

export const AUTH_TRACE_MODULE = "lib/auth/oauth/auth-lifecycle-trace.ts" as const;

/** Product Trace results — QA EXTERNAL_* must never be added here. */
export const AUTH_TRACE_PRODUCT_RESULTS = ["ok", "fail", "cancel", "in_progress"] as const;

/** Observational stage labels — not product Auth state authority. */
export const AUTH_TRACE_OBSERVATIONAL_STAGES = [
  "login_button_tapped",
  "routing_decision_completed",
  "provider_launch_requested",
  "provider_ui_presented",
  "provider_credential_received",
  "exchange_requested",
  "server_session_established",
  "cookie_handoff_completed",
  "client_session_visible",
  "profile_resolved",
  "onboarding_resolved",
  "navigation_committed",
  "interaction_ready",
] as const;

/** Production callers that may emit Trace (fire-and-forget / correlation only). */
export const AUTH_TRACE_PRODUCTION_CALLERS = [
  "lib/auth/oauth/use-oauth-login.ts",
  "lib/auth/finish-client-auth-login.client.ts",
  "lib/auth/completion/run-common-auth-client-completion.client.ts",
  "lib/auth/native/post-native-exchange.client.ts",
  "lib/auth/native/start-native-apple-login.client.ts",
  "lib/auth/native/sync-client-session-after-native-exchange.client.ts",
  "lib/auth/oauth/native-oauth-return-bridge.ts",
] as const;

/** Trace exports — return values must not drive product Auth policy. */
export const AUTH_TRACE_API = [
  "beginAuthLifecycleFlow",
  "markAuthLifecycleStage",
  "bumpAuthLifecycleCounter",
  "completeAuthLifecycle",
  "failAuthLifecycle",
  "cancelAuthLifecycle",
  "getActiveAuthFlowId",
  "authLifecycleExchangeHeaders",
  "redactAuthLifecycleDetail",
] as const;

/**
 * Authority / policy modules Trace must never import.
 * (Import graph guard — Slice 8-2.)
 */
export const AUTH_TRACE_FORBIDDEN_IMPORT_NEEDLES = [
  "dibay-session-manager",
  "dibay-session-policy",
  "ensure-auth-profile-for-login",
  "ensureAuthProfileForLogin",
  "ensureProfileForUserId",
  "persistGoogleProfileIdentity",
  "persistKakaoProfileIdentity",
  "persistAppleProfileIdentity",
  "ensureProviderAuthIdentityRow",
  "persistOAuthProviderIdentity",
  "resolve-common-auth-destination",
  "resolveCommonAuthDestination",
  "sync-common-client-session",
  "syncCommonClientSessionAfterAuth",
  "finish-client-auth-login",
  "run-common-auth-client-completion",
  "explicit-logout-flow",
  "client-session-wipe",
  "logout-client",
  "guest-auth-recovery",
  "next/navigation",
  "next/router",
] as const;

/** Sensitive detail keys that must be redacted (never logged in clear). */
export const AUTH_TRACE_SENSITIVE_DETAIL_KEYS = [
  "identityToken",
  "id_token",
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "authorization",
  "authorizationCode",
  "code",
  "cookie",
  "jwt",
  "password",
  "email",
] as const;

/** QA-only — not AuthLifecycleResult. */
export const AUTH_TRACE_QA_EXTERNAL_CLASSIFICATIONS = [
  "EXTERNAL_AUTH_CHALLENGE_BLOCKED",
  "EXTERNAL_INSTRUMENTATION_BLOCKED",
  "NOT_RUN",
  "NOT_PROVEN",
  "PARTIAL_EXTERNAL_CLOSED",
] as const;
