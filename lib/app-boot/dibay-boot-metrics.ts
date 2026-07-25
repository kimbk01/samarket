"use client";

/**
 * Cold boot end-to-end timing — `window.__dibayBootMetrics`.
 * Native Android may inject nativeStart/webviewReady/firstHtml via evaluateJavascript.
 *
 * Splash hide contract (Cold Boot Shell-First):
 * dismiss on **shellReady** (ConditionalAppShell mounted) — NOT feed/RSC/apiDone.
 * Auth/admin/account shell-less routes: firstPaint auth_shell_fallback.
 * DO NOT: homeVisible-as-feed-gate · splash_safety_timeout · delay hide.
 */
export type DibayBootMetrics = {
  nativeStart: number | null;
  webviewReady: number | null;
  firstHtml: number | null;
  firstPaint: number | null;
  reactMounted: number | null;
  /** @deprecated alias kept for metrics readers — same as shellReady */
  homeVisible: number | null;
  shellReady: number | null;
  apiDone: number | null;
  thumbnailVisible: number | null;
  thumbnailRequested: number | null;
  thumbnailLoaded: number | null;
  thumbnailDecoded: number | null;
  /** Last splash dismiss signal reason (shellReady | auth_shell_fallback | native_fallback). */
  splashDismissReason: string | null;
};

declare global {
  interface Window {
    __dibayBootMetrics?: DibayBootMetrics;
    __dibayNativeSplashDismiss?: () => void;
  }
}

/** Main shell 없는 경로 — shellReady 미발화 시 firstPaint 에서 splash 해제 */
const SPLASH_AUTH_SHELL_FALLBACK_PREFIXES = [
  "/login",
  "/signup",
  "/auth",
  "/account",
  "/admin",
  "/terms",
  "/privacy",
] as const;

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
      shellReady: null,
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
      shellReady: null,
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
  if (partial.shellReady != null && m.shellReady == null) m.shellReady = partial.shellReady;
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

/** Splash hide — shellReady 또는 auth shell fallback 에서만 호출. */
export function tryDismissNativeSplash(reason: string): void {
  if (splashDismissAttempted) return;
  splashDismissAttempted = true;
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
}

let shellReadyMarked = false;

/**
 * Main App Shell mounted — splash hide (Cold Boot Shell-First).
 * Feed/RSC/api 완료를 기다리지 않는다.
 */
export function markBootMetricsShellReady(): void {
  if (shellReadyMarked) return;
  shellReadyMarked = true;
  const t = nowMs();
  setMetric("shellReady", t);
  setMetric("homeVisible", t);
  tryDismissNativeSplash("shellReady");
}

/** @deprecated use markBootMetricsShellReady — kept for import stability */
export function markBootMetricsHomeVisible(): void {
  markBootMetricsShellReady();
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
