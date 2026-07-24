// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import {
  collectBottomNavBootPrewarmHrefs,
  resetBottomNavBootIdlePrewarmForTests,
  scheduleBottomNavBootIdlePrewarm,
  shouldBootPrewarmBottomNavHref,
} from "@/lib/main-menu/bottom-nav-boot-idle-prewarm";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: vi.fn(() => null),
}));

vi.mock("@/lib/platform/apk-remote-webview-perf", () => ({
  isApkRemoteWebViewShell: () => true,
  shouldRunApkBottomNavRoutePrefetch: () => true,
}));

// Client data prewarm must NOT be invoked at boot (contract ⑥ = code/shell only).
const clientDataPrewarmSpy = vi.fn();
vi.mock("@/lib/main-menu/bottom-nav-tap-prewarm-data", () => ({
  prewarmBottomNavTapTargetClientCache: (...a: unknown[]) => clientDataPrewarmSpy(...a),
}));

describe("bottom-nav-boot-idle-prewarm", () => {
  beforeEach(() => {
    resetBottomNavBootIdlePrewarmForTests();
    clientDataPrewarmSpy.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collects inactive tab hrefs excluding current philife shell and guest-only tabs", () => {
    const hrefs = collectBottomNavBootPrewarmHrefs("/philife", BOTTOM_NAV_ITEMS);
    expect(hrefs).not.toContain("/philife");
    expect(hrefs).toContain("/market");
    expect(hrefs).toContain("/stores");
    expect(hrefs).not.toContain("/mypage");
    expect(hrefs.some((h) => h.startsWith("/community-messenger"))).toBe(false);
    expect(hrefs.length).toBe(2);
  });

  it("skips mypage prewarm for guest", () => {
    expect(shouldBootPrewarmBottomNavHref("/mypage")).toBe(false);
  });

  it("skips messenger prewarm for guest", () => {
    expect(shouldBootPrewarmBottomNavHref("/community-messenger?section=chats")).toBe(false);
  });

  it("boot prewarm warms route code/shell only — no client data API fan-out (contract ⑥)", async () => {
    vi.useFakeTimers();
    const prefetchRoute = vi.fn();
    scheduleBottomNavBootIdlePrewarm({
      pathname: "/philife",
      tabs: BOTTOM_NAV_ITEMS,
      primaryRegion: null,
      prefetchRoute,
    });
    await vi.runAllTimersAsync();

    // route (RSC code/shell) prefetch happens for inactive tabs
    expect(prefetchRoute).toHaveBeenCalledWith("/market");
    expect(prefetchRoute).toHaveBeenCalledWith("/stores");
    // client data prewarm (full API fan-out) must NOT run at boot
    expect(clientDataPrewarmSpy).not.toHaveBeenCalled();
  });

  it("does nothing at boot when there is no route prefetcher (no data fan-out fallback)", async () => {
    vi.useFakeTimers();
    scheduleBottomNavBootIdlePrewarm({
      pathname: "/philife",
      tabs: BOTTOM_NAV_ITEMS,
      primaryRegion: null,
      prefetchRoute: undefined,
    });
    await vi.runAllTimersAsync();
    expect(clientDataPrewarmSpy).not.toHaveBeenCalled();
  });
});
