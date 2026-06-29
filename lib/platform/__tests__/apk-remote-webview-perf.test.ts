import { describe, expect, it, vi } from "vitest";
import {
  APK_MAIN_TAB_ENTER_DEFER_MS,
  APK_MAIN_TAB_ENTER_DEFER_PERF_MARK_END,
  APK_MAIN_TAB_ENTER_DEFER_PERF_MARK_START,
  APK_MAIN_TAB_ENTER_DEFER_PERF_MS_KEY,
  WEB_MAIN_TAB_ENTER_DEFER_MS,
  isApkRemoteWebViewShell,
  maybeApkPrefetchBottomNavRoute,
  resolveMainTabEnterPanelDeferMs,
  shouldRunApkBottomNavRoutePrefetch,
} from "@/lib/platform/apk-remote-webview-perf";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => false),
}));

describe("apk-remote-webview-perf", () => {
  it("uses short defer on native shell", async () => {
    const { isCapacitorNativePlatform } = await import("@/lib/platform/capacitor-native");
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    expect(isApkRemoteWebViewShell()).toBe(true);
    expect(resolveMainTabEnterPanelDeferMs()).toBe(APK_MAIN_TAB_ENTER_DEFER_MS);
    expect(shouldRunApkBottomNavRoutePrefetch()).toBe(true);
  });

  it("keeps web defer at slide duration + 80ms", async () => {
    const { isCapacitorNativePlatform } = await import("@/lib/platform/capacitor-native");
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
    expect(resolveMainTabEnterPanelDeferMs()).toBe(WEB_MAIN_TAB_ENTER_DEFER_MS);
    expect(shouldRunApkBottomNavRoutePrefetch()).toBe(false);
  });

  it("skips apk prefetch when tab is active", async () => {
    const { isCapacitorNativePlatform } = await import("@/lib/platform/capacitor-native");
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    const prefetch = vi.fn();
    maybeApkPrefetchBottomNavRoute(prefetch, "/market", true);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("runs apk prefetch for inactive tab", async () => {
    const { isCapacitorNativePlatform } = await import("@/lib/platform/capacitor-native");
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    const prefetch = vi.fn();
    maybeApkPrefetchBottomNavRoute(prefetch, "/market", false);
    expect(prefetch).toHaveBeenCalledWith("/market");
  });

  it("exports perf mark keys aligned with MainShellTabContentTransition", () => {
    expect(APK_MAIN_TAB_ENTER_DEFER_PERF_MARK_START).toBe("apk_main_tab_enter_defer_start");
    expect(APK_MAIN_TAB_ENTER_DEFER_PERF_MARK_END).toBe("apk_main_tab_enter_defer_end");
    expect(APK_MAIN_TAB_ENTER_DEFER_PERF_MS_KEY).toBe("apk_main_tab_enter_defer_ms");
  });
});
