import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({ rpc }),
}));

import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import {
  hasRequiredMemberConsents,
  resolveRequiredConsentGap,
} from "@/lib/legal/has-required-member-consents";
import {
  resetRequiredConsentVersionsStateForTests,
  resolveRequiredConsentVersionsStrict,
} from "@/lib/legal/resolve-required-consent-versions";
import {
  getClientRequiredConsentVersions,
  requiredConsentForClient,
  resetClientRequiredConsentVersionsForTests,
  setClientRequiredConsentVersions,
} from "@/lib/legal/client-required-consent";
import { isConsentGateEscapePath, isDibaySignupGateExcludedPath } from "@/lib/auth/dibay-signup-status";

const V1 = "2026-04-store-review";
const V2 = "2026-12-revision";
const AT = new Date("2026-11-05T00:00:00Z");

const consentedV1 = {
  terms_accepted_at: "2026-08-10T00:00:00Z",
  terms_version: V1,
  privacy_accepted_at: "2026-08-10T00:00:00Z",
  privacy_version: V1,
};
const noRecord = {
  terms_accepted_at: null,
  terms_version: null,
  privacy_accepted_at: null,
  privacy_version: null,
};

const onlyV1 = { termsVersion: V1, privacyVersion: V1, acceptedTermsVersions: [V1], acceptedPrivacyVersions: [V1] };
const noticeV2 = { termsVersion: V2, privacyVersion: V1, acceptedTermsVersions: [V2, V1], acceptedPrivacyVersions: [V1] };
const reconsentV2 = { termsVersion: V2, privacyVersion: V1, acceptedTermsVersions: [V2], acceptedPrivacyVersions: [V1] };

describe("member cohorts against the consent gate", () => {
  it("existing member with valid consent (legacy) — no popup today", () => {
    const m = { ...consentedV1, age_gate_legacy: true };
    expect(hasRequiredMemberConsents(m, onlyV1, AT)).toBe(true);
    expect(resolveRequiredConsentGap(m, onlyV1, AT)).toBeNull();
  });

  it("existing member stays valid after a 「notice」 revision — version mismatch alone does not block", () => {
    const m = { ...consentedV1, age_gate_legacy: true };
    expect(hasRequiredMemberConsents(m, noticeV2, AT)).toBe(true);
  });

  it("existing member must agree again after a 「reconsent」 revision — terms only, never age (legacy exception)", () => {
    const m = { ...consentedV1, age_gate_legacy: true };
    expect(hasRequiredMemberConsents(m, reconsentV2, AT)).toBe(false);
    expect(resolveRequiredConsentGap(m, reconsentV2, AT)).toBe("terms_privacy");
  });

  it("existing member without any consent record — popup for terms/privacy only (no age, no fabricated record)", () => {
    const m = { ...noRecord, age_gate_legacy: true };
    expect(hasRequiredMemberConsents(m, onlyV1, AT)).toBe(false);
    expect(resolveRequiredConsentGap(m, onlyV1, AT)).toBe("terms_privacy");
  });

  it("new member — terms, privacy and 14+ age all required", () => {
    const m = { ...noRecord, age_gate_legacy: false };
    expect(resolveRequiredConsentGap(m, onlyV1, AT)).toBe("terms_privacy_and_age");
    const terms = { ...consentedV1, age_gate_legacy: false };
    expect(resolveRequiredConsentGap(terms, onlyV1, AT)).toBe("age");
  });

  it("new member with required consents complete — marketing is not part of the gate", () => {
    const m = {
      ...consentedV1,
      age_gate_legacy: false,
      age_gate_status: "verified",
      date_of_birth: "2000-01-01",
      age_attested_at: "2026-11-05T00:00:00Z",
    };
    expect(hasRequiredMemberConsents(m, onlyV1, AT)).toBe(true);
  });

  it("new member under 14 is not consent-complete", () => {
    const m = {
      ...consentedV1,
      age_gate_legacy: false,
      age_gate_status: "verified",
      date_of_birth: "2015-01-01",
      age_attested_at: "2026-11-05T00:00:00Z",
    };
    expect(hasRequiredMemberConsents(m, onlyV1, AT)).toBe(false);
  });
});

