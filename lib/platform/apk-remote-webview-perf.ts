import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { MAIN_SHELL_ROUTE_TRANSITION_MS } from "@/components/route-transition/route-transition-config";

/** APK pending enter panel — 슬라이드(440ms)와 병렬로 본문만 빠르게 마운트 */
export const APK_MAIN_TAB_ENTER_DEFER_MS = 96;

/** `MainShellTabContentTransition` · logcat/Performance — 이름 SSOT */
export const APK_MAIN_TAB_ENTER_DEFER_PERF_MARK_START = "apk_main_tab_enter_defer_start";
export const APK_MAIN_TAB_ENTER_DEFER_PERF_MARK_END = "apk_main_tab_enter_defer_end";
export const APK_MAIN_TAB_ENTER_DEFER_PERF_MS_KEY = "apk_main_tab_enter_defer_ms";

/** 웹 브라우저 — push 애니메이션 종료 후 본문 교체(기존 계약) */
export const WEB_MAIN_TAB_ENTER_DEFER_MS = MAIN_SHELL_ROUTE_TRANSITION_MS + 80;

/** Capacitor APK/iOS 원격 WebView 셸 */
export function isApkRemoteWebViewShell(): boolean {
  return isCapacitorNativePlatform();
}

export function resolveMainTabEnterPanelDeferMs(): number {
  return isApkRemoteWebViewShell() ? APK_MAIN_TAB_ENTER_DEFER_MS : WEB_MAIN_TAB_ENTER_DEFER_MS;
}

/** APK 한정 — 하단 탭 RSC `router.prefetch` (웹 Link prefetch=false 유지) */
export function shouldRunApkBottomNavRoutePrefetch(): boolean {
  return isApkRemoteWebViewShell();
}

export function maybeApkPrefetchBottomNavRoute(
  prefetch: ((href: string) => void) | undefined,
  href: string,
  isActive: boolean,
): void {
  if (isActive || !prefetch) return;
  if (!shouldRunApkBottomNavRoutePrefetch()) return;
  const target = href.trim();
  if (!target) return;
  try {
    prefetch(target);
  } catch {
    /* ignore */
  }
}
