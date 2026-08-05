/**
 * Slice 8-1 — Auth State Boundary Authority Contract (PLAN_B4 SSOT).
 *
 * NO_MEGA_FSM. This file is ownership documentation + type SSOT only.
 * It does not drive Runtime transitions, navigation, profile writes, or session phase.
 *
 * Layers must not invade each other:
 * Session Lifecycle ≠ Common Completion ≠ Observability ≠ Provider Local ≠ UI Presentation
 *
 * @see .qa-logs/auth-slice8-state-machine-implementation-plan-2026-08-05/
 */

/** Fixed architecture decision — do not invent a unified Auth enum FSM. */
export const AUTH_STATE_ARCHITECTURE = "NO_MEGA_FSM" as const;

export const AUTH_STATE_BOUNDARY_STRATEGY = "PLAN_B4" as const;

/** Trace stage naming policy — keep enum names; Observability-only contracts. */
export const AUTH_TRACE_NAMING_PLAN = "PLAN_T1" as const;

export type AuthStateBoundaryLayer =
  | "sessionLifecycle"
  | "commonCompletion"
  | "observability"
  | "providerLocal"
  | "uiPresentation";

export type AuthStateBoundarySpec = {
  layer: AuthStateBoundaryLayer;
  ownerModules: readonly string[];
  ownedResponsibilities: readonly string[];
  forbiddenResponsibilities: readonly string[];
};

/**
 * Single authority map for Auth state-related layers.
 * Runtime behavior lives in the listed owner modules — not here.
 */
export const AUTH_STATE_BOUNDARIES = {
  sessionLifecycle: {
    layer: "sessionLifecycle",
    ownerModules: [
      "lib/auth/dibay-session-manager.ts",
      "lib/auth/dibay-session-policy.ts",
      "markSessionAuthenticatedFromClient",
      "markSessionTerminalGuestFromClient",
      "markSessionRecoveringFromClient",
      "ensureSessionHealthy",
      "bindDibaySessionManagerAuthListener",
      "lib/auth/explicit-logout-flow.ts",
    ],
    ownedResponsibilities: [
      "cold",
      "resume",
      "session_restore",
      "recovering",
      "authenticated",
      "terminal_guest",
      "corrupt",
      "logout_restore_block",
      "DibaySessionPhase",
    ],
    forbiddenResponsibilities: [
      "profile_write",
      "destination_resolve",
      "login_navigation",
      "provider_challenge",
      "oauth_lock",
      "lifecycle_trace_result_as_authority",
    ],
  },
  commonCompletion: {
    layer: "commonCompletion",
    ownerModules: [
      "lib/auth/finish-client-auth-login.client.ts",
      "lib/auth/completion/run-common-auth-client-completion.client.ts",
      "syncCommonClientSessionAfterAuth",
      "resolveCommonAuthDestination",
      "ensureAuthProfileForLogin",
      "buildNativeAuthCompletionHandoff",
    ],
    ownedResponsibilities: [
      "post_login_client_sync",
      "destination_use",
      "navigation",
      "completion_success_failure",
    ],
    forbiddenResponsibilities: [
      "cold_restore",
      "resume_restore",
      "logout",
      "terminal_guest_definition",
      "provider_sdk",
      "profile_writer_policy",
      "dibay_session_phase_definition",
      "direct_setSessionPhase",
    ],
  },
  observability: {
    layer: "observability",
    ownerModules: [
      "lib/auth/oauth/auth-lifecycle-trace.ts",
      "AuthLifecycleStage",
      "AuthLifecycleResult",
    ],
    ownedResponsibilities: [
      "lifecycle_logs",
      "runtime_evidence",
      "stage_result_recording",
      "qa_observability",
    ],
    forbiddenResponsibilities: [
      "session_phase_transition",
      "profile_write",
      "destination_resolve",
      "client_sync",
      "navigation",
      "logout",
      "retry_policy",
      "product_success_failure_decision",
    ],
  },
  providerLocal: {
    layer: "providerLocal",
    ownerModules: [
      "lib/auth/oauth/native-oauth-contract.ts",
      "tryBeginOAuthFlow",
      "endOAuthFlow",
      "releaseOAuthFlowOnUserCancel",
      "google_recover_pending",
      "provider_sdk_in_flight",
    ],
    ownedResponsibilities: [
      "duplicate_auth_start_mutex",
      "provider_challenge_in_flight",
      "cancel_release",
      "provider_local_recover",
    ],
    forbiddenResponsibilities: [
      "session_lifecycle",
      "common_completion",
      "profile",
      "destination",
      "navigation",
      "durable_auth_state",
    ],
  },
  uiPresentation: {
    layer: "uiPresentation",
    ownerModules: [
      "app/login/LoginPageClient.tsx",
      "components/auth/AuthModal.tsx",
      "lib/auth/oauth/use-oauth-login.ts",
    ],
    ownedResponsibilities: [
      "loading",
      "error_message",
      "button_disabled",
      "modal_visibility",
    ],
    forbiddenResponsibilities: [
      "product_auth_authority",
      "session_phase",
      "profile_writer",
      "destination_policy",
      "client_sync_policy",
      "navigation_policy",
      "durable_auth_state",
    ],
  },
} as const satisfies Record<AuthStateBoundaryLayer, AuthStateBoundarySpec>;

