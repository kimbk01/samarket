import { describe, expect, it } from "vitest";
import { NativeAppleAuthError } from "@/lib/auth/native/native-apple-auth-plugin";
import { NativeGoogleAuthError } from "@/lib/auth/native/native-google-auth-plugin";
import { NativeKakaoAuthError } from "@/lib/auth/native/native-kakao-auth-plugin";
import {
  isNativeProviderEmailConflictError,
  summarizeOAuthStartFailure,
} from "@/lib/auth/oauth/oauth-start-error.client";

describe("oauth-start-error.client", () => {
  it("summarizes failures without leaking token fields", () => {
    const err = new NativeAppleAuthError(
      "apple_native_verify_failed",
      "identityToken=eyJhbG.id_token.secret access_token=abc",
    );
    const summary = summarizeOAuthStartFailure(err);
    expect(summary).toEqual({
      code: "apple_native_verify_failed",
      reason: "apple_native_verify_failed",
    });
    expect(JSON.stringify(summary)).not.toMatch(/eyJhbG|access_token|id_token/);
  });

  it("detects native provider email conflict without treating as generic failure", () => {
    expect(isNativeProviderEmailConflictError(new NativeGoogleAuthError("google_native_email_conflict"))).toBe(true);
    expect(isNativeProviderEmailConflictError(new NativeKakaoAuthError("kakao_native_email_conflict"))).toBe(true);
    expect(isNativeProviderEmailConflictError(new NativeAppleAuthError("apple_native_email_conflict"))).toBe(true);
    expect(isNativeProviderEmailConflictError(new NativeGoogleAuthError("user_cancelled"))).toBe(false);
  });
});
