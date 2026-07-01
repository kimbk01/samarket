"use client";

/**
 * Cold boot end-to-end timing — `window.__dibayBootMetrics`.
 * Native Android injects nativeStart/webviewReady/firstHtml via evaluateJavascript.
 *
 * Splash hide contract: dismiss on homeVisible (main shell ready).
 * Auth/admin/account shell-less routes: firstPaint auth_shell_fallback.
 * Safety: 5s cap if homeVisible never fires. Native enforces 3s max keep with logged fallback.
 */
export type DibayBootMetrics = {
  nativeStart: number | null;
  webviewReady: number | null;
  firstHtml: number | null;
  firstPaint: number | null;
  reactMounted: number | null;
  homeVisible: number | null;
  apiDone: number | null;
  thumbnailVisible: number | null;
  thumbnailRequested: number | null;
  thumbnailLoaded: number | null;
  thumbnailDecoded: number | null;
  /** Last splash dismiss signal reason (homeVisible | auth_shell_fallback | splash_safety_timeout | native_fallback). */
  splashDismissReason: string | null;
};

declare global {
  interface Window {
    __dibayBootMetrics?: DibayBootMetrics;
    __dibayNativeSplashDismiss?: () => void;
  }
}

/** Main shell 없는 경로 — homeVisible 미발화 infinite splash 방지 (JS only). */
const SPLASH_AUTH_SHELL_FALLBACK_PREFIXES = [
  "/login",
  "/signup",
  "/auth",
  "/account",
  "/admin",
  "/terms",
  "/privacy",
] as const;

/** homeVisible 미도달 시 Capacitor splash 강제 hide (infinite splash 재발 방지). */
const SPLASH_SAFETY_TIMEOUT_MS = 5_000;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function normalizeBootPathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) return "/";
  const qIdx = trimmed.indexOf("?");
  const base = qIdx >= 0 ? trimmed.slice(0, qIdx) : trimmed;
  return base.replace(/\/+$/, "") || "/";
}

function readBootPathname(): string {
  if (typeof window === "undefined") return "/";
  return normalizeBootPathname(window.location.pathname ?? "/");
}

function isSplashAuthShellFallbackPath(pathname: string): boolean {
  const p = normalizeBootPathname(pathname);
  for (const prefix of SPLASH_AUTH_SHELL_FALLBACK_PREFIXES) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

function ensureMetrics(): DibayBootMetrics {
  if (typeof window === "undefined") {
    return {
      nativeStart: null,
      webviewReady: null,
      firstHtml: null,
      firstPaint: null,
      reactMounted: null,
      homeVisible: null,
      apiDone: null,
      thumbnailVisible: null,
      thumbnailRequested: null,
      thumbnailLoaded: null,
      thumbnailDecoded: null,
      splashDismissReason: null,
    };
  }
  if (!window.__dibayBootMetrics) {
    window.__dibayBootMetrics = {
      nativeStart: null,
      webviewReady: null,
      firstHtml: null,
      firstPaint: null,
      reactMounted: null,
      homeVisible: null,
      apiDone: null,
      thumbnailVisible: null,
      thumbnailRequested: null,
      thumbnailLoaded: null,
      thumbnailDecoded: null,
      splashDismissReason: null,
    };
  }
  return window.__dibayBootMetrics;
}

function setMetric<K extends keyof DibayBootMetrics>(key: K, value: DibayBootMetrics[K]): void {
  const m = ensureMetrics();
  if (m[key] == null) {
    m[key] = value;
  }
}

export function mergeNativeBootMetrics(partial: Partial<DibayBootMetrics>): void {
  const m = ensureMetrics();
  if (partial.nativeStart != null && m.nativeStart == null) m.nativeStart = partial.nativeStart;
  if (partial.webviewReady != null && m.webviewReady == null) m.webviewReady = partial.webviewReady;
  if (partial.firstHtml != null && m.firstHtml == null) m.firstHtml = partial.firstHtml;
  if (partial.firstPaint != null && m.firstPaint == null) m.firstPaint = partial.firstPaint;
  if (partial.reactMounted != null && m.reactMounted == null) m.reactMounted = partial.reactMounted;
  if (partial.homeVisible != null && m.homeVisible == null) m.homeVisible = partial.homeVisible;
  if (partial.apiDone != null && m.apiDone == null) m.apiDone = partial.apiDone;
  if (partial.thumbnailVisible != null && m.thumbnailVisible == null) {
    m.thumbnailVisible = partial.thumbnailVisible;
  }
  if (partial.thumbnailRequested != null && m.thumbnailRequested == null) {
    m.thumbnailRequested = partial.thumbnailRequested;
  }
  if (partial.thumbnailLoaded != null && m.thumbnailLoaded == null) {
    m.thumbnailLoaded = partial.thumbnailLoaded;
  }
  if (partial.thumbnailDecoded != null && m.thumbnailDecoded == null) {
    m.thumbnailDecoded = partial.thumbnailDecoded;
  }
  if (partial.splashDismissReason != null && m.splashDismissReason == null) {
    m.splashDismissReason = partial.splashDismissReason;
  }
}

let splashDismissAttempted = false;
let splashSafetyTimeoutId: number | null = null;

function clearSplashSafetyTimeout(): void {
  if (splashSafetyTimeoutId == null) return;
  clearTimeout(splashSafetyTimeoutId);
  splashSafetyTimeoutId = null;
}

function logSplashDismiss(reason: string, ok: boolean, detail?: string): void {
  const msg = `[dibay-boot] dismissSplash reason=${reason} ok=${ok}${detail ? ` detail=${detail}` : ""}`;
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(msg);
  }
}

