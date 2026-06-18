import { describe, expect, it } from "vitest";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";
import type { OnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { STORE_PRIVACY_VERSION, STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";

function baseStatus(overrides: Partial<OnboardingStatus> = {}): OnboardingStatus {
  return {
    profileExists: true,
    usernameComplete: false,
    dibayIdComplete: false,
    nicknameComplete: true,
    consentComplete: false,
    addressComplete: false,
    phoneVerified: false,
    profileComplete: false,
    signupComplete: false,
    isPrivilegedAdmin: false,
    dibayId: null,
    dibayIdLocked: false,
    username: null,
    usernameConfirmed: false,
    termsAcceptedAt: null,
    termsVersion: null,
    privacyAcceptedAt: null,
    privacyVersion: null,
    onboardingCompletedAt: null,
    onboardingStatus: "terms_required",
    displayName: null,
    avatarUrl: null,
    ...overrides,
  };
}

describe("resolvePostLoginRoute", () => {
  it("routes to terms when consent missing", () => {
    expect(
      resolvePostLoginRoute({
        hasSession: true,
        status: baseStatus(),
        next: "/philife",
      })
    ).toBe("/auth/onboarding/terms?next=%2Fphilife");
  });

  it("routes to home after consent — no dibay-id or profile setup gate", () => {
    expect(
      resolvePostLoginRoute({
        hasSession: true,
        status: baseStatus({
          consentComplete: true,
          signupComplete: true,
          termsAcceptedAt: "2026-01-01",
          termsVersion: STORE_TERMS_VERSION,
          privacyAcceptedAt: "2026-01-01",
          privacyVersion: STORE_PRIVACY_VERSION,
          onboardingStatus: "oauth_authenticated",
        }),
        next: "/philife",
      })
    ).toBe("/philife");
  });

  it("defaults to /mypage when next is absent after consent", () => {
    expect(
      resolvePostLoginRoute({
        hasSession: true,
        status: baseStatus({
          consentComplete: true,
          signupComplete: true,
          termsAcceptedAt: "2026-01-01",
          termsVersion: STORE_TERMS_VERSION,
          privacyAcceptedAt: "2026-01-01",
          privacyVersion: STORE_PRIVACY_VERSION,
          onboardingStatus: "oauth_authenticated",
        }),
      })
    ).toBe("/mypage");
  });

  it("does not block on address or phone", () => {
    expect(
      resolvePostLoginRoute({
        hasSession: true,
        status: baseStatus({
          consentComplete: true,
          dibayIdComplete: true,
          usernameComplete: true,
          signupComplete: true,
          dibayId: "boss_market",
          dibayIdLocked: true,
          username: "boss_market",
          usernameConfirmed: true,
          displayName: "Boss Market",
          avatarUrl: "https://img.example/avatar.png",
          termsAcceptedAt: "2026-01-01",
          termsVersion: STORE_TERMS_VERSION,
          privacyAcceptedAt: "2026-01-01",
          privacyVersion: STORE_PRIVACY_VERSION,
          onboardingCompletedAt: "2026-02-01",
          onboardingStatus: "completed",
          addressComplete: false,
          phoneVerified: false,
        }),
        next: "/philife",
      })
    ).toBe("/philife");
  });
});
