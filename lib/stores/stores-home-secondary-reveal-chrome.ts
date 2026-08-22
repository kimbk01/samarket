"use client";

import { getMainAppScrollRootCached } from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import {
  getStoreDetailAppScrollRootCached,
  invalidateStoreDetailScrollRootCache,
} from "@/lib/ui/store-detail-scroll-root";

/** TIER2 reveal — scroll past sentinel + margin */
export const STORES_HOME_SECONDARY_REVEAL_AFTER_PX = 8;
/** TIER2 collapse — scroll back above sentinel − margin (hysteresis) */
export const STORES_HOME_SECONDARY_COLLAPSE_BEFORE_PX = 12;

let secondaryRevealed = false;
let sentinelEl: HTMLElement | null = null;
let scrollRootEl: HTMLElement | null = null;
let observer: IntersectionObserver | null = null;
let unsubscribeScroll: (() => void) | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let lastCompensatedRevealPx = 0;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function measureTier2RevealBandPx(): number {
  if (typeof document === "undefined") return 0;
  const css = getComputedStyle(document.documentElement);
  const raw = css.getPropertyValue("--delivery-home-subcategory-reveal-h").trim();
  if (!raw) return 110;
  const probe = document.createElement("div");
  probe.style.height = raw;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h > 0 ? h : 110;
}

function compensateScrollForTier2BandDelta(deltaPx: number): void {
  if (deltaPx === 0 || typeof window === "undefined") return;
  const root = getMainAppScrollRootCached();
  if (!(root instanceof HTMLElement)) return;
  root.scrollTop = Math.max(0, root.scrollTop + deltaPx);
}

function setSecondaryRevealed(next: boolean): void {
  if (secondaryRevealed === next) return;
  const bandPx = measureTier2RevealBandPx();
  if (next) {
    compensateScrollForTier2BandDelta(bandPx);
    lastCompensatedRevealPx = bandPx;
  } else if (lastCompensatedRevealPx > 0) {
    compensateScrollForTier2BandDelta(-lastCompensatedRevealPx);
    lastCompensatedRevealPx = 0;
  }
  secondaryRevealed = next;
  notify();
}

/**
 * TIER2 contextual reveal — scroll past content boundary (inverted vs browse 4단 collapse).
 * @internal vitest
 */
export function resolveStoresHomeSecondaryRevealedFromScroll(
  currentRevealed: boolean,
  scrollTop: number,
  sentinelRelativeTop: number,
  opts?: { revealAfterPx?: number; collapseBeforePx?: number }
): boolean {
  const revealAfter = opts?.revealAfterPx ?? STORES_HOME_SECONDARY_REVEAL_AFTER_PX;
  const collapseBefore = opts?.collapseBeforePx ?? STORES_HOME_SECONDARY_COLLAPSE_BEFORE_PX;
  const revealAt = sentinelRelativeTop + revealAfter;
  const collapseAt = sentinelRelativeTop - collapseBefore;
  if (!currentRevealed) {
    return scrollTop >= revealAt;
  }
  return scrollTop >= collapseAt;
}

/** @internal vitest */
export function resolveStoresHomeSecondarySentinelRelativeTop(
  rootRect: Pick<DOMRectReadOnly, "top">,
  sentinelRect: Pick<DOMRectReadOnly, "top">,
  scrollTop: number
): number {
  return sentinelRect.top - rootRect.top + scrollTop;
}

function syncRevealedFromGeometry(): void {
  if (!sentinelEl || !scrollRootEl || typeof document === "undefined") return;
  const root = scrollRootEl;
  const scrollTop = root.scrollTop;
  const relativeTop = resolveStoresHomeSecondarySentinelRelativeTop(
    root.getBoundingClientRect(),
    sentinelEl.getBoundingClientRect(),
    scrollTop
  );
  setSecondaryRevealed(
    resolveStoresHomeSecondaryRevealedFromScroll(secondaryRevealed, scrollTop, relativeTop)
  );
}

function teardownObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (unsubscribeScroll) {
    unsubscribeScroll();
    unsubscribeScroll = null;
  }
  scrollRootEl = null;
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", scheduleGeometryRecheck);
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
  }
}

function scheduleGeometryRecheck(): void {
  if (typeof window === "undefined") return;
  if (resizeTimer != null) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    refreshScrollRootAndObserver();
    syncRevealedFromGeometry();
  }, 100);
}

function refreshScrollRootAndObserver(): void {
  if (!sentinelEl || typeof window === "undefined") return;
  invalidateStoreDetailScrollRootCache();
  const nextRoot = getStoreDetailAppScrollRootCached();
  if (scrollRootEl === nextRoot && observer) return;
  scrollRootEl = nextRoot;
  if (typeof IntersectionObserver === "undefined") return;
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(
    () => {
      syncRevealedFromGeometry();
    },
    { root: scrollRootEl, threshold: [0, 1] }
  );
  observer.observe(sentinelEl);
}

function bindObserver(): void {
  if (!sentinelEl || typeof window === "undefined") return;
  teardownObserver();
  invalidateStoreDetailScrollRootCache();
  scrollRootEl = getStoreDetailAppScrollRootCached();
  refreshScrollRootAndObserver();
  syncRevealedFromGeometry();
  unsubscribeScroll = subscribeAppShellScroll(syncRevealedFromGeometry, { passive: true });
  window.addEventListener("resize", scheduleGeometryRecheck, { passive: true });
}

/** Scroll-body sentinel — single boundary for TIER2 reveal authority. */
export function registerStoresHomeSecondaryRevealSentinel(el: HTMLElement | null): void {
  sentinelEl = el;
  if (el) {
    bindObserver();
    return;
  }
  if (secondaryRevealed) setSecondaryRevealed(false);
  teardownObserver();
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
  lastCompensatedRevealPx = 0;
  sentinelEl = null;
  teardownObserver();
}
