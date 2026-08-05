/**
 * Slice 7-5 — Google login Profile Hard Gate ownership SSOT.
 *
 * Symbol: ensureProfileForUserId
 * Role: final profiles-row existence gate after Canonical + Identity writers.
 *
 * DO NOT remove. DO NOT merge into ensureAuthProfileForLogin.
 * DO NOT soften Google login null → soft swallow / forced /mypage success.
 */

export const GOOGLE_LOGIN_PROFILE_HARD_GATE = "ensureProfileForUserId" as const;

export const GOOGLE_LOGIN_PROFILE_HARD_GATE_ERROR = {
  errorCode: "profile_ensure_failed",
  status: 500,
} as const;

export const GOOGLE_LOGIN_PROFILE_HARD_GATE_SEMANTICS = {
  exists: "noop_return_existing",
  missing: "create_if_missing",
  finalNull: "hard_fail_block_destination",
} as const;
