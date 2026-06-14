import { describe, expect, it } from "vitest";
import { shouldAbortGoogleNativeRecoverForOAuthLock } from "@/lib/auth/native/start-native-google-login.client";

describe("start-native-google-login recover lock", () => {
  it("does not abort recover when google sign-in is already in flight", () => {
    expect(shouldAbortGoogleNativeRecoverForOAuthLock("google")).toBe(false);
  });

  it("aborts recover when another provider holds the oauth lock", () => {
    expect(shouldAbortGoogleNativeRecoverForOAuthLock("kakao")).toBe(true);
    expect(shouldAbortGoogleNativeRecoverForOAuthLock("apple")).toBe(true);
  });
});
