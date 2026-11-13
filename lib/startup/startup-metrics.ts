"use client";

/**
 * Startup end-to-end timing — `window.__dibayBootMetrics`.
 * Native Android may inject nativeStart/webviewReady/firstHtml via evaluateJavascript.
 *
 * Splash hide contract (Local First Startup):
 * shellReady is only the ConditionalAppShell-mounted metric. Native First Entry dismisses on
 * initialDestinationVisualReady, after the initial route has a nonblank browser presentation.
 * Local Boot Shell may dismiss native splash earlier via DibayBootBridge after shellPaint.
 * P3 (2026-11-12): server-rendered-body routes (home) dismiss earlier — the frame after FCP of the
 * server body, before hydration (`releaseNativeSplashAtServerBodyFrame`, same web dismiss signal, no timer).
 * Auth/admin/account shell-less routes: firstPaint auth_shell_fallback.
 * Root error boundary: error_boundary.
 * DO NOT: homeVisible-as-feed-gate · splash_safety_timeout · delay hide · minimum display duration.
 */

import {
  getLaunchOsReleaseOwner,
  noteDestinationShellFrame,
  noteLaunchOsReleased,
} from "@/lib/launch-intro/os-release-owner";
import { noteEntryReleased } from "@/lib/telemetry/entry-telemetry.client";
import { getLaunchDestination } from "@/lib/launch-intro/startup-destination";
import { isServerRenderedBodyPath } from "@/lib/layout/server-rendered-body-paths";

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
  initialDestinationVisualReady: number | null;
  apiDone: number | null;
  thumbnailVisible: number | null;
  thumbnailRequested: number | null;
  thumbnailLoaded: number | null;
  thumbnailDecoded: number | null;
  /** Last splash dismiss signal reason (shellReady | auth_shell_fallback | native_fallback). */
  splashDismissReason: string | null;
  /** P3: 서버 본문 첫 프레임에서 네이티브 시작 화면을 해제한 시각(hydration 전). 없으면 null. */
  serverBodySplashRelease: number | null;
};

declare global {
  interface Window {
    __dibayBootMetrics?: DibayBootMetrics;
    __dibayStartupMetrics?: Partial<DibayBootMetrics>;
    __dibayNativeSplashDismiss?: () => void;
  }
}

/**
 * Main shell 없는 경로 — shellReady 미발화 시 firstPaint 에서 splash 해제.
 * `app/` 최상위 경로 중 `(main)` 밖의 페이지 세그먼트는 모두 여기 있어야 한다 (해제 주체 0 경로 금지 —
 * `lib/startup/__tests__/splash-release-owner-coverage.test.ts`). `/dev` 는 2026-11-08 C2 에서 추가.
 */
