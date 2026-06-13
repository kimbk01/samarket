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

  it("navigates native flow to launch page with dibay_app marker", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    startOAuthLogin({ provider: "google", next: "/market" });

    expect(assign).toHaveBeenCalledWith(
      "/auth/oauth/launch?provider=google&next=%2Fmarket&dibay_app=android",
    );
  });

  it("navigates web flow to start API without launch page", async () => {
    native = false;
    marker = null;
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    startOAuthLogin({ provider: "kakao" });

    expect(assign).toHaveBeenCalledWith("/api/auth/oauth/start?provider=kakao");
  });

  it("throws for unsupported providers", async () => {
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign: vi.fn() } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    expect(() => startOAuthLogin({ provider: "naver" })).toThrow();
  });
});
