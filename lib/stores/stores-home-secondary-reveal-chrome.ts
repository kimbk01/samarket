"use client";

import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import {
  getStoresHomePullRefreshSnapshot,
  subscribeStoresHomePullRefresh,
} from "@/lib/stores/stores-home-pull-refresh-store";

/** contentTop crosses tier3Bottom — reveal (px into tier3 band) */
export const STORES_HOME_SECONDARY_REVEAL_BEFORE_PX = 4;
/** contentTop drops below tier3Bottom — collapse (hysteresis) */
export const STORES_HOME_SECONDARY_COLLAPSE_AFTER_PX = 10;

let secondaryRevealed = false;
let tier3BoundaryEl: HTMLElement | null = null;
let contentStartEl: HTMLElement | null = null;
let unsubscribeScroll: (() => void) | null = null;
let unsubscribePtr: (() => void) | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let ptrSuspended = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function isPtrGestureActive(): boolean {
  const snap = getStoresHomePullRefreshSnapshot();
  return snap.refreshing || snap.pullPx > 2;
}

function setSecondaryRevealed(next: boolean): void {
  if (secondaryRevealed === next) return;
  secondaryRevealed = next;
  notify();
}

/**
 * TIER2 reveal — geometry between tier3 bottom and scroll-content-start.
 * NO scrollTop correction · NO hero proxy.
 * @internal vitest
 */
export function resolveStoresHomeSecondaryRevealedFromGeometry(
  currentRevealed: boolean,
  contentTop: number,
  tier3Bottom: number,
  opts?: { revealBeforePx?: number; collapseAfterPx?: number }
): boolean {
  const revealBefore = opts?.revealBeforePx ?? STORES_HOME_SECONDARY_REVEAL_BEFORE_PX;
  const collapseAfter = opts?.collapseAfterPx ?? STORES_HOME_SECONDARY_COLLAPSE_AFTER_PX;
  const revealLine = tier3Bottom - revealBefore;
  const collapseLine = tier3Bottom + collapseAfter;
  if (!currentRevealed) {
    return contentTop < revealLine;
  }
  return contentTop < collapseLine;
}

function syncRevealedFromGeometry(): void {
  if (ptrSuspended || isPtrGestureActive()) return;
  if (!tier3BoundaryEl || !contentStartEl || typeof document === "undefined") return;

  const tier3Bottom = tier3BoundaryEl.getBoundingClientRect().bottom;
  const contentTop = contentStartEl.getBoundingClientRect().top;
  setSecondaryRevealed(
    resolveStoresHomeSecondaryRevealedFromGeometry(secondaryRevealed, contentTop, tier3Bottom)
  );
}

function syncPtrSuspension(): void {
  const next = isPtrGestureActive();
  if (ptrSuspended === next) return;
  ptrSuspended = next;
  if (!ptrSuspended) syncRevealedFromGeometry();
}

function scheduleGeometryRecheck(): void {
  if (typeof window === "undefined") return;
  if (resizeTimer != null) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    syncRevealedFromGeometry();
  }, 100);
}

function bindGeometry(): void {
  if (!tier3BoundaryEl || !contentStartEl || typeof window === "undefined") return;
  teardownGeometry();
  syncRevealedFromGeometry();
  unsubscribeScroll = subscribeAppShellScroll(syncRevealedFromGeometry, { passive: true });
  unsubscribePtr = subscribeStoresHomePullRefresh(syncPtrSuspension);
  window.addEventListener("resize", scheduleGeometryRecheck, { passive: true });
}

function teardownGeometry(): void {
  if (unsubscribeScroll) {
    unsubscribeScroll();
    unsubscribeScroll = null;
  }
  if (unsubscribePtr) {
    unsubscribePtr();
    unsubscribePtr = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", scheduleGeometryRecheck);
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
  }
}

/** TIER3 bottom edge — canonical secondary reveal boundary (header stack). */
export function registerStoresHomeTier3Boundary(el: HTMLElement | null): void {
  tier3BoundaryEl = el;
  if (tier3BoundaryEl && contentStartEl) bindGeometry();
}

/** Scroll-body content start — first hub child, not hero/banner proxy. */
export function registerStoresHomeScrollContentStart(el: HTMLElement | null): void {
  contentStartEl = el;
  if (tier3BoundaryEl && contentStartEl) bindGeometry();
}

export function resetStoresHomeSecondaryRevealChrome(): void {
  syncRevealedFromGeometry();
}

export function subscribeStoresHomeSecondaryRevealed(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoresHomeSecondaryRevealedSnapshot(): boolean {
  return secondaryRevealed;
}

export function getStoresHomeSecondaryRevealedServerSnapshot(): boolean {
  return false;
}

/** @internal vitest */
export function resetStoresHomeSecondaryRevealChromeForTests(): void {
  secondaryRevealed = false;
  tier3BoundaryEl = null;
  contentStartEl = null;
  ptrSuspended = false;
  teardownGeometry();
}
