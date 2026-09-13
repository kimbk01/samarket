/**
 * Owner gate: real-source Production E2E is blocked until Owner supplies
 * allowed URL + source-level rights basis.
 * Fixture PASS must not be promoted to FINAL ACCEPTANCE.
 */

export const EXTERNAL_BOARD_OWNER_E2E_GATE = {
  status: "BLOCKED" as const,
  reason: "OWNER_URL_AND_RIGHTS_REQUIRED",
  fixtureIsFinalAcceptance: false,
  clockReopenAllowed: false,
};

export function isRealSourceE2EAllowed(input: {
  ownerAllowedUrl?: string | null;
  ownerRightsBasis?: string | null;
}): boolean {
  return Boolean(String(input.ownerAllowedUrl ?? "").trim() && String(input.ownerRightsBasis ?? "").trim());
}
