import { afterEach, describe, expect, it, vi } from "vitest";

const oauthTabOpen = vi.fn(async () => undefined);
const browserOpen = vi.fn(async () => undefined);

vi.mock("@capacitor/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@capacitor/core")>();
  return {
    ...actual,
    registerPlugin: vi.fn(() => ({ open: oauthTabOpen })),
  };
});

vi.mock("@capacitor/browser", () => ({
  Browser: { open: browserOpen, close: vi.fn() },
}));

describe("openNativeOAuthTab", () => {
  afterEach(() => {
    oauthTabOpen.mockClear();
    browserOpen.mockClear();
    vi.resetModules();
  });

  it("uses OAuthTab plugin on native", async () => {
    vi.doMock("@/lib/platform/capacitor-native", () => ({
      isCapacitorNativePlatform: () => true,
    }));
    const { openNativeOAuthTab } = await import("@/lib/auth/oauth/open-native-oauth-tab");
    await openNativeOAuthTab("https://supabase.example/auth");
    expect(oauthTabOpen).toHaveBeenCalledWith({ url: "https://supabase.example/auth" });
    expect(browserOpen).not.toHaveBeenCalled();
  });
});
