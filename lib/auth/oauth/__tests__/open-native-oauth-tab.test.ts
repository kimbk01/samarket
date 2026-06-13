import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeOAuthLaunchResult } from "@/lib/auth/oauth/open-native-oauth-tab";

const launcherOpen = vi.fn(async (): Promise<NativeOAuthLaunchResult> => ({
  opened: true,
  method: "custom_tabs",
}));

vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return {
    ...actual,
    registerPlugin: vi.fn(() => ({ open: launcherOpen })),
  };
});

describe("openNativeOAuthTab", () => {
  afterEach(() => {
    launcherOpen.mockClear();
    launcherOpen.mockResolvedValue({ opened: true, method: "custom_tabs" });
    vi.resetModules();
  });

  it("uses NativeOAuthLauncher plugin on native", async () => {
    vi.doMock("@/lib/platform/capacitor-native", () => ({
      isCapacitorNativePlatform: () => true,
    }));
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    const result = await openNativeOAuthTab("https://supabase.example/auth");
    expect(launcherOpen).toHaveBeenCalledWith({ url: "https://supabase.example/auth" });
    expect(result).toEqual({ opened: true, method: "custom_tabs" });
  });

  it("returns action_view method from plugin", async () => {
    launcherOpen.mockResolvedValueOnce({ opened: true, method: "action_view" });
    vi.doMock("@/lib/platform/capacitor-native", () => ({
      isCapacitorNativePlatform: () => true,
    }));
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    const result = await openNativeOAuthTab("https://supabase.example/auth");
    expect(result.method).toBe("action_view");
  });

  it("throws plugin_not_implemented on non-native", async () => {
    vi.doMock("@/lib/platform/capacitor-native", () => ({
      isCapacitorNativePlatform: () => false,
    }));
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    await expect(openNativeOAuthTab("https://supabase.example/auth")).rejects.toMatchObject({
      name: "oauth_launcher_unavailable",
      devCode: "plugin_not_implemented",
    });
    expect(launcherOpen).not.toHaveBeenCalled();
  });

  it("throws action_view_failed when plugin rejects", async () => {
    launcherOpen.mockRejectedValueOnce(new Error("browser_open_failed"));
    vi.doMock("@/lib/platform/capacitor-native", () => ({
      isCapacitorNativePlatform: () => true,
    }));
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    await expect(openNativeOAuthTab("https://supabase.example/auth")).rejects.toMatchObject({
      name: "oauth_tab_open_failed",
      devCode: "action_view_failed",
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
