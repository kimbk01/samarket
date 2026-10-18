/**
 * Required legal consent versions — CMS published (ko) with STORE_* fallback.
 * CONTRACT: app_legal_documents TEXT is public SSOT; consent gate versions follow
 * published ko `version` strings. Same-version body edits do not change consent.
 * DO NOT invent versions; DO NOT treat dibay-privacy-policy-content as consent SSOT.
 *
 * STORE_* fallback applies only when no published ko row exists. A failed CMS read is NOT
 * "no row": it keeps the last successfully read value, and strict callers fail closed.
 */
import { loadPublishedAppLegalDocumentResult } from "@/lib/legal/load-published-legal-document";
import { STORE_PRIVACY_VERSION, STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";

export type RequiredConsentVersions = {
  termsVersion: string;
  privacyVersion: string;
  source: "cms" | "fallback";
};

const CACHE_TTL_MS = 30_000;
let cache: { at: number; value: RequiredConsentVersions } | null = null;
/** Last successfully read value — survives TTL; used only when a fresh read fails. */
let lastGood: RequiredConsentVersions | null = null;

export class RequiredConsentVersionsUnavailableError extends Error {
  constructor() {
    super("required_consent_versions_unavailable");
    this.name = "RequiredConsentVersionsUnavailableError";
  }
}

export function clearRequiredConsentVersionsCache(): void {
  cache = null;
}

/** Test helper — also forgets the last good read. */
export function resetRequiredConsentVersionsStateForTests(): void {
  cache = null;
  lastGood = null;
}

export function getFallbackRequiredConsentVersions(): RequiredConsentVersions {
  return {
    termsVersion: STORE_TERMS_VERSION,
    privacyVersion: STORE_PRIVACY_VERSION,
    source: "fallback",
  };
}

async function readRequiredConsentVersions(): Promise<RequiredConsentVersions | null> {
  const [terms, privacy] = await Promise.all([
    loadPublishedAppLegalDocumentResult("terms", "ko"),
    loadPublishedAppLegalDocumentResult("privacy", "ko"),
  ]);
  if (!terms.ok || !privacy.ok) return null;
  const cmsTerms = String(terms.row?.version ?? "").trim();
  const cmsPrivacy = String(privacy.row?.version ?? "").trim();
  return {
    termsVersion: cmsTerms || STORE_TERMS_VERSION,
    privacyVersion: cmsPrivacy || STORE_PRIVACY_VERSION,
    source: cmsTerms && cmsPrivacy ? "cms" : "fallback",
  };
}

/**
 * Strict — throws `RequiredConsentVersionsUnavailableError` when the CMS cannot be read and no
 * value was ever read in this process. Use where a wrong answer would grant access.
 */
export async function resolveRequiredConsentVersionsStrict(): Promise<RequiredConsentVersions> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;

  let value: RequiredConsentVersions | null = null;
  try {
    value = await readRequiredConsentVersions();
  } catch {
    value = null;
  }
  if (value) {
    cache = { at: now, value };
    lastGood = value;
    return value;
  }
  if (lastGood) return lastGood;
  throw new RequiredConsentVersionsUnavailableError();
}

/**
 * Lenient — same as strict, but when nothing was ever read it returns the STORE_* fallback
 * (pre-existing behavior for display / redirect surfaces that must not 500).
 */
export async function resolveRequiredConsentVersions(): Promise<RequiredConsentVersions> {
  try {
    return await resolveRequiredConsentVersionsStrict();
  } catch {
    return getFallbackRequiredConsentVersions();
  }
}
