import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exchangeNativeProviderToken,
  isNativeTokenExchangeProvider,
  normalizeNativeExchangeProvider,
} from "@/lib/auth/native/native-token-exchange.server";
import { getNativeProviderAdapter } from "@/lib/auth/native/native-provider-adapter.server";

const verifyAppleIdentityToken = vi.fn();
const establishAppleNativeSession = vi.fn();
const verifyKakaoNativeCredential = vi.fn();
const establishKakaoNativeSession = vi.fn();

vi.mock("@/lib/auth/native/apple-token-verify.server", () => ({
  verifyAppleIdentityToken: (...args: unknown[]) => verifyAppleIdentityToken(...args),
  AppleTokenVerifyError: class AppleTokenVerifyError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  mapAppleVerifyErrorToHttp: (error: { code: string; message: string }) => ({
    errorCode: error.code === "malformed_token" ? "malformed_token" : "apple_token_verify_failed",
    status: error.code === "malformed_token" ? 400 : 401,
    message: error.message,
  }),
}));

vi.mock("@/lib/auth/native/apple-native-session.server", () => ({
  establishAppleNativeSession: (...args: unknown[]) => establishAppleNativeSession(...args),
}));

vi.mock("@/lib/auth/native/kakao-token-verify.server", () => ({
  verifyKakaoNativeCredential: (...args: unknown[]) => verifyKakaoNativeCredential(...args),
  KakaoTokenVerifyError: class KakaoTokenVerifyError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  mapKakaoVerifyErrorToHttp: (error: { code: string; message: string }) => ({
    errorCode: error.code === "kakao_token_missing" ? "native_exchange_bad_request" : "native_exchange_verify_failed",
    status: error.code === "kakao_token_missing" ? 400 : 401,
    message: error.message,
  }),
}));

vi.mock("@/lib/auth/native/kakao-native-session.server", () => ({
  establishKakaoNativeSession: (...args: unknown[]) => establishKakaoNativeSession(...args),
}));

describe("native-token-exchange.server", () => {
  beforeEach(() => {
    verifyAppleIdentityToken.mockReset();
    establishAppleNativeSession.mockReset();
    verifyKakaoNativeCredential.mockReset();
    establishKakaoNativeSession.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes apple, kakao, google, facebook providers", () => {
    expect(normalizeNativeExchangeProvider("kakao")).toBe("kakao");
    expect(isNativeTokenExchangeProvider("kakao")).toBe(true);
  });

  it("registers kakao adapter as implemented", () => {
    expect(getNativeProviderAdapter("kakao").stub).toBe(false);
  });

  it("returns 400 when kakao token missing", async () => {
    const result = await exchangeNativeProviderToken({ provider: "kakao" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("native_exchange_bad_request");
      expect(result.status).toBe(400);
    }
  });

  it("returns 401 when kakao verify fails", async () => {
    const { KakaoTokenVerifyError } = await import("@/lib/auth/native/kakao-token-verify.server");
    verifyKakaoNativeCredential.mockRejectedValue(
      new KakaoTokenVerifyError("kakao_token_verify_failed", "invalid token"),
    );
    const result = await exchangeNativeProviderToken({
      provider: "kakao",
      accessToken: "bad-token",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("native_exchange_verify_failed");
      expect(result.status).toBe(401);
    }
  });

  it("returns success with sessionEstablished for kakao when verify and session succeed", async () => {
    verifyKakaoNativeCredential.mockResolvedValue({
      kakaoUserId: "12345",
      nickname: "dibay",
      profileImageUrl: null,
      email: null,
      hasEmailFromProfile: false,
    });
    establishKakaoNativeSession.mockResolvedValue({
      ok: true,
      userId: "user-kakao",
      redirectTo: "/signup/terms",
      signupComplete: false,
      sessionEstablished: true,
      isNewUser: true,
      needsProfileCompletion: true,
      needsTermsAgreement: true,
    });

    const result = await exchangeNativeProviderToken(
      { provider: "kakao", accessToken: "kakao-at" },
      {
        adminSb: {} as never,
        routeSb: {} as never,
        request: {} as never,
        response: {} as never,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider).toBe("kakao");
      expect(result.sessionEstablished).toBe(true);
      expect(result.isNewUser).toBe(true);
      expect(result.needsTermsAgreement).toBe(true);
      expect(result.needsProfileCompletion).toBe(true);
    }
    expect(establishKakaoNativeSession).toHaveBeenCalled();
    expect(verifyKakaoNativeCredential).toHaveBeenCalled();
  });

  it("returns 501 for google when idToken present", async () => {
    const result = await exchangeNativeProviderToken({
      provider: "google",
      idToken: "google-jwt",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("native_provider_not_implemented");
    }
  });
});
