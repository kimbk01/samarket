import { afterEach, describe, expect, it, vi } from "vitest";
import { buildNaverOAuthStartPath, buildOAuthRedirectUrl, createOAuthRedirectTo } from "@/lib/auth/get-oauth-redirect-url";

describe("buildOAuthRedirectUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns HTTPS callback for web browser", () => {
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app", "google")).toBe(
      "https://samarket.vercel.app/auth/callback?provider=google",
    );
  });

  it("preserves next on web callback", () => {
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app", "kakao", "/market")).toBe(
      "https://samarket.vercel.app/auth/callback?provider=kakao&next=%2Fmarket",
    );
  });

  it("strips trailing slash from web origin", () => {
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app/", "apple")).toBe(
      "https://samarket.vercel.app/auth/callback?provider=apple",
    );
  });

  it("returns dibay deep link on Capacitor native platform", () => {
    vi.stubGlobal("window", {
      Capacitor: {
        isNativePlatform: () => true,
      },
    });
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app", "google")).toBe(
      "dibay://auth/callback?provider=google",
    );
  });

  it("returns dibay deep link when androidBridge is present", () => {
    vi.stubGlobal("window", {
      androidBridge: {},
      Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
    });
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app", "facebook")).toBe(
      "dibay://auth/callback?provider=facebook",
    );
  });

  it("returns dibay deep link when getPlatform is android", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => false, getPlatform: () => "android" },
    });
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app", "apple")).toBe(
      "dibay://auth/callback?provider=apple",
    );
  });

  it("returns dibay deep link when Android app marker is present", () => {
    vi.stubGlobal("window", {
      location: { href: "https://samarket.vercel.app/login?dibay_app=android" },
      sessionStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
    });
    vi.stubGlobal("document", { cookie: "" });

    expect(buildOAuthRedirectUrl("https://samarket.vercel.app", "google")).toBe(
      "dibay://auth/callback?provider=google",
    );
  });

  it("preserves next on native deep link", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
    });
    expect(buildOAuthRedirectUrl("https://samarket.vercel.app", "naver", "/philife")).toBe(
      "dibay://auth/callback?provider=naver&next=%2Fphilife",
    );
  });

  it("createOAuthRedirectTo matches buildOAuthRedirectUrl on web", () => {
    expect(createOAuthRedirectTo({ origin: "https://samarket.vercel.app", provider: "google" })).toBe(
      buildOAuthRedirectUrl("https://samarket.vercel.app", "google"),
    );
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
