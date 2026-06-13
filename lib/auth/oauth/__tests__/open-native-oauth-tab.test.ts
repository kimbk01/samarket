import { afterEach, describe, expect, it, vi } from "vitest";

const oauthTabOpen = vi.fn(async () => undefined);

vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return {
    ...actual,
    registerPlugin: vi.fn(() => ({ open: oauthTabOpen })),
  };
});

describe("openNativeOAuthTab", () => {
  afterEach(() => {
    oauthTabOpen.mockClear();
    oauthTabOpen.mockResolvedValue(undefined);
    vi.resetModules();
  });

  it("uses OAuthTab plugin on native", async () => {
    vi.doMock("@/lib/platform/capacitor-native", () => ({
      isCapacitorNativePlatform: () => true,
    }));
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    await openNativeOAuthTab("https://supabase.example/auth");
    expect(oauthTabOpen).toHaveBeenCalledWith({ url: "https://supabase.example/auth" });
  });

  it("throws oauth_tab_unavailable on non-native", async () => {
    vi.doMock("@/lib/platform/capacitor-native", () => ({
      isCapacitorNativePlatform: () => false,
    }));
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    await expect(openNativeOAuthTab("https://supabase.example/auth")).rejects.toMatchObject({
      name: "oauth_tab_unavailable",
    });
    expect(oauthTabOpen).not.toHaveBeenCalled();
  });

  it("throws custom_tabs_unavailable when plugin rejects", async () => {
    oauthTabOpen.mockRejectedValueOnce(new Error("custom_tabs_unavailable"));
    vi.doMock("@/lib/platform/capacitor-native", () => ({
      isCapacitorNativePlatform: () => true,
    }));
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    await expect(openNativeOAuthTab("https://supabase.example/auth")).rejects.toMatchObject({
      name: "custom_tabs_unavailable",
    });
  });

  it("throws oauth_tab_open_failed for generic plugin reject", async () => {
    oauthTabOpen.mockRejectedValueOnce(new Error("browser_open_failed"));
    vi.doMock("@/lib/platform/capacitor-native", () => ({
      isCapacitorNativePlatform: () => true,
    }));
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    await expect(openNativeOAuthTab("https://supabase.example/auth")).rejects.toMatchObject({
      name: "oauth_tab_open_failed",
    });
  });

  it("maps error codes to i18n keys", async () => {
    const { mapNativeOAuthOpenErrorToMessageKey } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    expect(mapNativeOAuthOpenErrorToMessageKey("oauth_tab_unavailable")).toBe(
      "auth_err_oauth_browser_plugin_unavailable",
    );
    expect(mapNativeOAuthOpenErrorToMessageKey("custom_tabs_unavailable")).toBe(
      "auth_err_oauth_custom_tabs_required",
    );
    expect(mapNativeOAuthOpenErrorToMessageKey("oauth_tab_open_failed")).toBe(
      "auth_err_oauth_browser_open_failed",
    );
  });
});
