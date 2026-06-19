/**
 * Login mount — explicit logout landing must not treat stale Supabase session as fresh login.
 * URL `reason=logout` is stripped after notice; ref guard covers the post-replace re-run.
 */
export function shouldAutoRestoreLoginSessionOnMount(
  loginReason: string | null | undefined,
  blockedFromLogoutLanding: boolean
): boolean {
  if (blockedFromLogoutLanding) return false;
  return (loginReason?.trim() ?? "") !== "logout";
}
