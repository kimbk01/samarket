import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveOAuthProviderRoutingSnapshot,
  shouldBlockAppleWebOAuthSafetyNet,
  shouldWaitCapacitorBridgeBeforeOAuthRouting,
} from "@/lib/auth/oauth/oauth-provider-routing.client";

vi.mock("@/lib/platform/capacitor-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform/capacitor-native")>();
  return {
    ...actual,
    isCapacitorNativePlatform: vi.fn(() => false),
    isOAuthNativeLaunchShell: vi.fn(() => false),
    resolveOAuthRoutingShellPlatform: vi.fn(() => null),
    isNativeAppleLoginAvailable: vi.fn(() => false),
    isNativeKakaoLoginAvailable: vi.fn(() => false),
    isNativeGoogleLoginAvailable: vi.fn(() => false),
  };
});

import {
  isCapacitorNativePlatform,
  isOAuthNativeLaunchShell,
  isNativeAppleLoginAvailable,
  resolveOAuthRoutingShellPlatform,
} from "@/lib/platform/capacitor-native";

describe("oauth-provider-routing.client", () => {
  afterEach(() => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
    vi.mocked(isOAuthNativeLaunchShell).mockReturnValue(false);
    vi.mocked(resolveOAuthRoutingShellPlatform).mockReturnValue(null);
    vi.mocked(isNativeAppleLoginAvailable).mockReturnValue(false);
  });

  it("blocks Apple Web OAuth safety net on iOS shell only for Apple provider", () => {
    expect(shouldBlockAppleWebOAuthSafetyNet("apple", "ios", "web_oauth_start")).toBe(true);
    expect(shouldBlockAppleWebOAuthSafetyNet("google", "ios", "web_oauth_start")).toBe(false);
    expect(shouldBlockAppleWebOAuthSafetyNet("kakao", "ios", "web_oauth_start")).toBe(false);
    expect(shouldBlockAppleWebOAuthSafetyNet("apple", "android", "web_oauth_start")).toBe(false);
    expect(shouldBlockAppleWebOAuthSafetyNet("apple", "ios", "native_provider_login")).toBe(false);
  });

  it("allows iOS Google web_oauth_start (Custom Tab) — not Apple safety net", () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(resolveOAuthRoutingShellPlatform).mockReturnValue("ios");

    const snapshot = resolveOAuthProviderRoutingSnapshot("google");
    expect(snapshot.routing.action).toBe("web_oauth_start");
    expect(
      shouldBlockAppleWebOAuthSafetyNet(
        snapshot.provider,
        snapshot.shellPlatform,
        snapshot.routing.action,
      ),
    ).toBe(false);
  });

  it("waits for bridge on Apple when OAuth routing shell resolves to ios", () => {
    vi.mocked(resolveOAuthRoutingShellPlatform).mockReturnValue("ios");
    expect(shouldWaitCapacitorBridgeBeforeOAuthRouting("apple")).toBe(true);
    expect(shouldWaitCapacitorBridgeBeforeOAuthRouting("google")).toBe(false);
  });

  it("routes Android Apple to web_oauth_start by design", () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(resolveOAuthRoutingShellPlatform).mockReturnValue("android");

    const snapshot = resolveOAuthProviderRoutingSnapshot("apple");
    expect(snapshot.routing).toEqual({
      action: "web_oauth_start",
      webOAuthFallbackReason: "android_apple_web_oauth_by_design",
    });
    expect(snapshot.appleWebOAuthFallbackReason).toBe("android_apple_web_oauth_by_design");
  });

  it("blocks Apple on iOS when native plugin unavailable — no web oauth", () => {
    vi.mocked(resolveOAuthRoutingShellPlatform).mockReturnValue("ios");
    vi.mocked(isNativeAppleLoginAvailable).mockReturnValue(false);

    const snapshot = resolveOAuthProviderRoutingSnapshot("apple");
    expect(snapshot.routing).toEqual({
      action: "native_blocked",
      errorCode: "apple_native_unavailable",
      webOAuthFallbackReason: "apple_native_plugin_unavailable_on_ios",
    });
    expect(snapshot.routing.action).not.toBe("web_oauth_start");
  });

  it("routes iOS Apple to native when plugin available", () => {
    vi.mocked(resolveOAuthRoutingShellPlatform).mockReturnValue("ios");
    vi.mocked(isNativeAppleLoginAvailable).mockReturnValue(true);

    const snapshot = resolveOAuthProviderRoutingSnapshot("apple");
    expect(snapshot.routing).toEqual({ action: "native_provider_login" });
  });

  it("does not affect Google routing on browser shell", () => {
    const snapshot = resolveOAuthProviderRoutingSnapshot("google");
    expect(snapshot.routing).toEqual({ action: "web_oauth_start" });
  });
});
