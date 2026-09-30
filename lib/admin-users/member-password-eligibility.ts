/**
 * Whether admin temporary-password set is a valid operator action for this Auth user.
 * Do not invent provider enums — inspect actual identity providers / auth presence.
 */

export type MemberPasswordEligibilityInput = {
  authUserPresent: boolean;
  /** Auth identity.provider values (e.g. email, kakao). */
  identityProviders: readonly (string | null | undefined)[];
  /** Profile auth_provider / provider hints when identities are sparse. */
  profileAuthProvider?: string | null;
  profileProvider?: string | null;
};

/**
 * Password management is valid when Auth user exists and has a password-capable identity.
 * Conservative: require `email` identity, or known manual/email profile providers.
 * Social-only (kakao/google/…) without email identity → not supported.
 */
export function resolveMemberPasswordResetSupported(
  input: MemberPasswordEligibilityInput,
): boolean {
  if (!input.authUserPresent) return false;
  const providers = input.identityProviders
    .map((p) => String(p ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (providers.includes("email")) return true;

  const hint = String(input.profileAuthProvider || input.profileProvider || "")
    .trim()
    .toLowerCase();
  if (
    hint === "admin_manual" ||
    hint === "manual" ||
    hint === "email" ||
    hint === "password"
  ) {
    return true;
  }

  // No identities but Auth user present with empty providers — treat as unsupported
  // unless hint already matched above.
  return false;
}
