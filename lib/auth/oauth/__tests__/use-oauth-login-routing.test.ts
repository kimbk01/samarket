import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveOAuthProviderRoutingSnapshot,
  shouldBlockAppleWebOAuthSafetyNet,
} from "@/lib/auth/oauth/oauth-provider-routing.client";

vi.mock("@/lib/platform/capacitor-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform/capacitor-native")>();
  return {
    ...actual,
    isCapacitorNativePlatform: vi.fn(() => false),
    isOAuthNativeLaunchShell: vi.fn(() => false),
    resolveOAuthRoutingShellPlatform: vi.fn(() => null),
    isNativeAppleLoginAvailable: vi.fn(() => false),
  };
});

import {
  isCapacitorNativePlatform,
  isOAuthNativeLaunchShell,
  isNativeAppleLoginAvailable,
  resolveOAuthRoutingShellPlatform,
} from "@/lib/platform/capacitor-native";

describe("use-oauth-login Apple routing integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
    vi.mocked(isOAuthNativeLaunchShell).mockReturnValue(false);
    vi.mocked(resolveOAuthRoutingShellPlatform).mockReturnValue(null);
    vi.mocked(isNativeAppleLoginAvailable).mockReturnValue(false);
  });

  it("iOS shellPlatform null with WebKit bridge marker → blocks Web OAuth for Apple", async () => {
    const actual = await vi.importActual<typeof import("@/lib/platform/capacitor-native")>(
      "@/lib/platform/capacitor-native",
    );
    vi.stubGlobal("window", {
      Capacitor: { getPlatform: () => "web" },
      webkit: { messageHandlers: { bridge: {} } },
    });
    vi.mocked(resolveOAuthRoutingShellPlatform).mockImplementation(actual.resolveOAuthRoutingShellPlatform);

    expect(actual.resolveCapacitorShellPlatform()).toBe("ios");
    expect(actual.hasLikelyIosCapacitorShell()).toBe(true);
    expect(actual.resolveOAuthRoutingShellPlatform()).toBe("ios");

    const snapshot = resolveOAuthProviderRoutingSnapshot("apple");
    expect(snapshot.shellPlatform).toBe("ios");
    expect(snapshot.routing.action).not.toBe("web_oauth_start");
    expect(
      shouldBlockAppleWebOAuthSafetyNet(snapshot.shellPlatform, "web_oauth_start"),
    ).toBe(true);
  });

  it("Android Apple keeps web_oauth_start — no iOS-only unavailable path", () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(resolveOAuthRoutingShellPlatform).mockReturnValue("android");

    const snapshot = resolveOAuthProviderRoutingSnapshot("apple");
    expect(snapshot.routing.action).toBe("web_oauth_start");
    expect(snapshot.routing.action).not.toBe("native_blocked");
    expect(snapshot.appleWebOAuthFallbackReason).toBe("android_apple_web_oauth_by_design");
  });

  it("iOS plugin unavailable → native_blocked without web oauth fallback action", () => {
    vi.mocked(resolveOAuthRoutingShellPlatform).mockReturnValue("ios");
    vi.mocked(isNativeAppleLoginAvailable).mockReturnValue(false);

    const snapshot = resolveOAuthProviderRoutingSnapshot("apple");
    expect(snapshot.routing).toMatchObject({
      action: "native_blocked",
      errorCode: "apple_native_unavailable",
    });
    expect(snapshot.appleWebOAuthFallbackReason).toBe("apple_native_plugin_unavailable_on_ios");
  });
});
