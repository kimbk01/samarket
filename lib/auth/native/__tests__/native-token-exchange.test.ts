import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exchangeNativeProviderToken,
  isNativeTokenExchangeProvider,
  normalizeNativeExchangeProvider,
} from "@/lib/auth/native/native-token-exchange.server";

const verifyAppleIdentityToken = vi.fn();
const establishAppleNativeSession = vi.fn();

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

describe("native-token-exchange.server", () => {
  beforeEach(() => {
    verifyAppleIdentityToken.mockReset();
    establishAppleNativeSession.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes apple and kakao providers", () => {
    expect(normalizeNativeExchangeProvider("apple")).toBe("apple");
    expect(normalizeNativeExchangeProvider("kakao")).toBe("kakao");
    expect(normalizeNativeExchangeProvider("google")).toBeNull();
    expect(isNativeTokenExchangeProvider("apple")).toBe(true);
  });

  it("returns 400 when apple token missing", async () => {
    const result = await exchangeNativeProviderToken({ provider: "apple" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("native_token_missing");
      expect(result.status).toBe(400);
    }
  });

  it("returns 401 when apple verify fails", async () => {
    const { AppleTokenVerifyError } = await import("@/lib/auth/native/apple-token-verify.server");
    verifyAppleIdentityToken.mockRejectedValue(
      new AppleTokenVerifyError("apple_token_verify_failed", "invalid signature"),
    );
    const result = await exchangeNativeProviderToken({
      provider: "apple",
      identityToken: "jwt-test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("apple_token_verify_failed");
      expect(result.status).toBe(401);
    }
  });

  it("returns 501 when session context missing after verify", async () => {
    verifyAppleIdentityToken.mockResolvedValue({
      sub: "apple-sub",
      email: null,
      isPrivateRelayEmail: false,
      aud: "com.dibay.app",
    });
    const result = await exchangeNativeProviderToken({
      provider: "apple",
      identityToken: "jwt-test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("native_exchange_not_implemented");
      expect(result.status).toBe(501);
    }
  });

  it("returns success with sessionEstablished when verify and session succeed", async () => {
    verifyAppleIdentityToken.mockResolvedValue({
      sub: "apple-sub",
      email: "relay@privaterelay.appleid.com",
      isPrivateRelayEmail: true,
      aud: "com.dibay.app",
    });
    establishAppleNativeSession.mockResolvedValue({
      ok: true,
      userId: "user-1",
      redirectTo: "/signup/terms",
      signupComplete: false,
      sessionEstablished: true,
      isNewUser: true,
    });

    const result = await exchangeNativeProviderToken(
      {
        provider: "apple",
        identityToken: "jwt-test",
        userIdentifier: "apple-sub",
      },
      {
        adminSb: {} as never,
        routeSb: {} as never,
        request: {} as never,
        response: {} as never,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider).toBe("apple");
      expect(result.sessionEstablished).toBe(true);
      expect(result.signupComplete).toBe(false);
      expect(result.redirectTo).toBe("/signup/terms");
    }
    expect(establishAppleNativeSession).toHaveBeenCalled();
  });

  it("returns 501 for kakao", async () => {
    const result = await exchangeNativeProviderToken({
      provider: "kakao",
      accessToken: "test-token",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("native_exchange_not_implemented");
      expect(result.status).toBe(501);
    }
  });
});
