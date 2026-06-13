import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOAuthStartUrl } from "@/lib/auth/oauth/start";

describe("buildOAuthStartUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds web start url", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
    });
    expect(
      buildOAuthStartUrl({
        origin: "https://samarket.vercel.app",
        provider: "google",
        next: "/market",
        nativeLaunch: false,
      }),
    ).toBe("https://samarket.vercel.app/api/auth/oauth/start?provider=google&next=%2Fmarket");
  });

  it("builds native start url with launch=native", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
      sessionStorage: { getItem: () => "android", setItem: () => undefined },
      location: { href: "https://samarket.vercel.app?dibay_app=android" },
    });
    vi.stubGlobal("document", { cookie: "" });

    const url = buildOAuthStartUrl({
      origin: "https://samarket.vercel.app",
      provider: "google",
      nativeLaunch: true,
    });
    expect(url).toContain("/api/auth/oauth/start?provider=google");
    expect(url).toContain("launch=native");
    expect(url).toContain("dibay_app=android");
  });
});