describe("hasStoreTermsConsent accepted versions", () => {
  it("without lists only the current version is valid (pre-migration behavior)", () => {
    expect(hasStoreTermsConsent(consentedV1, { termsVersion: V2, privacyVersion: V1 })).toBe(false);
    expect(hasStoreTermsConsent(consentedV1, { termsVersion: V1, privacyVersion: V1 })).toBe(true);
  });

  it("accepted_at is still required", () => {
    expect(hasStoreTermsConsent({ ...consentedV1, terms_accepted_at: null }, noticeV2)).toBe(false);
  });

  it("an unknown version is not valid even with lists", () => {
    expect(hasStoreTermsConsent({ ...consentedV1, terms_version: "forged" }, noticeV2)).toBe(false);
  });
});

describe("resolveRequiredConsentVersionsStrict reads accepted lists from the RPC", () => {
  beforeEach(() => {
    rpc.mockReset();
    resetRequiredConsentVersionsStateForTests();
  });

  it("passes the lists through", async () => {
    rpc.mockResolvedValue({
      data: { terms: V2, privacy: V1, terms_accepted: [V2, V1], privacy_accepted: [V1] },
      error: null,
    });
    const v = await resolveRequiredConsentVersionsStrict();
    expect(v).toMatchObject({ termsVersion: V2, privacyVersion: V1, source: "cms" });
    expect(v.acceptedTermsVersions).toEqual([V2, V1]);
    expect(requiredConsentForClient(v)).toEqual({
      termsVersion: V2,
      privacyVersion: V1,
      acceptedTermsVersions: [V2, V1],
      acceptedPrivacyVersions: [V1],
    });
  });

  it("pre-migration RPC (no lists) keeps current-only behavior", async () => {
    rpc.mockResolvedValue({ data: { terms: V1, privacy: V1 }, error: null });
    const v = await resolveRequiredConsentVersionsStrict();
    expect(v.acceptedTermsVersions).toBeUndefined();
    expect(hasStoreTermsConsent(consentedV1, v)).toBe(true);
  });

  it("a list that does not contain the current version is ignored (fail closed)", async () => {
    rpc.mockResolvedValue({
      data: { terms: V2, privacy: V1, terms_accepted: [V1], privacy_accepted: [V1] },
      error: null,
    });
    const v = await resolveRequiredConsentVersionsStrict();
    expect(v.acceptedTermsVersions).toBeUndefined();
    expect(hasStoreTermsConsent(consentedV1, v)).toBe(false);
  });
});

describe("client copy keeps accepted lists", () => {
  beforeEach(() => resetClientRequiredConsentVersionsForTests());

  it("stores lists and reports a list-only change", () => {
    setClientRequiredConsentVersions({ termsVersion: V1, privacyVersion: V1 });
    expect(setClientRequiredConsentVersions(noticeV2)).toBe(true);
    expect(getClientRequiredConsentVersions()?.acceptedTermsVersions).toEqual([V2, V1]);
    expect(hasStoreTermsConsent(consentedV1, getClientRequiredConsentVersions())).toBe(true);
    expect(setClientRequiredConsentVersions(noticeV2)).toBe(false);
  });
});

describe("pages reachable without consent", () => {
  it("customer center and account leave are excluded from the signup/consent redirects", () => {
    for (const p of ["/mypage/customer-center", "/mypage/customer-center/notice", "/mypage/section/settings/leave"]) {
      expect(isConsentGateEscapePath(p), p).toBe(true);
      expect(isDibaySignupGateExcludedPath(p), p).toBe(true);
    }
    for (const p of ["/mypage", "/mypage/section/settings", "/philife"]) {
      expect(isConsentGateEscapePath(p), p).toBe(false);
    }
  });
});
