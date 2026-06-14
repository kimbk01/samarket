import { afterEach, describe, expect, it } from "vitest";
import { resolveAppleNativeAllowedAudiences } from "@/lib/auth/native/apple-auth-env.server";

describe("apple-auth-env.server — Native aud policy", () => {
  afterEach(() => {
    delete process.env.AUTH_APPLE_NATIVE_AUDIENCES;
    delete process.env.AUTH_APPLE_NATIVE_CLIENT_ID;
    delete process.env.AUTH_APPLE_WEB_CLIENT_ID;
    delete process.env.APPLE_CLIENT_ID;
    delete process.env.APPLE_NATIVE_BUNDLE_ID;
  });

  it("allows com.dibay.app via AUTH_APPLE_NATIVE_CLIENT_ID", () => {
    process.env.AUTH_APPLE_NATIVE_CLIENT_ID = "com.dibay.app";
    expect(resolveAppleNativeAllowedAudiences()).toEqual(["com.dibay.app"]);
  });

  it("does not include Web OAuth Services ID com.dibay.login2 in Native aud", () => {
    process.env.AUTH_APPLE_NATIVE_CLIENT_ID = "com.dibay.app";
    process.env.AUTH_APPLE_WEB_CLIENT_ID = "com.dibay.login2";
    process.env.APPLE_CLIENT_ID = "com.dibay.login2";
    expect(resolveAppleNativeAllowedAudiences()).toEqual(["com.dibay.app"]);
    expect(resolveAppleNativeAllowedAudiences()).not.toContain("com.dibay.login2");
  });

  it("does not auto-merge AUTH_APPLE_WEB_CLIENT_ID when only Native audiences env is set", () => {
    process.env.AUTH_APPLE_NATIVE_AUDIENCES = "com.dibay.app";
    process.env.AUTH_APPLE_WEB_CLIENT_ID = "com.dibay.login2";
    expect(resolveAppleNativeAllowedAudiences()).toEqual(["com.dibay.app"]);
  });
});
