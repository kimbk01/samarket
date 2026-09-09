/**
 * Data Reset L2 confirmation — server-side re-auth authority.
 *
 * Inventory (this CUT): no Admin password / step-up / recent-auth SSOT exists
 * for destructive Admin actions. Session SuperAdmin ≠ re-auth.
 *
 * Decision C: L2 execute fail-closed until a real re-auth owner is wired.
 */

export const DATA_RESET_L2_REAUTH = {
  /** No canonical Admin re-auth / step-up mechanism in repo. */
  implemented: false,
  /** Expected contract: password (or equivalent server step-up) + typed phrase. */
  expected: "server_reauth_plus_typed_phrase" as const,
  authorityFile: "lib/admin/data-reset/l2-reauth.ts",
  authorityFunction: "verifyDataResetL2ReauthProof",
  reasonNotImplemented: "SERVER_REAUTH_NOT_IMPLEMENTED",
  /** Session presence / requireSuperAdmin alone is NOT re-auth. */
  sessionIsNotReauth: true,
} as const;

/**
 * Server VERIFY for confirmationLevel === 2.
 * Always fails while `implemented === false` — do not invent a password path here.
 */
export function verifyDataResetL2ReauthProof(input: {
  actorUserId: string;
  /** Reserved for future password/step-up proof — never logged. */
  reauthProof?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  void input.actorUserId;
  void input.reauthProof;
  if (!DATA_RESET_L2_REAUTH.implemented) {
    return { ok: false, reason: DATA_RESET_L2_REAUTH.reasonNotImplemented };
  }
  return { ok: false, reason: "L2_REAUTH_VERIFIER_UNREACHABLE" };
}
