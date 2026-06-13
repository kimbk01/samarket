import { afterEach, describe, expect, it, vi } from "vitest";

const { browserOpen } = vi.hoisted(() => ({
  browserOpen: vi.fn(async (_options: { url: string }) => undefined),
}));

vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: browserOpen,
  },
}));

import { launchOAuthAuthorizeUrl } from "@/lib/auth/oauth-authorize-launch";

describe("oauth-authorize-launch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    browserOpen.mockClear();
  });

  it("opens Custom Tab for all providers on native platform", async () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
      open: vi.fn(),
      location: { assign: vi.fn(), replace: vi.fn() },
      document: { body: { appendChild: vi.fn(), removeChild: vi.fn() } },
    });

    await launchOAuthAuthorizeUrl(
      "kakao",
      "https://example.supabase.co/auth/v1/authorize?provider=kakao",
    );

    expect(browserOpen).toHaveBeenCalledWith({
      url: "https://example.supabase.co/auth/v1/authorize?provider=kakao",
    });
  });

  it("uses location.assign for web non-google provider", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
      navigator: { userAgent: "Mozilla/5.0 Chrome Safari" },
      location: { assign, replace: vi.fn() },
    });

    await launchOAuthAuthorizeUrl(
      "apple",
      "https://example.supabase.co/auth/v1/authorize?provider=apple",
    );

    expect(browserOpen).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/authorize?provider=apple",
    );
  });
});
