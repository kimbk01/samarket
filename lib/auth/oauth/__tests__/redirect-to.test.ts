import { describe, expect, it } from "vitest";
import { buildOAuthRedirectTo } from "@/lib/auth/oauth/redirect-to";

describe("buildOAuthRedirectTo", () => {
  it("returns HTTPS callback for web", () => {
    expect(
      buildOAuthRedirectTo({
        isNative: false,
        origin: "https://samarket.vercel.app",
        provider: "google",
      }),
    ).toBe("https://samarket.vercel.app/auth/callback?provider=google");
  });

  it("returns dibay callback for native", () => {
    expect(
      buildOAuthRedirectTo({
        isNative: true,
        origin: "https://samarket.vercel.app",
        provider: "kakao",
        next: "/market",
      }),
    ).toBe("dibay://auth/callback?provider=kakao&next=%2Fmarket");
  });
});
