import { afterEach, describe, expect, it, vi } from "vitest";

const open = vi.fn();
let native = true;
let marker: string | null = "android";

const capacitorMock = {
  isPluginAvailable: vi.fn((name: string) => name === "DibayOAuth"),
  registerPlugin: vi.fn((name: string) => {
    if (name !== "DibayOAuth") throw new Error("unknown_plugin");
    return { open };
  }),
};

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
    open.mockReset();
    capacitorMock.isPluginAvailable.mockClear();
    capacitorMock.registerPlugin.mockClear();
    native = true;
    marker = "android";
  });

  it("fetches the native start endpoint and opens the authorizeUrl with DibayOAuth", async () => {
    const assign = vi.fn();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          authorizeUrl: "https://supabase.example/auth/v1/authorize",
          provider: "google",
          redirectTo: "dibay://auth/callback?provider=google",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      Capacitor: capacitorMock,
      location: { origin: "https://samarket.vercel.app", assign },
      setTimeout,
      clearTimeout,
    });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    await startOAuthLogin({ provider: "google", next: "/market" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/oauth/start?provider=google&next=%2Fmarket&launch=native&dibay_app=android",
      expect.objectContaining({
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(capacitorMock.registerPlugin).toHaveBeenCalledWith("DibayOAuth");
    expect(open).toHaveBeenCalledWith({ url: "https://supabase.example/auth/v1/authorize" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("uses web start API navigation for non-native web flow", async () => {
    native = false;
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    startOAuthLogin({ provider: "kakao" });

    expect(assign).toHaveBeenCalledWith("/api/auth/oauth/start?provider=kakao");
  });

  it("throws clear error when native bridge is unavailable", async () => {
    capacitorMock.isPluginAvailable.mockReturnValueOnce(false);
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, authorizeUrl: "https://supabase.example/auth" }), {
        status: 200,
      }),
    ));
    vi.stubGlobal("window", {
      Capacitor: capacitorMock,
      location: { origin: "https://samarket.vercel.app", assign: vi.fn() },
      setTimeout,
      clearTimeout,
    });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    await expect(startOAuthLogin({ provider: "apple" })).rejects.toMatchObject({
      name: "browser_plugin_unavailable",
    });
  });

  it("throws for unsupported providers", async () => {
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign: vi.fn() } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    await expect(startOAuthLogin({ provider: "naver" })).rejects.toMatchObject({
      name: "invalid_provider",
    });
  });
});