export const SPLASH_AUTH_SHELL_FALLBACK_PREFIXES = [
  "/login",
  "/signup",
  "/auth",
  "/account",
  "/admin",
  "/terms",
  "/privacy",
  "/dev",
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

export function isSplashAuthShellFallbackPath(pathname: string): boolean {
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
    initialDestinationVisualReady: null,
    apiDone: null,
    thumbnailVisible: null,
    thumbnailRequested: null,
    thumbnailLoaded: null,
    thumbnailDecoded: null,
    splashDismissReason: null,
    serverBodySplashRelease: null,
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
  if (partial.initialDestinationVisualReady != null && m.initialDestinationVisualReady == null) {
    m.initialDestinationVisualReady = partial.initialDestinationVisualReady;
  }
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

/**
 * Single app-ready signal — (via tryDismissNativeSplash) native splash.
 * Idempotent: repeated calls do not re-notify.
 * Intro product DOM ownership is gone (R15 ABSOLUTE ZERO).
 */
export function markAppReady(reason: string): void {
  if (appReady) return;
  appReady = true;
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
  noteLaunchOsReleased();
  setMetric("splashDismissReason", reason);
  // C8 관측 — 해제 동작에 영향 없음 (예외 삼킴·유휴 시점 송신).
  noteEntryReleased(reason);
  markAppReady(reason);
  // Unblock deferred cold-start network even when auth_shell_fallback skipped markBootMetricsShellReady.
  shellReadyMarked = true;
  flushShellReadyWaiters();

  if (typeof window === "undefined") return;
  dismissNativeSplashBridges(reason);
}

/**
 * 네이티브 시작 화면 해제(브리지 호출)만 — 문서당 1회. P3 의 서버 본문 첫 프레임 해제가 먼저 불렀으면
 * 화면 준비 뒤 `tryDismissNativeSplash` 는 이 부분을 건너뛰고 기록·앱 준비 처리만 한다.
 */
let nativeSplashBridgesDismissed = false;
function dismissNativeSplashBridges(reason: string): void {
  if (nativeSplashBridgesDismissed) return;
  nativeSplashBridgesDismissed = true;

  /**
   * C2 (docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4): 네이티브 브리지는 **즉시·동기로** 부른다.
   * 브리지는 네이티브 앱에서만 존재하므로(웹·Windows 셸은 undefined → 무동작) Capacitor 판정 import 가 필요 없다.
   * 이전에는 Capacitor 코어 모듈 동적 불러오기를 기다린 뒤에 불러, 그 청크가 실패하면 해제도 실패했다 (R1-e).
   */
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

  // R17-OS iOS — release the app-native LaunchScreen continuation
  // (DibayRootBridgeViewController) after the current frame has been presented.
  // Frame fence only: no timer, no network/data wait. Android uses DibayBootBridge above.
  try {
    const wkBootBridge = (
      window as unknown as {
        webkit?: {
          messageHandlers?: {
            DibayBootBridge?: { postMessage: (msg: unknown) => void };
          };
        };
      }
    ).webkit?.messageHandlers?.DibayBootBridge;
    if (wkBootBridge?.postMessage) {
      const postDismiss = () => {
        try {
          wkBootBridge.postMessage({ action: "dismissSplash" });
        } catch {
          /* ignore */
        }
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => requestAnimationFrame(postDismiss));
      } else {
        postDismiss();
      }
    }
  } catch {
    /* ignore */
  }

  // Cap SplashScreen plugin hide — launchShowDuration 0 이라 보조 경로. 실패해도 위 브리지 해제는 이미 끝났다.
  void (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        return;
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

/** 서버가 그린 본문이 문서에 있는지 — 본문 자리가 회색 줄(`MainShellDocumentLoading`)이 아니어야 한다 */
export function hasServerRenderedBody(doc: Document): boolean {
  const body = doc.querySelector("[data-main-hub-scroll-body]");
  return Boolean(body) && !doc.querySelector("[data-main-shell-document-loading]");
}

/**
 * P3 (Owner 「P3 진행」 2026-11-12 · docs/audit/ssr-page-body-first-paint-design-2026-11-12.md P3):
 * 서버가 본문까지 그린 화면(허용 목록 = 홈)은 hydration 을 기다리지 않고 **서버 본문이 그려진 다음 프레임**에서
 * 네이티브 시작 화면을 해제한다. 해제 권한은 같은 웹 성공 신호(진입 HARD LOCK H1 ①) — 시점만 앞당김, 타이머 없음.
 * - 인트로가 해제를 맡는 문서(계약 §9)면 하지 않는다 — 판단은 단일 모듈 `getLaunchDestination`.
 * - 기록·앱 준비(`markAppReady`)·미뤄 둔 요청 시작은 화면 준비 뒤 기존 경로(`tryDismissNativeSplash`) 그대로.
 * 호출: `instrumentation-client.ts`(hydration 전 실행).
 */
export function releaseNativeSplashAtServerBodyFrame(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (nativeSplashBridgesDismissed || splashDismissAttempted) return;
  if (!isServerRenderedBodyPath(window.location.pathname)) return;
  if (getLaunchDestination().destination !== "community") return;
  if (typeof requestAnimationFrame !== "function" || typeof performance?.getEntriesByName !== "function") return;
  /**
   * 「빈 화면 아닌 첫 그림」 = 첫 글자 표시(FCP) 이후 — 글꼴이 늦게 붙어 글자 없는 프레임에서 걷히지 않게.
   * FCP 알림(PerformanceObserver)은 hydration 작업 뒤로 밀려 늦으므로, 프레임마다 FCP 기록을 직접 확인한다.
   * 서버 본문 존재 판단도 그 시점에(이 훅은 문서 해석 중에 돌 수 있음). 타이머 없음 — 기존 경로가 먼저 해제하면 멈춘다.
   */
  const tick = () => {
    if (nativeSplashBridgesDismissed || splashDismissAttempted) return;
    if (performance.getEntriesByName("first-contentful-paint").length === 0) {
      requestAnimationFrame(tick);
      return;
    }
    if (!isServerRenderedBodyPath(window.location.pathname) || !hasServerRenderedBody(document)) return;
    requestAnimationFrame(() => {
      if (nativeSplashBridgesDismissed || splashDismissAttempted) return;
      setMetric("serverBodySplashRelease", nowMs());
      dismissNativeSplashBridges("serverBodyFirstFrame");
    });
  };
  requestAnimationFrame(tick);
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
let initialDestinationVisualReadyMarked = false;
const shellReadyWaiters: Array<() => void> = [];

function flushShellReadyWaiters(): void {
  const waiters = shellReadyWaiters.splice(0, shellReadyWaiters.length);
  for (const run of waiters) {
    try {
      run();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Main App Shell mounted — metric/cache gate only.
 * Does not dismiss Native First Entry; destination visual readiness owns that.
 */
export function markBootMetricsShellReady(): void {
  if (shellReadyMarked) return;
  shellReadyMarked = true;
  const t = nowMs();
  setMetric("shellReady", t);
  setMetric("homeVisible", t);
  flushShellReadyWaiters();
}

/**
 * Initial destination has a legitimate nonblank browser frame ready to replace Native FE.
 * This is the single-purpose HOME_PRESENTATION_READY producer for Intro handoff.
 * Not API completion, image completion, interactivity, network idle, shellReady alone,
 * React mounted, or DOM ready.
 */
export function markInitialDestinationVisualReady(): void {
  // Every painted destination frame is reported (Intro exit handoff waits for it); OS release below stays once.
  if (typeof window !== "undefined") noteDestinationShellFrame(window.location.pathname);
  if (initialDestinationVisualReadyMarked) return;
  // Intro contract §9: when the launch destination is INTRO, Community's initial-destination
  // signal does not own the OS release (Community is normally not even mounted then — DEFERRED MOUNT).
  if (getLaunchOsReleaseOwner() !== "community") return;
  initialDestinationVisualReadyMarked = true;
  setMetric("initialDestinationVisualReady", nowMs());
  notifyNativeHomePresentationReady();
  tryDismissNativeSplash("initialDestinationVisualReady");
}

/**
 * Intro contract §9 — the INTRO destination's first meaningful painted frame releases the OS.
 * Same native path as the Community release (homePresentationReady + dismissSplash), once.
 * Only the current owner can release; returns false when INTRO does not own the release.
 */
export function releaseOsForLaunchIntro(): boolean {
  if (getLaunchOsReleaseOwner() !== "intro") return false;
  if (initialDestinationVisualReadyMarked) return false;
  initialDestinationVisualReadyMarked = true;
  setMetric("initialDestinationVisualReady", nowMs());
  notifyNativeHomePresentationReady();
  tryDismissNativeSplash("launchIntroFirstFrame");
  return true;
}

/**
 * Notify native Intro runtime that Home is presentation-ready.
 * Consumer: Android MainActivity DibayBootBridge (REBUILD 14 ZERO: no iOS StartupBridge).
 */
function notifyNativeHomePresentationReady(): void {
  if (typeof window === "undefined") return;
  if (typeof console !== "undefined" && typeof console.info === "function") {
    console.info("[dibay-boot] HOME_PRESENTATION_READY producer=initialDestinationVisualReady");
  }
  void (async () => {
    try {
      const bridge = (
        window as unknown as {
          DibayBootBridge?: {
            homePresentationReady?: () => void;
          };
          webkit?: {
            messageHandlers?: {
              DibayBootBridge?: { postMessage: (msg: unknown) => void };
            };
          };
        }
      ).DibayBootBridge;
      if (bridge?.homePresentationReady) {
        bridge.homePresentationReady();
        return;
      }
      const wk = (
        window as unknown as {
          webkit?: {
            messageHandlers?: {
              DibayBootBridge?: { postMessage: (msg: unknown) => void };
            };
          };
        }
      ).webkit?.messageHandlers?.DibayBootBridge;
      if (wk?.postMessage) {
        wk.postMessage({ action: "homePresentationReady" });
      }
    } catch {
      /* ignore — native may not be present on web */
    }
  })();
}

export function isInitialDestinationVisualReady(): boolean {
  return initialDestinationVisualReadyMarked;
}

/** True after ConditionalAppShell (or auth splash fallback) marked ready. */
export function isAppShellReady(): boolean {
  return shellReadyMarked;
}

/**
 * Run after shellReady so cold-start feed/network does not race splash hydrate.
 * If shell is already ready, runs on next macrotask.
 */
export function whenAppShellReady(run: () => void): () => void {
  if (typeof window === "undefined") {
    run();
    return () => undefined;
  }
  if (shellReadyMarked) {
    const t = window.setTimeout(run, 0);
    return () => window.clearTimeout(t);
  }
  shellReadyWaiters.push(run);
  return () => {
    const i = shellReadyWaiters.indexOf(run);
    if (i >= 0) shellReadyWaiters.splice(i, 1);
  };
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
