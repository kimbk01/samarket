import { describe, expect, it } from "vitest";
import {
  buildNativeGoogleExchangeRequest,
  shouldUseNativeGoogleOAuth,
} from "@/lib/auth/native/native-google-auth-contract";

describe("native-google-auth-contract", () => {
  it("builds exchange request from sign-in result", () => {
    expect(
      buildNativeGoogleExchangeRequest({
        provider: "google",
        idToken: " id-token ",
      }),
    ).toEqual({
      provider: "google",
      idToken: "id-token",
    });
  });

  it("routes google only when native available", () => {
    expect(shouldUseNativeGoogleOAuth("google", true)).toBe(true);
    expect(shouldUseNativeGoogleOAuth("google", false)).toBe(false);
    expect(shouldUseNativeGoogleOAuth("kakao", true)).toBe(false);
  });
});
