import { describe, expect, it, vi } from "vitest";
import {
  ensureClientAccessOrRedirect,
  resolveClientSignupGateHref,
} from "@/lib/auth/client-access-flow";
import type { Profile } from "@/lib/types/profile";
import { STORE_PRIVACY_VERSION, STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";

vi.mock("@/lib/auth/require-auth-action", () => ({
  openLoginRequiredSheet: vi.fn(),
}));

vi.mock("@/lib/auth/phone-verification-gate-client", () => ({
  openPhoneVerificationRequiredDialog: vi.fn(),
}));

const consented = {
  terms_accepted_at: "2026-01-01T00:00:00.000Z",
  terms_version: STORE_TERMS_VERSION,
  privacy_accepted_at: "2026-01-01T00:00:00.000Z",
  privacy_version: STORE_PRIVACY_VERSION,
};

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
    email: "u1@test.local",
    nickname: "nick",
    avatar_url: null,
    temperature: 50,
    phone_verified: true,
    phone_verified_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("client-access-flow signup gate", () => {
  it("routes incomplete consent user to terms onboarding", () => {
    const href = resolveClientSignupGateHref(baseProfile(), "/philife");
    expect(href.startsWith("/auth/onboarding/terms")).toBe(true);
  });

  it("routes profile-incomplete user to profile setup", () => {
    const href = resolveClientSignupGateHref(
      baseProfile({
        ...consented,
        dibay_id: "boss_market",
        dibay_id_locked: true,
        display_name: "Boss",
      }),
      "/philife"
    );
    expect(href).toContain("/mypage/section/account/profile/edit");
    expect(href).toContain("setup=1");
  });

  it("redirects incomplete user via router.replace", () => {
    const replace = vi.fn();
    const ok = ensureClientAccessOrRedirect({ push: vi.fn(), replace }, baseProfile(), "/philife");
    expect(ok).toBe(false);
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("/auth/onboarding/terms"));
  });
});
