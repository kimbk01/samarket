import { describe, expect, it } from "vitest";
import {
  buildNativeAppleExchangeRequest,
  mapNativeApplePluginError,
  parseNativeAppleExchangeBody,
  shouldUseNativeAppleOAuth,
} from "@/lib/auth/native/native-apple-auth-contract";

describe("native-apple-auth-contract", () => {
  it("builds exchange request from sign-in result", () => {
    const body = buildNativeAppleExchangeRequest({
      provider: "apple",
      identityToken: "jwt-token",
      authorizationCode: "auth-code",
      nonce: "nonce-1",
      userIdentifier: "apple-user-123",
      email: "privaterelay@icloud.com",
    });
    expect(body).toEqual({
      provider: "apple",
      identityToken: "jwt-token",
      authorizationCode: "auth-code",
      nonce: "nonce-1",
      userIdentifier: "apple-user-123",
    });
  });

  it("parses identityToken and legacy idToken", () => {
    expect(
      parseNativeAppleExchangeBody({
        provider: "apple",
        identityToken: "jwt-a",
        userIdentifier: "uid",
      }),
    ).toEqual({
      provider: "apple",
      identityToken: "jwt-a",
      userIdentifier: "uid",
    });

    expect(
      parseNativeAppleExchangeBody({
        provider: "apple",
        idToken: "jwt-b",
      }),
    ).toEqual({
      provider: "apple",
      identityToken: "jwt-b",
    });
  });

  it("maps plugin cancel and config errors", () => {
    expect(mapNativeApplePluginError("user_cancelled")).toBe("user_cancelled");
    expect(mapNativeApplePluginError("canceled")).toBe("user_cancelled");
    expect(mapNativeApplePluginError("not_configured")).toBe("apple_native_config_error");
    expect(mapNativeApplePluginError("token_missing")).toBe("apple_native_token_missing");
  });

  it("selects native apple path only on iOS when available", () => {
    expect(shouldUseNativeAppleOAuth("apple", true)).toBe(true);
    expect(shouldUseNativeAppleOAuth("apple", false)).toBe(false);
    expect(shouldUseNativeAppleOAuth("google", true)).toBe(false);
    expect(shouldUseNativeAppleOAuth("kakao", true)).toBe(false);
  });
});
