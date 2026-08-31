/**
 * UI-2 — Admin first-party create step SSOT.
 */

export type AdminDeliveryAdFirstPartyStep = 1 | 2 | 3 | 4;

export function parseAdminDeliveryAdFirstPartyStep(
  raw: string | null | undefined
): AdminDeliveryAdFirstPartyStep {
  const n = Number(String(raw ?? "").trim());
  if (n === 2 || n === 3 || n === 4) return n;
  return 1;
}
