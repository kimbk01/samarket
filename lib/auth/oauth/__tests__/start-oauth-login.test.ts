import { afterEach, describe, expect, it, vi } from "vitest";

const browserOpen = vi.fn();
let native = true;
let marker: string | null = "android";

vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: (...args: unknown[]) => browserOpen(...args),
  },
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  DIBAY_APP_MARKER_PARAM: "dibay_app",
  ensureCapacitorNativeMarkerOnBoot: vi.fn(),
  isCapacitorNativePlatform: () => native,
  readDibayAppPlatformMarker: () => marker,
}));

describe("startOAuthLogin", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    browserOpen.mockReset();
    native = true;
    marker = "android";
    const mod = await import("@/lib/auth/oauth/start-oauth-login");
    mod.resetNativeOAuthStateForTests();
  });

  it("fetches the native start endpoint and opens the authorizeUrl with Browser", async () => {
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
      location: { origin: "https://samarket.vercel.app", assign },
      setTimeout,
      clearTimeout,
    });

    const mod = await import("@/lib/auth/oauth/start-oauth-login");
    mod.preloadOAuthBrowser();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await mod.startOAuthLogin({ provider: "google", next: "/market" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/oauth/start?provider=google&next=%2Fmarket&launch=native&dibay_app=android",
      expect.objectContaining({
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(browserOpen).toHaveBeenCalledWith({ url: "https://supabase.example/auth/v1/authorize" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("opens prefetched authorizeUrl without waiting for fetch on tap", async () => {
    const assign = vi.fn();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          authorizeUrl: "https://supabase.example/auth/v1/authorize?prefetched=1",
          provider: "google",
          redirectTo: "dibay://auth/callback?provider=google",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      location: { origin: "https://samarket.vercel.app", assign },
      setTimeout,
      clearTimeout,
    });

    const mod = await import("@/lib/auth/oauth/start-oauth-login");
    mod.preloadOAuthBrowser();
    mod.prefetchNativeOAuthAuthorizeUrl("google", "/market");
    await new Promise((resolve) => setTimeout(resolve, 0));
    fetchMock.mockClear();

    await mod.startOAuthLogin({ provider: "google", next: "/market" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(browserOpen).toHaveBeenCalledWith({ url: "https://supabase.example/auth/v1/authorize?prefetched=1" });
  });

  it("uses web start API navigation for non-native web flow", async () => {
    native = false;
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    startOAuthLogin({ provider: "kakao" });

    expect(assign).toHaveBeenCalledWith("/api/auth/oauth/start?provider=kakao");
  });

  it("returns false from sync open when Browser plugin is not preloaded", async () => {
    const mod = await import("@/lib/auth/oauth/start-oauth-login");
    expect(mod.openNativeOAuthBrowserSync("https://supabase.example/auth")).toBe(false);
  });

  it("throws for unsupported providers", async () => {
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign: vi.fn() } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    await expect(startOAuthLogin({ provider: "naver" })).rejects.toMatchObject({
      name: "invalid_provider",
    });
  });
});
