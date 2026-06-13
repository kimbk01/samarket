import { describe, expect, it } from "vitest";
import {
  buildNativeKakaoExchangeRequest,
  shouldUseNativeKakaoOAuth,
} from "@/lib/auth/native/native-kakao-auth-contract";

describe("native-kakao-auth-contract", () => {
  it("builds exchange request from sign-in result", () => {
    const body = buildNativeKakaoExchangeRequest({
      provider: "kakao",
      accessToken: "at-1",
      idToken: "id-1",
    });
    expect(body).toEqual({
      provider: "kakao",
      accessToken: "at-1",
      idToken: "id-1",
    });
  });

  it("branches native kakao only when plugin available", () => {
    expect(shouldUseNativeKakaoOAuth("kakao", true)).toBe(true);
    expect(shouldUseNativeKakaoOAuth("kakao", false)).toBe(false);
    expect(shouldUseNativeKakaoOAuth("google", true)).toBe(false);
  });
});
