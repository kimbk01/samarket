import { describe, expect, it } from "vitest";
import {
  isRegistrationComplete,
  isRegistrationStepPath,
  nextRegistrationStep,
  registrationStepHref,
} from "@/lib/auth/dibay-registration-steps";
import { resolveImmediateLoginTarget } from "@/lib/auth/finish-client-auth-login.client";
import {
  isRegistrationGateOnlyExcludedPath,
  resolveProfileSetupGateAction,
} from "@/lib/auth/profile-setup-flow";
import { isDibaySignupGateExcludedPath } from "@/lib/auth/dibay-signup-status";
import { resolveMemberRegistrationClassForApiMutation } from "@/lib/auth/member-registration-mutation-policy";

/** 가입 = 동의 + 전화 인증 + 대표 주소 (Owner 2026-11-20 「승인, 구현 진행」, 설계 v3) */
describe("nextRegistrationStep — 순서 동의 → 전화 → 주소", () => {
  const all = { consentComplete: true, phoneVerified: true, addressComplete: true };
  it.each([
    [{ ...all, consentComplete: false, phoneVerified: false, addressComplete: false }, "terms"],
    [{ ...all, phoneVerified: false, addressComplete: false }, "phone"],
    [{ ...all, addressComplete: false }, "address"],
    [{ ...all, consentComplete: false }, "terms"],
    [all, null],
  ] as const)("%o → %s", (facts, step) => {
    expect(nextRegistrationStep(facts)).toBe(step);
    expect(isRegistrationComplete(facts)).toBe(step === null);
  });

  it("특권 관리자는 전부 면제", () => {
    expect(nextRegistrationStep({ consentComplete: false, phoneVerified: false, addressComplete: false, isPrivilegedAdmin: true })).toBeNull();
  });

  it("단계 화면 경로", () => {
    expect(registrationStepHref("phone", "/market")).toBe("/auth/onboarding/phone?next=%2Fmarket");
    expect(registrationStepHref("address", null)).toBe("/auth/onboarding/address");
    expect(registrationStepHref(null, "/market")).toBeNull();
    expect(isRegistrationStepPath("/auth/onboarding/phone?next=%2F")).toBe(true);
    expect(isRegistrationStepPath("/auth/onboarding/terms")).toBe(true);
    expect(isRegistrationStepPath("/mypage")).toBe(false);
  });
});

describe("아이디 로그인 목적지 — 가입 단계 route 사용", () => {
  it("동의 미완이면 동의 화면이 우선", () => {
    expect(
      resolveImmediateLoginTarget({ consentComplete: false, registrationRoute: "/auth/onboarding/phone", next: "/market" }),
    ).toBe("/auth/onboarding/terms?next=%2Fmarket");
  });
  it("가입 단계 route 면 그곳으로", () => {
    expect(
      resolveImmediateLoginTarget({ consentComplete: true, registrationRoute: "/auth/onboarding/address?next=%2Fmarket", next: "/market" }),
    ).toBe("/auth/onboarding/address?next=%2Fmarket");
  });
  it("네이티브·QR 서버 목적지(redirectTo)가 가입 단계면 그곳으로 (fresh-landing 검증이 /auth 를 지우지 않게)", () => {
    expect(
      resolveImmediateLoginTarget({ consentComplete: true, redirectTo: "/auth/onboarding/phone?next=%2Fphilife", next: "/philife" }),
    ).toBe("/auth/onboarding/phone?next=%2Fphilife");
    expect(resolveImmediateLoginTarget({ consentComplete: true, redirectTo: "/philife", next: null })).toBe("/philife");
  });
  it("가입 단계가 아닌 route 는 무시", () => {
    expect(resolveImmediateLoginTarget({ consentComplete: true, registrationRoute: "/admin", next: "/market" })).toBe("/market");
  });
});

