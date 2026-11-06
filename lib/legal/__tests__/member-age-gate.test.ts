import { describe, expect, it, vi } from "vitest";
import {
  ageYearsFromDob,
  evaluateAgeAttestationInput,
  hasAgeGateConsent,
  isAtLeastMinAge,
  parseDateOfBirthInput,
} from "@/lib/legal/member-age-gate";
import { hasRequiredMemberConsents, resolveRequiredConsentGap } from "@/lib/legal/has-required-member-consents";

describe("member age gate", () => {
  it("parses and rejects invalid DOB", () => {
    expect(parseDateOfBirthInput("2010-05-01")).toBe("2010-05-01");
    expect(parseDateOfBirthInput("2010-13-01")).toBeNull();
    expect(parseDateOfBirthInput("not-a-date")).toBeNull();
  });

  it("computes age and min-14", () => {
    const at = new Date(Date.UTC(2026, 10, 5));
    expect(ageYearsFromDob("2012-11-05", at)).toBe(14);
    expect(ageYearsFromDob("2012-11-06", at)).toBe(13);
    expect(isAtLeastMinAge("2012-11-05", 14, at)).toBe(true);
    expect(isAtLeastMinAge("2012-11-06", 14, at)).toBe(false);
  });

  it("evaluateAgeAttestationInput fail-closed", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 5)));
    try {
      expect(evaluateAgeAttestationInput({ attestAge: true, dateOfBirth: "2012-11-06" }).ok).toBe(false);
      expect(evaluateAgeAttestationInput({ attestAge: true, dateOfBirth: "2012-11-05" }).ok).toBe(true);
      const ok = evaluateAgeAttestationInput({ attestAge: true, dateOfBirth: "2000-01-01" });
      expect(ok.ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("required consents need legal + age", () => {
    const required = { termsVersion: "t1", privacyVersion: "p1" };
    const base = {
      terms_accepted_at: "2026-01-01T00:00:00Z",
      terms_version: "t1",
      privacy_accepted_at: "2026-01-01T00:00:00Z",
      privacy_version: "p1",
    };
    expect(hasRequiredMemberConsents(base, required)).toBe(false);
    expect(resolveRequiredConsentGap(base, required)).toBe("age");
    const full = {
      ...base,
      date_of_birth: "2000-01-01",
      age_gate_status: "verified",
      age_attested_at: "2026-01-01T00:00:00Z",
    };
    expect(hasAgeGateConsent(full)).toBe(true);
    expect(hasRequiredMemberConsents(full, required)).toBe(true);
    expect(resolveRequiredConsentGap(full, required)).toBeNull();
  });
});
