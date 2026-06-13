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
    native = true;
    marker = "android";
  });

  it("navigates native OAuth to the launch page instead of fetch-then-open", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    startOAuthLogin({ provider: "google", next: "/market" });

    expect(assign).toHaveBeenCalledWith(
      "/auth/oauth/native-launch?provider=google&next=%2Fmarket&dibay_app=android",
    );
  });

  it("uses web start API navigation for non-native web flow", async () => {
    native = false;
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    startOAuthLogin({ provider: "kakao" });

    expect(assign).toHaveBeenCalledWith("/api/auth/oauth/start?provider=kakao");
  });

  it("throws for unsupported providers", async () => {
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign: vi.fn() } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    expect(() => startOAuthLogin({ provider: "naver" })).toThrowError(/invalid_provider|지원하지 않는/);
  });
});