describe("세션당 1회 가입 안내 — 열람을 막지 않는다", () => {
  it("통화 화면·가입 단계 화면은 안내하지 않는다 (받은 통화를 덮지 않음)", () => {
    for (const p of [
      "/community-messenger/calls/abc",
      "/community-messenger/calls-v3/abc",
      "/community-messenger/calls-v4/abc",
      "/auth/onboarding/phone",
    ]) {
      expect(isRegistrationGateOnlyExcludedPath(p), p).toBe(true);
      expect(resolveProfileSetupGateAction({ needsBlock: true, deferredForSession: false, pathname: p })).toBe("none");
    }
  });
  it("1회 안내 뒤에는 이동 없음", () => {
    expect(resolveProfileSetupGateAction({ needsBlock: true, deferredForSession: true, pathname: "/market" })).toBe("none");
    expect(resolveProfileSetupGateAction({ needsBlock: true, deferredForSession: false, pathname: "/market" })).toBe("redirect");
  });
  it("동의 게이트 제외 경로는 바꾸지 않는다 (통화 화면 미포함)", () => {
    expect(isDibaySignupGateExcludedPath("/community-messenger/calls/abc")).toBe(false);
  });
});

describe("중앙 쓰기 게이트 — 가입 검사 예외", () => {
  it.each([
    ["POST", "/api/community-messenger/rooms/r1/calls"],
    ["POST", "/api/community-messenger/calls/redial-room"],
    ["PATCH", "/api/me/stores/s1/products/p1"],
    ["PATCH", "/api/me/stores/s1"],
    ["POST", "/api/me/apple-iap/verify"],
    // 재감사 H1 · L4 · M4 · M5 · L3
    ["PATCH", "/api/community-messenger/rooms/r1"],
    // 설계 2026-11-21 §4 C — 1:1 방 만들기는 전화 인증만(통화 걸기), 그룹 만들기는 라우트 안에서 가입 확인
    ["POST", "/api/community-messenger/rooms"],
    ["POST", "/api/community-messenger/bridge/product-chat"],
    ["POST", "/api/community-messenger/contacts/sync"],
    ["PATCH", "/api/community-messenger/contacts/sources/s1"],
    ["DELETE", "/api/community-messenger/contacts/sources/s1"],
    ["DELETE", "/api/community-messenger/contacts/consent"],
    ["DELETE", "/api/community-messenger/contacts"],
    ["POST", "/api/me/store-coupons/campaigns"],
    ["PATCH", "/api/me/store-coupons/campaigns"],
    ["POST", "/api/me/delivery-ads/partner"],
    ["POST", "/api/me/delivery-ads/c1/funding"],
    ["PUT", "/api/posts/p1/hide"],
    ["DELETE", "/api/posts/p1/hide"],
  ])("%s %s → 예외", (m, p) => {
    expect(resolveMemberRegistrationClassForApiMutation(m, p)).toBe("REGISTRATION_EXEMPT");
  });
  it.each([
    ["POST", "/api/community/posts"],
    ["POST", "/api/community-messenger/rooms/r1/messages"],
    ["POST", "/api/me/store-orders"],
    ["POST", "/api/me/stores"],
    ["POST", "/api/favorites/toggle"],
    ["POST", "/api/community-messenger/friend-requests"],
    ["POST", "/api/me/apple-iap/prepare"],
  ])("%s %s → 가입 필요", (m, p) => {
    expect(resolveMemberRegistrationClassForApiMutation(m, p)).toBe("REGISTRATION_REQUIRED");
  });
});

describe("재감사 M2 — API 403 signup_incomplete + step → 가입 이어하기 안내", () => {
  it("step 이 있으면 안내를 열고, 동의 미완(step 없음)·다른 코드는 열지 않는다", async () => {
    const { openRegistrationRequiredFromApiPayload } = await import("@/lib/auth/registration-required-client");
    expect(openRegistrationRequiredFromApiPayload({ code: "signup_incomplete", step: "address" }, { next: "/philife" })).toBe(true);
    expect(openRegistrationRequiredFromApiPayload({ error: "signup_incomplete", step: "phone" })).toBe(true);
    expect(openRegistrationRequiredFromApiPayload({ code: "signup_incomplete" })).toBe(false);
    expect(openRegistrationRequiredFromApiPayload({ code: "other", step: "phone" })).toBe(false);
    expect(openRegistrationRequiredFromApiPayload(null)).toBe(false);
  });
});
