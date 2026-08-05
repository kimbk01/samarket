/**
 * Slice 8-5 — External / QA Classification Contract.
 *
 * Product Auth results and QA/environment classifications must never merge.
 * This file is classification SSOT only — not a product enum engine.
 *
 * @see lib/auth/oauth/auth-lifecycle-trace.ts AuthLifecycleResult
 * @see lib/auth/dibay-session-policy.ts DibaySessionPhase
 * @see lib/auth/state/auth-state-boundary-contract.ts
 */

/** Product Trace results (Runtime). */
export const AUTH_PRODUCT_LIFECYCLE_RESULTS = [
  "ok",
  "fail",
  "cancel",
  "in_progress",
] as const;

/** Product session phases (Runtime). */
export const AUTH_PRODUCT_SESSION_PHASES = [
  "loading",
  "authenticated",
  "recovering",
  "terminal_guest",
  "corrupt",
] as const;

/**
 * Observed product failure / error code examples (not a new enum).
 * Only document names already used in product Auth paths.
 */
export const AUTH_PRODUCT_FAILURE_CODE_EXAMPLES = [
  "user_cancelled",
  "oauth_flow_in_flight",
  "apple_native_unavailable",
  "google_native_unavailable",
  "native_exchange_session_unavailable",
  "client_session_sync_failed",
  "android_cookie_flush_failed",
  "empty_destination",
  "profile_ensure_failed",
  "provider_account_conflict",
] as const;

/**
 * QA / environment classifications — never product Auth state.
 * Allowed in: .qa-logs, docs, contract SSOT, verify scripts, tests asserting absence.
 */
export const AUTH_QA_EXTERNAL_CLASSIFICATIONS = [
  "EXTERNAL_AUTH_CHALLENGE_BLOCKED",
  "EXTERNAL_INSTRUMENTATION_BLOCKED",
  "NOT_RUN",
  "NOT_REACHED",
  "NOT_OBSERVED",
  "NOT_PROVEN",
  "PARTIAL_EXTERNAL_CLOSED",
  "RUNTIME_NOT_RUN",
  "DEPLOY_REQUIRED",
] as const;

/** Program operating verdicts (QA reports only — not product enums). */
export const AUTH_QA_PROGRAM_VERDICTS = [
  "PASS",
  "FAIL",
  "PARTIAL_EXTERNAL_CLOSED",
  "BLOCKED",
  "CLOSED",
] as const;

/**
 * Mapping contract (product ↔ QA).
 * Does not drive Runtime — documents how auditors must classify evidence.
 */
export const AUTH_QA_CLASSIFICATION_MAPPING = {
  userCancelled: {
    product: "AuthLifecycleResult.cancel (cancelAuthLifecycle / user_cancelled)",
    qa: "USER_CANCELLED",
    notProductFail: true,
  },
  externalAuthChallengeBlocked: {
    product: "No automatic product fail; Code First Break not proven",
    qa: "EXTERNAL_AUTH_CHALLENGE_BLOCKED",
    notProductFail: true,
  },
  externalInstrumentationBlocked: {
    product: "Not a Runtime Auth failure state",
    qa: "EXTERNAL_INSTRUMENTATION_BLOCKED",
    notProductFail: true,
  },
  notRun: {
    product: "Neither PASS nor FAIL",
    qa: "NOT_RUN",
    notProductFail: true,
  },
  notObserved: {
    product: "No failure evidence",
    qa: "NOT_OBSERVED",
    notEqualFailed: true,
  },
  codeFirstBreakYes: {
    requires: "Direct Runtime proof of first product-code discontinuity",
    forbiddenSoleEvidence: [
      "missing_logs_only",
      "url_only",
      "external_ui_stuck",
      "automation_failure",
      "stale_session_pollution",
      "wrong_audit_endpoint",
      "deploy_sha_mismatch",
    ],
  },
} as const;

/** Modules that must never contain QA classification string literals. */
export const AUTH_QA_CLASSIFICATION_FORBIDDEN_PRODUCT_MODULES = [
  "lib/auth/oauth/auth-lifecycle-trace.ts",
  "lib/auth/dibay-session-policy.ts",
  "lib/auth/dibay-session-manager.ts",
  "lib/auth/finish-client-auth-login.client.ts",
  "lib/auth/completion/run-common-auth-client-completion.client.ts",
  "lib/auth/completion/types.ts",
  "lib/auth/completion/ensure-auth-profile-for-login.server.ts",
  "lib/auth/completion/resolve-common-auth-destination.server.ts",
  "lib/auth/completion/sync-common-client-session.client.ts",
  "lib/auth/completion/build-native-auth-completion-handoff.client.ts",
] as const;

/** Allowed locations for QA classification token references. */
export const AUTH_QA_CLASSIFICATION_ALLOWED_PATH_PREFIXES = [
  "lib/auth/state/",
  "lib/auth/", // only __tests__ and state — enforced by verify (tests / *contract*)
  ".qa-logs/",
  "docs/",
  "scripts/verify-",
] as const;
