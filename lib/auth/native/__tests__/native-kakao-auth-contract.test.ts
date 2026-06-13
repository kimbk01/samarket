import { describe, expect, it } from "vitest";
import {
  buildNativeKakaoExchangeRequest,
  mapNativeKakaoPluginError,
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

  it("maps KakaoTalk key hash SDK errors to kakao_native_key_hash_required", () => {
    expect(mapNativeKakaoPluginError("kakao_native_key_hash_required")).toBe("kakao_native_key_hash_required");
    expect(
      mapNativeKakaoPluginError("KakaoTalk is installed but not connected to this application."),
    ).toBe("kakao_native_key_hash_required");
  });

  it("maps in-flight plugin reject to kakao_native_unavailable", () => {
    expect(mapNativeKakaoPluginError("kakao_native_in_flight")).toBe("kakao_native_unavailable");
  });
});