/** Slice 6 Completion owners — must remain unchanged by Slice 8-1. */
export const SLICE6_PROTECTED_COMPLETION_OWNERS = {
  profile: "ensureAuthProfileForLogin",
  destination: "resolveCommonAuthDestination",
  clientSync: "syncCommonClientSessionAfterAuth",
  handoff: "buildNativeAuthCompletionHandoff",
  finish: "finishClientAuthLogin",
  navigation: "runCommonAuthClientCompletion",
  googleHardGate: "ensureProfileForUserId",
} as const;

/** Official Session APIs Completion may call as side-effect (never invent phase ownership). */
export const COMPLETION_ALLOWED_SESSION_APIS = [
  "primeClientAuthSessionFromSupabase",
  "markSessionAuthenticatedFromClient",
] as const;

/** Cold/Resume restore owners — Completion must not call these for restore authority. */
export const SESSION_RESTORE_OWNER_APIS = [
  "ensureSessionHealthy",
  "bindDibaySessionManagerAuthListener",
] as const;

/** QA-only classifications — never add to product Auth enums. */
export const QA_EXTERNAL_CLASSIFICATIONS = [
  "EXTERNAL_AUTH_CHALLENGE_BLOCKED",
  "EXTERNAL_INSTRUMENTATION_BLOCKED",
  "NOT_RUN",
  "NOT_PROVEN",
  "PARTIAL_EXTERNAL_CLOSED",
] as const;

/** Trace must not import these Production Authority modules. */
export const TRACE_FORBIDDEN_IMPORT_NEEDLES = [
  "dibay-session-manager",
  "ensure-auth-profile-for-login",
  "ensureAuthProfileForLogin",
  "resolve-common-auth-destination",
  "resolveCommonAuthDestination",
  "sync-common-client-session",
  "syncCommonClientSessionAfterAuth",
  "finish-client-auth-login",
  "run-common-auth-client-completion",
  "next/navigation",
  "next/router",
] as const;

/** Session manager must not import/call login destination or completion navigation. */
export const SESSION_MANAGER_FORBIDDEN_IMPORT_NEEDLES = [
  "resolve-common-auth-destination",
  "resolveCommonAuthDestination",
  "finish-client-auth-login",
  "finishClientAuthLogin",
  "run-common-auth-client-completion",
  "runCommonAuthClientCompletion",
  "ensure-auth-profile-for-login",
  "ensureAuthProfileForLogin",
] as const;
