/**
 * Slice 7-4 PLAN_I2 — Identity Writer vs Canonical Profile Writer boundary SSOT.
 *
 * DO NOT merge Identity Writers into ensureAuthProfileForLogin.
 * DO NOT treat ensureUserProfile soft fill-missing of provider_* as Identity Writer authority;
 * verified-token Identity Writers remain authoritative after Canonical enrich.
 *
 * Runtime behavior lives in caller modules; this file is ownership contract only.
 */

/** Canonical Login Profile Writer (Slice 6-2 / 7). */
export const CANONICAL_LOGIN_PROFILE_WRITER = "ensureAuthProfileForLogin" as const;

/** Google residual create-if-missing — not Identity, not Canonical soft. */
export const GOOGLE_PROFILE_HARD_GATE = "ensureProfileForUserId" as const;

/**
 * Profiles-table Identity column writers (verified provider credential → provider*).
 * Naver uses an inline profiles.update in its callback — same responsibility class.
 */
export const IDENTITY_COLUMN_WRITERS = [
  "persistGoogleProfileIdentity",
  "persistKakaoProfileIdentity",
  "persistAppleProfileIdentity",
  "naverCallbackProfilesIdentityUpdate",
] as const;

/** user_auth_identities row writers. */
export const AUTH_IDENTITY_ROW_WRITERS = [
  "ensureProviderAuthIdentityRow",
  "persistOAuthProviderIdentity",
] as const;

/** Columns owned by Identity column writers (not Canonical display/seed policy). */
export const IDENTITY_COLUMN_KEYS = [
  "provider",
  "auth_provider",
  "provider_user_id",
  "auth_login_email",
] as const;

/** Columns owned by Canonical pending/enrich (Identity Writers must not set policy). */
export const CANONICAL_PROFILE_POLICY_KEYS = [
  "display_name",
  "username",
  "nickname",
  "avatar_url",
] as const;

export type IdentityWriterI2Boundary = {
  canonical: typeof CANONICAL_LOGIN_PROFILE_WRITER;
  hardGate: typeof GOOGLE_PROFILE_HARD_GATE;
  identityColumns: typeof IDENTITY_COLUMN_WRITERS;
  authIdentityRows: typeof AUTH_IDENTITY_ROW_WRITERS;
};
