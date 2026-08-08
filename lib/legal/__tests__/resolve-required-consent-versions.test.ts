import { describe, expect, it } from "vitest";
import { hasStoreTermsConsent, STORE_PRIVACY_VERSION, STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";
import { getFallbackRequiredConsentVersions } from "@/lib/legal/resolve-required-consent-versions";

describe("resolve-required-consent-versions", () => {
  it("fallback matches STORE_* constants", () => {
    const fb = getFallbackRequiredConsentVersions();
    expect(fb.termsVersion).toBe(STORE_TERMS_VERSION);
    expect(fb.privacyVersion).toBe(STORE_PRIVACY_VERSION);
    expect(fb.source).toBe("fallback");
  });

  it("hasStoreTermsConsent uses injected required versions for re-consent", () => {
    const profile = {
      terms_accepted_at: "2026-04-01T00:00:00Z",
      terms_version: STORE_TERMS_VERSION,
      privacy_accepted_at: "2026-04-01T00:00:00Z",
      privacy_version: STORE_PRIVACY_VERSION,
    };
    expect(hasStoreTermsConsent(profile)).toBe(true);
    expect(
      hasStoreTermsConsent(profile, {
        termsVersion: STORE_TERMS_VERSION,
        privacyVersion: "2026-09-01-new",
      }),
    ).toBe(false);
    expect(
      hasStoreTermsConsent(
        { ...profile, privacy_version: "2026-09-01-new" },
        { termsVersion: STORE_TERMS_VERSION, privacyVersion: "2026-09-01-new" },
      ),
    ).toBe(true);
  });
});
