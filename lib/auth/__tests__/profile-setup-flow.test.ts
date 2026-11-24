import { describe, expect, it } from "vitest";
import { isDibaySignupGateExcludedPath } from "@/lib/auth/dibay-signup-status";
import {
  buildProfileSetupHref,
  isProfileSetupComplete,
  isProfileSetupGateExcludedPath,
  isProfileSetupMode,
  isProfileSetupPending,
} from "@/lib/auth/profile-setup-flow";

describe("profile-setup-flow", () => {
  it("buildProfileSetupHref includes setup=1 and optional next", () => {
    expect(buildProfileSetupHref()).toBe("/mypage/section/account/profile/edit?setup=1");
    expect(buildProfileSetupHref({ next: "/philife" })).toBe(
      "/mypage/section/account/profile/edit?setup=1&next=%2Fphilife",
    );
    expect(buildProfileSetupHref({ next: "https://evil.example" })).toBe(
      "/mypage/section/account/profile/edit?setup=1",
    );
  });

  it("isProfileSetupMode detects setup=1", () => {
    expect(isProfileSetupMode("setup=1")).toBe(true);
    expect(isProfileSetupMode("?setup=1&next=%2Fphilife")).toBe(true);
    expect(isProfileSetupMode(new URLSearchParams("setup=1"))).toBe(true);
    expect(isProfileSetupMode("setup=0")).toBe(false);
    expect(isProfileSetupMode(null)).toBe(false);
  });

  it("isProfileSetupComplete requires address gate and phone", () => {
    expect(isProfileSetupComplete({ needsBlock: false, phoneVerified: true })).toBe(true);
    expect(isProfileSetupComplete({ needsBlock: true, phoneVerified: true })).toBe(false);
    expect(isProfileSetupComplete({ needsBlock: false, phoneVerified: false })).toBe(false);
  });

  it("isProfileSetupPending is inverse of complete", () => {
    expect(isProfileSetupPending({ needsBlock: false, phoneVerified: true })).toBe(false);
    expect(isProfileSetupPending({ needsBlock: true, phoneVerified: false })).toBe(true);
  });

  it("isProfileSetupGateExcludedPath covers profile edit and address flows", () => {
    expect(isProfileSetupGateExcludedPath("/mypage/section/account/profile/edit")).toBe(true);
    expect(isProfileSetupGateExcludedPath("/mypage/addresses")).toBe(true);
    expect(isProfileSetupGateExcludedPath("/mypage/addresses/edit")).toBe(true);
    expect(isProfileSetupGateExcludedPath("/address/select")).toBe(true);
    expect(isProfileSetupGateExcludedPath("/onboarding/address")).toBe(true);
    expect(isProfileSetupGateExcludedPath("/philife")).toBe(false);
  });

  it("isDibaySignupGateExcludedPath includes profile setup edit path", () => {
    expect(isDibaySignupGateExcludedPath("/mypage/section/account/profile/edit")).toBe(true);
    expect(isDibaySignupGateExcludedPath("/mypage/section/account")).toBe(false);
  });
});
