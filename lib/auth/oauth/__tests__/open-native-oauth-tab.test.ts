import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeOAuthLaunchResult } from "@/lib/auth/oauth/open-native-oauth-tab";

const launcherOpen = vi.fn(async (): Promise<NativeOAuthLaunchResult> => ({
  opened: true,
  method: "custom_tabs",
}));

vi.mock("@/lib/platform/capacitor-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform/capacitor-native")>();
  return {
    ...actual,
    getCapacitorNativeDiagnostics: vi.fn(() => ({
      hasCapacitor: true,
      isNativePlatform: true,
      platform: "android",
      hasAndroidBridge: true,
      hasNativeOAuthLauncherPluginHeader: true,
      hasCapacitorNativePromise: true,
      bridgeReady: true,
      oauthNativeLaunchAvailable: true,
      dibayAppPlatformMarker: "android",
      locationHref: "https://samarket.vercel.app/auth/oauth/launch",
      detectedNative: true,
      oauthLaunchShell: true,
    })),
    isCapacitorBridgeReady: vi.fn(() => true),
    waitForCapacitorBridgeReady: vi.fn(async () => true),
  };
});

vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return {
    ...actual,
    Capacitor: {
      ...actual.Capacitor,
      isPluginAvailable: vi.fn(() => true),
    },
    registerPlugin: vi.fn(() => ({ open: launcherOpen })),
  };
});

describe("openNativeOAuthTab", () => {
  afterEach(async () => {
    launcherOpen.mockClear();
    launcherOpen.mockResolvedValue({ opened: true, method: "custom_tabs" });
    const capacitorNative = await import("@/lib/platform/capacitor-native");
    vi.mocked(capacitorNative.isCapacitorBridgeReady).mockReturnValue(true);
    vi.mocked(capacitorNative.waitForCapacitorBridgeReady).mockResolvedValue(true);
    vi.resetModules();
  });

  it("calls NativeOAuthLauncher.open on native after bridge is ready", async () => {
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    const result = await openNativeOAuthTab("https://supabase.example/auth");
    expect(launcherOpen).toHaveBeenCalledWith({ url: "https://supabase.example/auth" });
    expect(result).toEqual({ opened: true, method: "custom_tabs" });
  });

  it("throws bridge_not_ready without calling plugin open", async () => {
    const capacitorNative = await import("@/lib/platform/capacitor-native");
    vi.mocked(capacitorNative.isCapacitorBridgeReady).mockReturnValue(false);
    vi.mocked(capacitorNative.waitForCapacitorBridgeReady).mockResolvedValue(false);

    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    await expect(openNativeOAuthTab("https://supabase.example/auth")).rejects.toMatchObject({
      name: "oauth_bridge_not_ready",
      devCode: "capacitor_bridge_not_ready",
    });
    expect(launcherOpen).not.toHaveBeenCalled();
  });

  it("throws when plugin rejects", async () => {
    launcherOpen.mockRejectedValueOnce(new Error("custom_tabs_unavailable"));
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    await expect(openNativeOAuthTab("https://supabase.example/auth")).rejects.toMatchObject({
      name: "oauth_custom_tabs_unavailable",
      devCode: "custom_tabs_failed",
    });
  });

  it("formats dev error for display", async () => {
    const { formatNativeOAuthDevError } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    const err = Object.assign(new Error("not implemented"), {
      devCode: "plugin_not_implemented",
      rawDetail: "NativeOAuthLauncher plugin is not implemented on android",
    });
    expect(formatNativeOAuthDevError(err)).toContain("plugin_not_implemented");
  });
});
