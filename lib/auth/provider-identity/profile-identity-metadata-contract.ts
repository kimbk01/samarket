/**
 * Kakao / social identity metadata contract (PARTIAL_RECONSTRUCTION).
 *
 * SSOT decision (Owner Phase 1):
 *   B) `user_auth_identities` is the sole social identity authority.
 *      `profiles.provider` / `profiles.auth_provider` / `profiles.provider_user_id`
 *      are compatibility / display metadata that MUST mirror the SSOT when known,
 *      but MUST NOT be used as the primary login resolver when an identity row exists.
 *
 * Forbidden:
 *   - Writing `profiles.provider_user_id = profiles.id` (auth UUID) for social providers
 *   - Treating synthetic native email as Kakao identity authority
 *   - Email-first / nickname-first social account merge
 */

export const SOCIAL_IDENTITY_SSOT_TABLE = "user_auth_identities" as const;

export const PROFILE_IDENTITY_COLUMNS = [
  "provider",
  "auth_provider",
  "provider_user_id",
] as const;

export type ProfileIdentityColumnRole =
  | "IDENTITY_AUTHORITY"
  | "DISPLAY_METADATA"
  | "LEGACY_FALLBACK"
  | "COMPATIBILITY"
  | "WRONG_AUTHORITY"
  | "DEAD";

export const PROFILE_IDENTITY_COLUMN_ROLES: Record<
  (typeof PROFILE_IDENTITY_COLUMNS)[number],
  ProfileIdentityColumnRole
> = {
  provider: "COMPATIBILITY",
  auth_provider: "COMPATIBILITY",
  provider_user_id: "COMPATIBILITY",
};

export const USER_AUTH_IDENTITY_COLUMN_ROLES = {
  provider: "IDENTITY_AUTHORITY" as const,
  provider_user_id: "IDENTITY_AUTHORITY" as const,
  user_id: "IDENTITY_AUTHORITY" as const,
  email: "DISPLAY_METADATA" as const,
};

/** Never treat auth.users.id as a social provider_user_id. */
export function isForbiddenSocialProviderUserId(
  providerUserId: string | null | undefined,
  authUserId: string | null | undefined,
): boolean {
  const puid = String(providerUserId ?? "").trim();
  const uid = String(authUserId ?? "").trim();
  if (!puid || !uid) return false;
  return puid === uid;
}
