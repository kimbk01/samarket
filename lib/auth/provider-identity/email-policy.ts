import { isDibaySyntheticAuthEmail } from "@/lib/auth/synthetic-auth-email";

const APPLE_PRIVATE_RELAY_SUFFIX = "@privaterelay.appleid.com";
const OAUTH_LANDING_SUFFIX = "@oauth-landing.dibay.internal";

/** QA / local / invalid Auth bridge domains — not contact credentials. */
const INTERNAL_OR_QA_EMAIL_SUFFIXES = [
  OAUTH_LANDING_SUFFIX,
  "@samarket.local",
  "@dibay.local",
  "@dibay.qa.local",
  "@qa.dibay.invalid",
] as const;

export function normalizeProviderEmail(email: string | null | undefined): string | null {
  const trimmed = String(email ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isApplePrivateRelayEmail(email: string | null | undefined): boolean {
  const normalized = normalizeProviderEmail(email);
  return normalized != null && normalized.endsWith(APPLE_PRIVATE_RELAY_SUFFIX);
}

/** Social identity email conflict (user_auth_identities) — Apple relay excluded. */
export function isEmailEligibleForConflictMatch(email: string | null | undefined): boolean {
  const normalized = normalizeProviderEmail(email);
  if (!normalized) return false;
  return !isApplePrivateRelayEmail(normalized);
}

/**
 * Package D — password-member Auth-email match eligibility.
 * Synthetic / internal / QA / Apple private relay must never enter the gate.
 */
export function isDibayInternalOrQaAuthEmail(email: string | null | undefined): boolean {
  const normalized = normalizeProviderEmail(email);
  if (!normalized) return false;
  if (isDibaySyntheticAuthEmail(normalized)) return true;
  if (INTERNAL_OR_QA_EMAIL_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;
  if (normalized.endsWith(".qa.local")) return true;
  if (normalized.endsWith(".internal")) return true;
  return false;
}

export function isEmailEligibleForPasswordMemberMatch(email: string | null | undefined): boolean {
  const normalized = normalizeProviderEmail(email);
  if (!normalized) return false;
  if (isApplePrivateRelayEmail(normalized)) return false;
  if (isDibayInternalOrQaAuthEmail(normalized)) return false;
  return true;
}

/** Provider-verified signal for Package D only — absent/ambiguous → false. */
export function readProviderEmailVerifiedSignal(value: unknown): boolean {
  if (value === true || value === "true") return true;
  return false;
}
