"use client";

import {
  FAB_SCROLL_MOVE_THRESHOLD_PX,
  FAB_SCROLL_TOP_REVEAL_Y_PX,
  resolveBottomNavScrollChromeAction,
} from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { getMainAppScrollRootCached, getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import { isMainAppScrollBodyOverflowing } from "@/lib/ui/store-detail-scroll-root";

/** TIER1 band max-height token — sync with `StoresHomeHeaderChrome` inner + PTR hint slot */
export const STORES_HOME_TIER1_BAND_MAX_H = "var(--stores-home-tier1-band-max-h, 5.5rem)";

let tier1Hidden = false;
let lastY = 0;
let subscriberCount = 0;
let unsubscribeScroll: (() => void) | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let lastCompensatedBandPx = 0;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function measureTier1BandPx(): number {
  if (typeof document === "undefined") return 0;
  const el = document.querySelector("[data-stores-home-tier1-shell]");
  if (!(el instanceof HTMLElement)) return 0;
  return el.getBoundingClientRect().height;
}

/** Header band shrink/expand must not shift scroll content — compensate scrollTop once per transition. */
function compensateScrollForTier1BandDelta(deltaPx: number): void {
  if (deltaPx === 0 || typeof window === "undefined") return;
  const root = getMainAppScrollRootCached();
  if (!(root instanceof HTMLElement)) return;
  const before = root.scrollTop;
  root.scrollTop = Math.max(0, before - deltaPx);
}

function setTier1Hidden(next: boolean): void {
  if (tier1Hidden === next) return;
  const beforeBand = lastCompensatedBandPx > 0 ? lastCompensatedBandPx : measureTier1BandPx();
  tier1Hidden = next;
  const afterBand = next ? 0 : measureTier1BandPx();
  const effectiveAfter = next ? 0 : afterBand > 0 ? afterBand : beforeBand;
  const delta = effectiveAfter - beforeBand;
  if (delta !== 0) {
    compensateScrollForTier1BandDelta(delta);
    lastCompensatedBandPx = effectiveAfter;
  }
  notify();
}

function applyTier1ScrollChrome(y: number): void {
  if (!isMainAppScrollBodyOverflowing()) {
    if (tier1Hidden) setTier1Hidden(false);
    lastY = y;
    return;
  }
  const action = resolveBottomNavScrollChromeAction(lastY, y);
  if (action === "hide") setTier1Hidden(true);
  else if (action === "reveal") setTier1Hidden(false);
  lastY = y;
}

function scheduleOverflowRecheck(): void {
  if (typeof window === "undefined") return;
  if (resizeTimer != null) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    applyTier1ScrollChrome(getMainAppScrollTop());
  }, 100);
}

function startTier1ScrollChrome(): void {
  if (unsubscribeScroll) return;
  lastY = getMainAppScrollTop();
  lastCompensatedBandPx = measureTier1BandPx();
  unsubscribeScroll = subscribeAppShellScroll(() => {
    applyTier1ScrollChrome(getMainAppScrollTop());
  });
  window.addEventListener("resize", scheduleOverflowRecheck, { passive: true });
  applyTier1ScrollChrome(lastY);
}

function stopTier1ScrollChrome(): void {
  if (unsubscribeScroll) {
    unsubscribeScroll();
    unsubscribeScroll = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", scheduleOverflowRecheck);
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
  }
  tier1Hidden = false;
  lastCompensatedBandPx = 0;
  notify();
}

/** `/stores` — TIER1 scroll hide/show (TIER3 anchor unaffected). */
export function acquireStoresHomeTier1ScrollChrome(): void {
  subscriberCount += 1;
  if (subscriberCount === 1) startTier1ScrollChrome();
}

export function releaseStoresHomeTier1ScrollChrome(): void {
  subscriberCount = Math.max(0, subscriberCount - 1);
  if (subscriberCount === 0) stopTier1ScrollChrome();
}

export function subscribeStoresHomeTier1Hidden(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoresHomeTier1HiddenSnapshot(): boolean {
  return tier1Hidden;
}

export function getStoresHomeTier1HiddenServerSnapshot(): boolean {
  return false;
}

/** @internal vitest */
export function resolveStoresHomeTier1HiddenFromScrollAction(
  currentHidden: boolean,
  lastScrollY: number,
  scrollY: number,
  overflowing: boolean
): boolean {
  if (!overflowing) return false;
  const action = resolveBottomNavScrollChromeAction(lastScrollY, scrollY);
  if (action === "hide") return true;
  if (action === "reveal") return false;
  return currentHidden;
}

/** @internal vitest */
export function resetStoresHomeTier1ScrollChromeForTests(): void {
  subscriberCount = 0;
  stopTier1ScrollChrome();
}

export { FAB_SCROLL_MOVE_THRESHOLD_PX, FAB_SCROLL_TOP_REVEAL_Y_PX };
