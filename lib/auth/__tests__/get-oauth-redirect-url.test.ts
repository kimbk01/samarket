import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOAuthRedirectUrl } from "@/lib/auth/get-oauth-redirect-url";

describe("buildOAuthRedirectUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns HTTPS callback for web browser", () => {
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app")).toBe(
      "https://samarket.vercel.app/auth/callback",
    );
  });

  it("preserves next on web callback", () => {
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app", "/market")).toBe(
      "https://samarket.vercel.app/auth/callback?next=%2Fmarket",
    );
  });

  it("strips trailing slash from web origin", () => {
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app/")).toBe(
      "https://samarket.vercel.app/auth/callback",
    );
  });

  it("returns dibay deep link on Capacitor native platform", () => {
    vi.stubGlobal("window", {
      Capacitor: {
        isNativePlatform: () => true,
      },
    });
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app")).toBe("dibay://auth/callback");
  });

  it("preserves next on native deep link", () => {
    vi.stubGlobal("window", {
      Capacitor: {
        isNativePlatform: () => true,
      },
    });
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app", "/philife")).toBe(
      "dibay://auth/callback?next=%2Fphilife",
    );
  });
});
