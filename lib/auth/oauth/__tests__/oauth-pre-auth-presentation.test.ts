import { describe, expect, it } from "vitest";
import {
  resolveVisibleOAuthPendingProvider,
  shouldSuppressOAuthPreAuthPresentationForRouting,
} from "@/lib/auth/oauth/oauth-pre-auth-presentation";

describe("oauth-pre-auth-presentation", () => {
  it("suppresses visible pending only for native Kakao provider login", () => {
    expect(
      shouldSuppressOAuthPreAuthPresentationForRouting("kakao", "native_provider_login"),
    ).toBe(true);
    expect(shouldSuppressOAuthPreAuthPresentationForRouting("kakao", "web_oauth_start")).toBe(false);
    expect(shouldSuppressOAuthPreAuthPresentationForRouting("kakao", "native_blocked")).toBe(false);
    expect(
      shouldSuppressOAuthPreAuthPresentationForRouting("google", "native_provider_login"),
    ).toBe(false);
    expect(
      shouldSuppressOAuthPreAuthPresentationForRouting("apple", "native_provider_login"),
    ).toBe(false);
  });

  it("keeps mutex provider while clearing visible signing-in provider when suppressed", () => {
    expect(resolveVisibleOAuthPendingProvider("kakao", true)).toBeNull();
    expect(resolveVisibleOAuthPendingProvider("kakao", false)).toBe("kakao");
    expect(resolveVisibleOAuthPendingProvider("google", false)).toBe("google");
    expect(resolveVisibleOAuthPendingProvider(null, true)).toBeNull();
  });
});
