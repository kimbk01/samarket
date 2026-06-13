import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeOAuthLaunchResult } from "@/lib/auth/oauth/open-native-oauth-tab";

const launcherOpen = vi.fn(async (): Promise<NativeOAuthLaunchResult> => ({
  opened: true,
  method: "action_view",
}));

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
  afterEach(() => {
    launcherOpen.mockClear();
    launcherOpen.mockResolvedValue({ opened: true, method: "action_view" });
    vi.resetModules();
  });

  it("calls NativeOAuthLauncher.open on native", async () => {
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    const result = await openNativeOAuthTab("https://supabase.example/auth");
    expect(launcherOpen).toHaveBeenCalledWith({ url: "https://supabase.example/auth" });
    expect(result).toEqual({ opened: true, method: "action_view" });
  });

  it("throws when plugin rejects", async () => {
    launcherOpen.mockRejectedValueOnce(new Error("browser_open_failed"));
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
