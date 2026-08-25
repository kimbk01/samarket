/** Issue window = campaign start_at/end_at. Usage window = entitlement.expires_at. */

export function computeEntitlementExpiresAtIso(input: {
  nowMs: number;
  issueEndAtIso: string;
  usageEndAtIso: string | null;
  claimValidDays: number | null;
}): string {
  const issueEnd = Date.parse(input.issueEndAtIso);
  const usageEnd = input.usageEndAtIso ? Date.parse(input.usageEndAtIso) : NaN;
  let endMs = Number.isFinite(usageEnd) ? usageEnd : issueEnd;
  if (!Number.isFinite(endMs)) endMs = input.nowMs;
  const days = input.claimValidDays;
  if (days != null && Number.isFinite(days) && days > 0) {
    const ttlMs = input.nowMs + Math.floor(days) * 24 * 60 * 60 * 1000;
    endMs = Math.min(endMs, ttlMs);
  }
  return new Date(endMs).toISOString();
}

export function isCouponIssueWindowOpen(input: {
  nowMs: number;
  startAtIso: string;
  endAtIso: string;
}): boolean {
  const start = Date.parse(input.startAtIso);
  const end = Date.parse(input.endAtIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start <= input.nowMs && end > input.nowMs;
}
