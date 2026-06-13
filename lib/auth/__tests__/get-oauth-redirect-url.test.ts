import { afterEach, describe, expect, it, vi } from "vitest";
import { buildNaverOAuthStartPath, buildOAuthRedirectUrl } from "@/lib/auth/get-oauth-redirect-url";
import { buildOAuthRedirectTo } from "@/lib/auth/oauth/redirect-to";

describe("get-oauth-redirect-url compatibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buildOAuthRedirectUrl returns web callback", () => {
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app", "google")).toBe(
      "https://samarket.vercel.app/auth/callback?provider=google",
    );
  });

  it("buildOAuthRedirectTo native deep link", () => {
    expect(
      buildOAuthRedirectTo({
        isNative: true,
        origin: "https://samarket.vercel.app",
        provider: "google",
      }),
    ).toBe("dibay://auth/callback?provider=google");
  });

  it("builds Naver start path with next on web", () => {
    expect(buildNaverOAuthStartPath("/market")).toBe(
      "/api/auth/naver/start?next=%2Fmarket",
    );
  });

  it("builds Naver start path with app marker when native app marker is present", () => {
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/login?dibay_app=android" },
      sessionStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
    });
    vi.stubGlobal("document", { cookie: "" });

    expect(buildNaverOAuthStartPath("/market")).toBe(
      "/api/auth/naver/start?next=%2Fmarket&dibay_app=android",
    );
  });
});
