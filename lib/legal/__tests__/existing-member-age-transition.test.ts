import { describe, expect, it } from "vitest";
import { deriveDibaySignupStatus } from "@/lib/auth/dibay-signup-status";
import { hasRequiredMemberConsents, resolveRequiredConsentGap } from "@/lib/legal/has-required-member-consents";

const REQUIRED = { termsVersion: "t1", privacyVersion: "p1" };
const LEGAL_OK = {
  terms_accepted_at: "2026-10-01T00:00:00Z",
  terms_version: "t1",
  privacy_accepted_at: "2026-10-01T00:00:00Z",
  privacy_version: "p1",
};

describe("pre-policy members (fixed id set) — age gate exempt", () => {
  it("legacy member with no age record passes the write gate", () => {
    const legacy = { ...LEGAL_OK, age_gate_legacy: true };
    expect(hasRequiredMemberConsents(legacy, REQUIRED)).toBe(true);
    expect(resolveRequiredConsentGap(legacy, REQUIRED)).toBeNull();
  });

  it("legacy member with outdated terms gets a terms-only gap (never an age gap)", () => {
    const legacy = { ...LEGAL_OK, terms_version: "t0", age_gate_legacy: true };
    expect(resolveRequiredConsentGap(legacy, REQUIRED)).toBe("terms_privacy");
  });

  it("access gate stays terms-only for everyone (no proxy redirect loop)", () => {
    const s = deriveDibaySignupStatus({ id: "u1", ...LEGAL_OK, onboarding_status: null }, { requiredConsent: REQUIRED });
    expect(s.consentComplete).toBe(true);
    expect(s.signupComplete).toBe(true);
  });
});

describe("post-policy members — age required", () => {
  it("NULL DOB alone is not an exemption: non-legacy member without age is blocked", () => {
    expect(hasRequiredMemberConsents({ ...LEGAL_OK, age_gate_legacy: false }, REQUIRED)).toBe(false);
    expect(resolveRequiredConsentGap({ ...LEGAL_OK, age_gate_legacy: false }, REQUIRED)).toBe("age");
    // Missing flag (server did not report) is not legacy either.
    expect(hasRequiredMemberConsents(LEGAL_OK, REQUIRED)).toBe(false);
  });

  it("verified member passes", () => {
    const verified = {
      ...LEGAL_OK,
      age_gate_legacy: false,
      date_of_birth: "1990-01-01",
      age_gate_status: "verified",
      age_attested_at: "2026-11-05T00:00:00Z",
    };
    expect(hasRequiredMemberConsents(verified, REQUIRED)).toBe(true);
  });

  it("new member without terms needs both", () => {
    expect(resolveRequiredConsentGap({ age_gate_legacy: false }, REQUIRED)).toBe("terms_privacy_and_age");
    expect(deriveDibaySignupStatus({ id: "u2" }, { requiredConsent: REQUIRED }).consentComplete).toBe(false);
  });
});

describe("under-14 status", () => {
  it("a blocked status never passes the age gate", () => {
    expect(
      hasRequiredMemberConsents(
        { ...LEGAL_OK, age_gate_legacy: false, age_gate_status: "blocked_underage", age_attested_at: "2026-11-05T00:00:00Z" },
        REQUIRED,
      ),
    ).toBe(false);
  });
});
