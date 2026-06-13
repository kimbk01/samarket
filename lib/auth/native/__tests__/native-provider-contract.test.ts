import { describe, expect, it } from "vitest";
import {
  deriveNativeExchangeGateFlags,
  isNativeSdkImplementedProvider,
  normalizeNativeExchangeProvider,
  shouldBlockLegacyOAuthOnNativeApp,
} from "@/lib/auth/native/native-provider-contract";

describe("native-provider-contract", () => {
  it("normalizes native exchange providers", () => {
    expect(normalizeNativeExchangeProvider("KAKAO")).toBe("kakao");
    expect(normalizeNativeExchangeProvider("naver")).toBeNull();
  });

  it("marks kakao, apple, and google as SDK implemented", () => {
    expect(isNativeSdkImplementedProvider("kakao")).toBe(true);
    expect(isNativeSdkImplementedProvider("apple")).toBe(true);
    expect(isNativeSdkImplementedProvider("google")).toBe(true);
    expect(isNativeSdkImplementedProvider("facebook")).toBe(false);
  });

  it("derives onboarding gate flags", () => {
    expect(
      deriveNativeExchangeGateFlags({
        consentComplete: false,
        dibayIdComplete: false,
        profileComplete: false,
        signupComplete: false,
      }),
    ).toEqual({
      needsTermsAgreement: true,
      needsProfileCompletion: false,
    });

    expect(
      deriveNativeExchangeGateFlags({
        consentComplete: true,
        dibayIdComplete: false,
        profileComplete: false,
        signupComplete: false,
      }),
    ).toEqual({
      needsTermsAgreement: false,
      needsProfileCompletion: true,
    });
  });

  it("blocks legacy OAuth on native app for major providers except naver", () => {
    expect(shouldBlockLegacyOAuthOnNativeApp("google", true)).toBe(true);
    expect(shouldBlockLegacyOAuthOnNativeApp("facebook", true)).toBe(true);
    expect(shouldBlockLegacyOAuthOnNativeApp("kakao", true)).toBe(true);
    expect(shouldBlockLegacyOAuthOnNativeApp("naver", true)).toBe(false);
    expect(shouldBlockLegacyOAuthOnNativeApp("google", false)).toBe(false);
  });
});
