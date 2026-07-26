"use client";

import { DIBAY_STARTUP_INTRO_DOM_ID } from "@/lib/startup/startup-constants";

export { DIBAY_STARTUP_INTRO_DOM_ID };

/**
 * Startup end-to-end timing — `window.__dibayBootMetrics`.
 * Native Android may inject nativeStart/webviewReady/firstHtml via evaluateJavascript.
 *
 * Splash hide contract (Local First Startup):
 * dismiss on **shellReady** (ConditionalAppShell mounted) — NOT feed/RSC/apiDone.
 * Local Boot Shell may dismiss native splash earlier via DibayBootBridge after shellPaint.
 * Auth/admin/account shell-less routes: firstPaint auth_shell_fallback.
 * Root error boundary: error_boundary (intro must not cover Error UI).
 * DO NOT: homeVisible-as-feed-gate · splash_safety_timeout · delay hide · minimum display duration.
 */
export type DibayBootMetrics = {
  nativeStart: number | null;
  webviewReady: number | null;
  firstHtml: number | null;
  shellPaint: number | null;
  handoffStart: number | null;
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
    __dibayStartupMetrics?: Partial<DibayBootMetrics>;
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

function emptyMetrics(): DibayBootMetrics {
  return {
    nativeStart: null,
    webviewReady: null,
    firstHtml: null,
    shellPaint: null,
    handoffStart: null,
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

function ensureMetrics(): DibayBootMetrics {
  if (typeof window === "undefined") {
    return emptyMetrics();
  }
  if (!window.__dibayBootMetrics) {
    window.__dibayBootMetrics = emptyMetrics();
  }
  // Merge any metrics written by Local Boot Shell document.
  try {
    const s = window.__dibayStartupMetrics;
    if (s) {
      if (s.shellPaint != null && window.__dibayBootMetrics.shellPaint == null) {
        window.__dibayBootMetrics.shellPaint = s.shellPaint;
      }
      if (s.handoffStart != null && window.__dibayBootMetrics.handoffStart == null) {
        window.__dibayBootMetrics.handoffStart = s.handoffStart;
      }
    }
  } catch {
    /* ignore */
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
  if (partial.shellPaint != null && m.shellPaint == null) m.shellPaint = partial.shellPaint;
  if (partial.handoffStart != null && m.handoffStart == null) m.handoffStart = partial.handoffStart;
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
/** Web intro + native splash share one app-ready signal (shellReady / auth / error). */
let appReady = false;
const appReadyListeners = new Set<() => void>();

function hideStartupIntroDom(): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(DIBAY_STARTUP_INTRO_DOM_ID);
  if (!el) return;
  el.setAttribute("data-ready", "1");
  el.setAttribute("hidden", "");
  el.setAttribute("aria-hidden", "true");
}

/**
 * Single app-ready signal — web intro hide + (via tryDismissNativeSplash) native splash.
 * Idempotent: repeated calls do not re-notify.
 */
export function markAppReady(reason: string): void {
  if (appReady) return;
  appReady = true;
  hideStartupIntroDom();
  for (const listener of appReadyListeners) {
    try {
      listener();
    } catch {
      /* ignore subscriber errors */
    }
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("dibayAppReady", { detail: { reason } })
      );
    } catch {
      /* ignore */
    }
  }
  if (typeof console !== "undefined" && typeof console.info === "function") {
    console.info(`[dibay-boot] appReady reason=${reason}`);
    console.info(`[dibay-boot] dibayAppReady reason=${reason}`);
  }
}

export function subscribeAppReady(listener: () => void): () => void {
  appReadyListeners.add(listener);
  return () => {
    appReadyListeners.delete(listener);
  };
}

export function getAppReadySnapshot(): boolean {
  return appReady;
}

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
  markAppReady(reason);

  if (typeof window === "undefined") return;

  void (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        return;
      }

      let bridgeOk = false;
      try {
        const bridge = (
          window as unknown as {
            DibayBootBridge?: {
              dismissSplash?: () => void;
              endHandoffCover?: () => void;
            };
          }
        ).DibayBootBridge;
        if (bridge?.dismissSplash) {
          bridge.dismissSplash();
          bridgeOk = true;
        }
        // Remote App Ready — remove Native Handoff Cover once (idempotent on native side).
        try {
          bridge?.endHandoffCover?.();
        } catch {
          /* ignore */
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
 * Main App Shell mounted — splash hide (Local First Startup).
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
