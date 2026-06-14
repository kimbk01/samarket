const APPLE_PRIVATE_RELAY_SUFFIX = "@privaterelay.appleid.com";

export function normalizeProviderEmail(email: string | null | undefined): string | null {
  const trimmed = String(email ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isApplePrivateRelayEmail(email: string | null | undefined): boolean {
  const normalized = normalizeProviderEmail(email);
  return normalized != null && normalized.endsWith(APPLE_PRIVATE_RELAY_SUFFIX);
}

/** 이메일 충돌 검사에 사용할 수 있는지 (Apple relay 제외). */
export function isEmailEligibleForConflictMatch(email: string | null | undefined): boolean {
  const normalized = normalizeProviderEmail(email);
  if (!normalized) return false;
  return !isApplePrivateRelayEmail(normalized);
}
