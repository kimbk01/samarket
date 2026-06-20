"use client";

/**
 * Cold boot end-to-end timing — `window.__dibayBootMetrics`.
 * Native Android injects nativeStart/webviewReady/firstHtml via evaluateJavascript.
 *
 * Splash hide contract (hotfix): dismiss on reactMounted | firstPaint — NOT homeVisible.
 * homeVisible is metrics-only. Native enforces 3s max keep with logged fallback.
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
  /** Last splash dismiss signal reason (reactMounted | firstPaint | native_fallback). */
  splashDismissReason: string | null;
};

declare global {
  interface Window {
    __dibayBootMetrics?: DibayBootMetrics;
    __dibayNativeSplashDismiss?: () => void;
  }
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
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

function logSplashDismiss(reason: string, ok: boolean, detail?: string): void {
  const msg = `[dibay-boot] dismissSplash reason=${reason} ok=${ok}${detail ? ` detail=${detail}` : ""}`;
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(msg);
  }
}

/** Splash hide — gate 아님. reactMounted / firstPaint 에서 호출. */
export function tryDismissNativeSplash(reason: string): void {
  if (splashDismissAttempted) return;
  splashDismissAttempted = true;
  setMetric("splashDismissReason", reason);

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

  void (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        logSplashDismiss(reason, bridgeOk, "web-skip");
        return;
      }
      const { SplashScreen } = await import("@capacitor/splash-screen");
      await SplashScreen.hide();
      logSplashDismiss(reason, true, bridgeOk ? "bridge+capacitor" : "capacitor-only");
    } catch (e) {
      logSplashDismiss(reason, bridgeOk, `capacitor err=${String(e)}`);
    }
  })();

  if (bridgeOk) {
    logSplashDismiss(reason, true, "bridge");
  } else if (typeof window !== "undefined" && !(window as unknown as { DibayBootBridge?: unknown }).DibayBootBridge) {
    logSplashDismiss(reason, false, "DibayBootBridge missing");
  }
}

export function markBootMetricsFirstPaint(): void {
  setMetric("firstPaint", nowMs());
  tryDismissNativeSplash("firstPaint");
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
  tryDismissNativeSplash("reactMounted");
}

let homeVisibleMarked = false;

/** Metrics only — splash hide 트리거 아님. */
export function markBootMetricsHomeVisible(): void {
  if (homeVisibleMarked) return;
  homeVisibleMarked = true;
  setMetric("homeVisible", nowMs());
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
