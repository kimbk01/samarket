import { afterEach, describe, expect, it, vi } from "vitest";

const { browserOpen } = vi.hoisted(() => ({
  browserOpen: vi.fn(async (_options: { url: string }) => undefined),
}));

vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: browserOpen,
  },
}));

vi.mock("@/lib/auth/oauth-launch-surface", () => ({
  waitForOAuthLaunchSurfaceAck: vi.fn(async () => true),
}));

import { launchOAuthAuthorizeUrl, launchWebOAuthNavigation } from "@/lib/auth/oauth-authorize-launch";

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
      document: { body: { appendChild: vi.fn(), removeChild: vi.fn() }, visibilityState: "visible" },
    });

    const result = await launchOAuthAuthorizeUrl(
      "kakao",
      "https://example.supabase.co/auth/v1/authorize?provider=kakao",
    );

    expect(result).toEqual({ ok: true });
    expect(browserOpen).toHaveBeenCalledWith({
      url: "https://example.supabase.co/auth/v1/authorize?provider=kakao",
    });
  });

  it("uses top-level navigation for web non-google provider", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" },
      navigator: { userAgent: "Mozilla/5.0 Chrome Safari" },
      location: { assign, replace: vi.fn() },
    });

    const result = await launchOAuthAuthorizeUrl(
      "apple",
      "https://example.supabase.co/auth/v1/authorize?provider=apple",
    );

    expect(result).toEqual({ ok: true });
    expect(browserOpen).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/authorize?provider=apple",
    );
  });

  it("launchWebOAuthNavigation avoids window.open for embedded WebView", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      open: vi.fn(),
      location: { assign },
    });

    const result = launchWebOAuthNavigation("https://accounts.google.com/o/oauth2/auth");
    expect(result).toEqual({ ok: true });
    expect(assign).toHaveBeenCalled();
  });
});
