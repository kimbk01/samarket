import { afterEach, describe, expect, it, vi } from "vitest";

const browserOpen = vi.fn(async () => undefined);
const browserClose = vi.fn(async () => undefined);
let native = true;
let marker: string | null = "android";

vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: browserOpen,
    close: browserClose,
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
    browserOpen.mockClear();
    browserClose.mockClear();
    native = true;
    marker = "android";
    const mod = await import("@/lib/auth/oauth/start-oauth-login");
    mod.resetNativeOAuthStateForTests();
  });

  it("fetches launch=native JSON and opens authorizeUrl in Custom Tab", async () => {
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

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    await startOAuthLogin({ provider: "google", next: "/market" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/oauth/start?provider=google&launch=native&next=%2Fmarket&dibay_app=android",
      expect.objectContaining({
        credentials: "include",
        headers: { Accept: "application/json" },
      }),
    );
    expect(browserOpen).toHaveBeenCalledWith({ url: "https://supabase.example/auth/v1/authorize" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("opens prefetched authorizeUrl without fetch on user gesture path", async () => {
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
      location: { origin: "https://samarket.vercel.app", assign: vi.fn() },
      setTimeout,
      clearTimeout,
    });

    const mod = await import("@/lib/auth/oauth/start-oauth-login");
    mod.prefetchNativeOAuthAuthorizeUrl("google", "/market");
    await new Promise((resolve) => setTimeout(resolve, 0));
    fetchMock.mockClear();

    await mod.openPrefetchedNativeOAuthFromUserGesture("google", "/market");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(browserOpen).toHaveBeenCalledWith({
      url: "https://supabase.example/auth/v1/authorize?prefetched=1",
    });
  });

  it("uses web start API navigation for non-native web flow", async () => {
    native = false;
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://samarket.vercel.app", assign } });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    await startOAuthLogin({ provider: "kakao" });

    expect(assign).toHaveBeenCalledWith("/api/auth/oauth/start?provider=kakao");
  });

  it("throws when Browser.open fails", async () => {
    browserOpen.mockRejectedValueOnce(new Error("browser_unavailable"));
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, authorizeUrl: "https://supabase.example/auth" }), {
        status: 200,
      }),
    ));
    vi.stubGlobal("window", {
      location: { origin: "https://samarket.vercel.app", assign: vi.fn() },
      setTimeout,
      clearTimeout,
    });

    const { startOAuthLogin } = await import("@/lib/auth/oauth/start-oauth-login");
    await expect(startOAuthLogin({ provider: "apple" })).rejects.toMatchObject({
      name: "browser_open_rejected",
    });
  });
});