/** Splash hide — main shell homeVisible 또는 auth/safety fallback 경로에서만 호출. */
export function tryDismissNativeSplash(reason: string): void {
  if (splashDismissAttempted) return;
  splashDismissAttempted = true;
  clearSplashSafetyTimeout();
  setMetric("splashDismissReason", reason);

  if (typeof window === "undefined") return;

  void (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        return;
      }

      let bridgeOk = false;
      try {
        const bridge = (window as unknown as { DibayBootBridge?: { dismissSplash?: () => void } })
          .DibayBootBridge;
        if (bridge?.dismissSplash) {
          bridge.dismissSplash();
          bridgeOk = true;
        }
      } catch (e) {
        logSplashDismiss(reason, false, `DibayBootBridge err=${String(e)}`);
      }

      try {
        window.__dibayNativeSplashDismiss?.();
      } catch {
        /* ignore */
      }

      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
        logSplashDismiss(reason, true, bridgeOk ? "bridge+capacitor" : "capacitor-only");
      } catch (e) {
        logSplashDismiss(reason, bridgeOk, `capacitor err=${String(e)}`);
      }

      if (bridgeOk) {
        logSplashDismiss(reason, true, "bridge");
      } else if (!(window as unknown as { DibayBootBridge?: unknown }).DibayBootBridge) {
        logSplashDismiss(reason, false, "DibayBootBridge missing");
      }
    } catch {
      /* web / capacitor load 실패 — 스플래시 없음 */
    }
  })();
}

function tryAuthShellSplashFallback(): void {
  if (splashDismissAttempted) return;
  if (!isSplashAuthShellFallbackPath(readBootPathname())) return;
  tryDismissNativeSplash("auth_shell_fallback");
}

function scheduleSplashSafetyTimeout(): void {
  if (typeof window === "undefined") return;
  if (splashSafetyTimeoutId != null) return;
  splashSafetyTimeoutId = window.setTimeout(() => {
    splashSafetyTimeoutId = null;
    if (splashDismissAttempted || homeVisibleMarked) return;
    tryDismissNativeSplash("splash_safety_timeout");
  }, SPLASH_SAFETY_TIMEOUT_MS);
}

export function markBootMetricsFirstPaint(): void {
  setMetric("firstPaint", nowMs());
  tryAuthShellSplashFallback();
  void recordPaintTimingFromObserver();
}

async function recordPaintTimingFromObserver(): Promise<void> {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const entries = performance.getEntriesByType("paint");
    const fp = entries.find((e) => e.name === "first-paint");
    if (fp && ensureMetrics().firstPaint == null) {
      ensureMetrics().firstPaint = fp.startTime;
    }
  } catch {
    /* ignore */
  }
}

export function markBootMetricsReactMounted(): void {
  setMetric("reactMounted", nowMs());
  scheduleSplashSafetyTimeout();
}

let homeVisibleMarked = false;

/** Main shell paint — splash hide 트리거 (Boot P0 homeVisible gate). */
export function markBootMetricsHomeVisible(): void {
  if (homeVisibleMarked) return;
  homeVisibleMarked = true;
  setMetric("homeVisible", nowMs());
  tryDismissNativeSplash("homeVisible");
}

export function markBootMetricsApiDone(): void {
  setMetric("apiDone", nowMs());
}

export function markBootMetricsThumbnailVisible(): void {
  setMetric("thumbnailVisible", nowMs());
}

let bootThumbRequested = false;
let bootThumbLoaded = false;
let bootThumbDecoded = false;

/** First feed LCP thumb — metrics only, not a render gate. */
export function markBootMetricsThumbnailRequested(): void {
  if (bootThumbRequested) return;
  bootThumbRequested = true;
  setMetric("thumbnailRequested", nowMs());
}

export function markBootMetricsThumbnailLoaded(): void {
  if (bootThumbLoaded) return;
  bootThumbLoaded = true;
  setMetric("thumbnailLoaded", nowMs());
  markBootMetricsThumbnailVisible();
}

export function markBootMetricsThumbnailDecoded(): void {
  if (bootThumbDecoded) return;
  bootThumbDecoded = true;
  setMetric("thumbnailDecoded", nowMs());
}

export function getDibayBootMetrics(): Readonly<DibayBootMetrics> {
  return { ...ensureMetrics() };
}
