import { describe, expect, it } from "vitest";
import {
  assertNativeAuthorizeRedirectToPresent,
  assertNativeOAuthRedirectExpected,
  detectRedirectToMismatch,
  isNativeOAuthCallbackUrl,
} from "@/lib/auth/oauth/redirect-contract";

describe("oauth redirect-contract", () => {
  it("passes native redirect when dibay scheme is used", () => {
    const result = assertNativeOAuthRedirectExpected("dibay://auth/callback?provider=google", true);
    expect(result.ok).toBe(true);
  });

  it("fails native redirect when https callback is used", () => {
    const result = assertNativeOAuthRedirectExpected(
      "https://samarket.vercel.app/auth/callback?provider=google",
      true,
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

  it("identifies native oauth callback url", () => {
    expect(isNativeOAuthCallbackUrl("dibay://auth/callback?provider=apple")).toBe(true);
    expect(isNativeOAuthCallbackUrl("https://samarket.vercel.app/auth/callback")).toBe(false);
  });

  it("fails native when authorize redirect_to is missing", () => {
    const result = assertNativeAuthorizeRedirectToPresent(null, true);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("redirect_to_missing");
  });

  it("skips redirect_to presence check on web", () => {
    const result = assertNativeAuthorizeRedirectToPresent(null, false);
    expect(result.ok).toBe(true);
  });
});
