import { describe, expect, it } from "vitest";
import {
  extractNativeGooglePluginRejectRaw,
  extractNativePluginRejectRaw,
  mapNativeGooglePluginError,
} from "@/lib/auth/native/native-google-auth-contract";
import {
  extractNativeKakaoPluginRejectRaw,
  mapNativeKakaoPluginError,
} from "@/lib/auth/native/native-kakao-auth-contract";

/**
 * Capacitor Android PluginCall.reject(msg, code) — DIBAY 플러그인은 reject("코드", "설명") 로 호출해
 * JS 에는 { code: 설명, message: 코드 } 로 도착한다 (실측 원인: Google 실패가 전부 unavailable 로 표시).
 */
describe("native plugin reject 코드 추출", () => {
  it("Google 취소: code 자리에 설명이 와도 user_cancelled", () => {
    const err = { code: "User cancelled Google sign in", message: "user_cancelled" };
    expect(mapNativeGooglePluginError(extractNativePluginRejectRaw(err))).toBe("user_cancelled");
  });

  it("Google DEVELOPER_ERROR(10) → config_error (unavailable 아님)", () => {
    const err = {
      code: "Google DEVELOPER_ERROR(10): Android OAuth client SHA-1 or package name mismatch.",
      message: "google_native_config_error",
    };
    expect(mapNativeGooglePluginError(extractNativePluginRejectRaw(err))).toBe("google_native_config_error");
    expect(mapNativeGooglePluginError(err.code)).toBe("google_native_config_error");
  });

  it("정상 순서(code=코드)도 그대로", () => {
    expect(extractNativePluginRejectRaw({ code: "google_native_token_missing", message: "x y" })).toBe(
      "google_native_token_missing",
    );
  });

  it("Kakao 키 해시 오류: 코드 우선", () => {
    const err = { code: "Android keyHash validation failed.", message: "kakao_native_key_hash_required" };
    expect(mapNativeKakaoPluginError(extractNativeKakaoPluginRejectRaw(err))).toBe("kakao_native_key_hash_required");
  });

  it("Google 12501(계정 선택 닫음) → 취소 (실기기 07:58:50 PHT FAIL 재현)", () => {
    const err = { code: "12501: ", message: "google_native_config_error" };
    expect(mapNativeGooglePluginError(extractNativeGooglePluginRejectRaw(err))).toBe("user_cancelled");
  });

  it("Google 10(DEVELOPER_ERROR) 은 취소로 오인하지 않음", () => {
    const err = { code: "Google DEVELOPER_ERROR(10): mismatch", message: "google_native_config_error" };
    expect(mapNativeGooglePluginError(extractNativeGooglePluginRejectRaw(err))).toBe("google_native_config_error");
  });
});
