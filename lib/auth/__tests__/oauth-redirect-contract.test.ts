import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertNativeAuthorizeRedirectToPresent,
  assertNativeOAuthRedirectExpected,
  detectRedirectToMismatch,
  isNativeOAuthCallbackUrl,
} from "@/lib/auth/oauth-redirect-contract";

describe("oauth-redirect-contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes native redirect when dibay scheme is used", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
    });
    const result = assertNativeOAuthRedirectExpected("dibay://auth/callback?provider=google");
    expect(result.ok).toBe(true);
    expect(result.isNative).toBe(true);
  });

  it("fails native redirect when https callback is used on native", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
    });
    const result = assertNativeOAuthRedirectExpected(
      "https://samarket.vercel.app/auth/callback?provider=google",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("native_https_redirect");
  });

  it("detects supabase whitelist fallback mismatch", () => {
    const mismatch = detectRedirectToMismatch(
      "dibay://auth/callback?provider=google",
      "https://samarket.vercel.app/auth/callback?provider=google",
    );
    expect(mismatch.mismatch).toBe(true);
    expect(mismatch.reason).toBe("supabase_whitelist_fallback");
  });

  it("passes when requested and authorize redirect_to match", () => {
    const mismatch = detectRedirectToMismatch(
      "dibay://auth/callback?provider=kakao",
      "dibay://auth/callback?provider=kakao",
    );
    expect(mismatch.mismatch).toBe(false);
  });

  it("identifies native oauth callback url", () => {
    expect(isNativeOAuthCallbackUrl("dibay://auth/callback?provider=apple")).toBe(true);
    expect(isNativeOAuthCallbackUrl("https://samarket.vercel.app/auth/callback")).toBe(false);
  });

  it("fails native when authorize redirect_to is missing", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
    });
    const result = assertNativeAuthorizeRedirectToPresent(null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("redirect_to_missing");
  });

  it("skips redirect_to presence check on web", () => {
    vi.stubGlobal("window", {});
    const result = assertNativeAuthorizeRedirectToPresent(null);
    expect(result.ok).toBe(true);
  });
});
