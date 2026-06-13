import { afterEach, describe, expect, it, vi } from "vitest";

let native = true;
let marker: string | null = "android";

vi.mock("@/lib/platform/capacitor-native", () => ({
  DIBAY_APP_MARKER_PARAM: "dibay_app",
  ensureCapacitorNativeMarkerOnBoot: vi.fn(),
  isCapacitorNativePlatform: () => native,
  readDibayAppPlatformMarker: () => marker,
}));

describe("startOAuthLogin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    native = true;
    marker = "android";
  });

  it("navigates to start API with dibay_app marker on native", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    startOAuthLogin({ provider: "google", next: "/market" });

    expect(assign).toHaveBeenCalledWith(
      "/api/auth/oauth/start?provider=google&next=%2Fmarket&dibay_app=android",
    );
  });

  it("navigates to start API without dibay_app on web", async () => {
    native = false;
    marker = null;
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    startOAuthLogin({ provider: "kakao" });

    expect(assign).toHaveBeenCalledWith("/api/auth/oauth/start?provider=kakao");
  });

  it("does not use launch=native or Browser.open for OAuth start", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(
        `${process.cwd()}/lib/auth/oauth/start-oauth-login.ts`,
        "utf8",
      ),
    );
    expect(source).not.toContain('launch", "native"');
    expect(source).not.toContain("Browser.open");
  });

  it("throws for unsupported providers", async () => {
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign: vi.fn() } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    expect(() => startOAuthLogin({ provider: "naver" })).toThrow();
  });
});
