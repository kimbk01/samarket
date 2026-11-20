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
    registrationComplete: false,
    registrationNextStep: null,
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

describe("resolvePostLoginRoute — 가입 단계 (동의 → 전화 → 주소, Owner 2026-11-20)", () => {
  const consented = {
    consentComplete: true,
    signupComplete: true,
    termsAcceptedAt: "2026-01-01",
    termsVersion: STORE_TERMS_VERSION,
    privacyAcceptedAt: "2026-01-01",
    privacyVersion: STORE_PRIVACY_VERSION,
    onboardingStatus: "completed" as const,
  };

  it("동의 미완이면 전화·주소가 없어도 동의 화면이 먼저", () => {
    expect(
      resolvePostLoginRoute({ hasSession: true, status: baseStatus({ registrationNextStep: "terms" }), next: "/philife" }),
    ).toBe("/auth/onboarding/terms?next=%2Fphilife");
  });

  it("동의 완료 + 전화 미인증 → 전화 단계", () => {
    expect(
      resolvePostLoginRoute({
        hasSession: true,
        status: baseStatus({ ...consented, registrationNextStep: "phone" }),
        next: "/philife",
      }),
    ).toBe("/auth/onboarding/phone?next=%2Fphilife");
  });

  it("동의·전화 완료 + 대표 주소 없음 → 주소 단계", () => {
    expect(
      resolvePostLoginRoute({
        hasSession: true,
        status: baseStatus({ ...consented, phoneVerified: true, registrationNextStep: "address" }),
        next: "/market",
      }),
    ).toBe("/auth/onboarding/address?next=%2Fmarket");
  });

  it("가입 완료 → next", () => {
    expect(
      resolvePostLoginRoute({
        hasSession: true,
        status: baseStatus({
          ...consented,
          phoneVerified: true,
          addressComplete: true,
          registrationComplete: true,
          registrationNextStep: null,
        }),
        next: "/market",
      }),
    ).toBe("/market");
  });

  it("로그인 직후 계정 묶인 딥링크(채팅방)는 단계 화면 next 로 넘기지 않는다", () => {
    const route = resolvePostLoginRoute({
      hasSession: true,
      status: baseStatus({ ...consented, registrationNextStep: "phone" }),
      next: "/community-messenger/rooms/r1",
    });
    expect(route).toBe("/auth/onboarding/phone");
  });
});
