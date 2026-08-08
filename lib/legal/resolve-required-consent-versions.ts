/**
 * Required legal consent versions — CMS published (ko) with STORE_* fallback.
 * CONTRACT: app_legal_documents TEXT is public SSOT; consent gate versions follow
 * published ko `version` strings. Same-version body edits do not change consent.
 * DO NOT invent versions; DO NOT treat dibay-privacy-policy-content as consent SSOT.
 */
import { loadPublishedAppLegalDocument } from "@/lib/legal/load-published-legal-document";
import { STORE_PRIVACY_VERSION, STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";

export type RequiredConsentVersions = {
  termsVersion: string;
  privacyVersion: string;
  source: "cms" | "fallback";
};

const CACHE_TTL_MS = 30_000;
let cache: { at: number; value: RequiredConsentVersions } | null = null;

export function clearRequiredConsentVersionsCache(): void {
  cache = null;
}

export function getFallbackRequiredConsentVersions(): RequiredConsentVersions {
  return {
    termsVersion: STORE_TERMS_VERSION,
    privacyVersion: STORE_PRIVACY_VERSION,
    source: "fallback",
  };
}

export async function resolveRequiredConsentVersions(): Promise<RequiredConsentVersions> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;

  try {
    const [terms, privacy] = await Promise.all([
      loadPublishedAppLegalDocument("terms", "ko"),
      loadPublishedAppLegalDocument("privacy", "ko"),
    ]);
    const termsVersion = String(terms?.version ?? "").trim() || STORE_TERMS_VERSION;
    const privacyVersion = String(privacy?.version ?? "").trim() || STORE_PRIVACY_VERSION;
    const source: "cms" | "fallback" =
      String(terms?.version ?? "").trim() && String(privacy?.version ?? "").trim() ? "cms" : "fallback";
    const value: RequiredConsentVersions = { termsVersion, privacyVersion, source };
    cache = { at: now, value };
    return value;
  } catch {
    const value = getFallbackRequiredConsentVersions();
    cache = { at: now, value };
    return value;
  }
}
