"use client";

import {
  resolveBottomNavScrollChromeAction,
} from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import {
  getStoresHomePullRefreshSnapshot,
  subscribeStoresHomePullRefresh,
} from "@/lib/stores/stores-home-pull-refresh-store";
import { isMainAppScrollBodyOverflowing } from "@/lib/ui/store-detail-scroll-root";

export type StoresHomeHeaderMotionPhase =
  | "TOP"
  | "DOWN_INTENT"
  | "TIER1_HIDDEN"
  | "UP_INTENT";

let tier1Hidden = false;
let lastY = 0;
let subscriberCount = 0;
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

function setTier1Hidden(next: boolean): void {
  if (tier1Hidden === next) return;
  tier1Hidden = next;
  notify();
}

function resolveMotionPhase(hidden: boolean, lastScrollY: number, scrollY: number): StoresHomeHeaderMotionPhase {
  if (scrollY < 16) return "TOP";
  if (hidden) return "TIER1_HIDDEN";
  const action = resolveBottomNavScrollChromeAction(lastScrollY, scrollY);
  if (action === "hide") return "DOWN_INTENT";
  if (action === "reveal") return "UP_INTENT";
  return hidden ? "TIER1_HIDDEN" : "TOP";
}

function applyTier1ScrollChrome(y: number): void {
  if (ptrSuspended || isPtrGestureActive()) return;

  if (!isMainAppScrollBodyOverflowing()) {
    if (tier1Hidden) setTier1Hidden(false);
    lastY = y;
    return;
  }

  const action = resolveBottomNavScrollChromeAction(lastY, y);
  if (action === "hide") setTier1Hidden(true);
  else if (action === "reveal") setTier1Hidden(false);
  lastY = y;
  void resolveMotionPhase(tier1Hidden, lastY, y);
}

function scheduleOverflowRecheck(): void {
  if (typeof window === "undefined") return;
  if (resizeTimer != null) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    applyTier1ScrollChrome(getMainAppScrollTop());
  }, 100);
}

function syncPtrSuspension(): void {
  const next = isPtrGestureActive();
  if (ptrSuspended === next) return;
  ptrSuspended = next;
  if (!ptrSuspended) {
    applyTier1ScrollChrome(getMainAppScrollTop());
  }
}

function startTier1ScrollChrome(): void {
  if (unsubscribeScroll) return;
  lastY = getMainAppScrollTop();
  unsubscribeScroll = subscribeAppShellScroll(() => {
    applyTier1ScrollChrome(getMainAppScrollTop());
  });
  unsubscribePtr = subscribeStoresHomePullRefresh(syncPtrSuspension);
  window.addEventListener("resize", scheduleOverflowRecheck, { passive: true });
  syncPtrSuspension();
  applyTier1ScrollChrome(lastY);
}

function stopTier1ScrollChrome(): void {
  if (unsubscribeScroll) {
    unsubscribeScroll();
    unsubscribeScroll = null;
  }
  if (unsubscribePtr) {
    unsubscribePtr();
    unsubscribePtr = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", scheduleOverflowRecheck);
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
  }
  tier1Hidden = false;
  ptrSuspended = false;
  notify();
}

/** `/stores` — TIER1 scroll hide/show (TIER3 anchor unaffected). NO scrollTop correction. */
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
  overflowing: boolean,
  ptrActive: boolean
): boolean {
  if (ptrActive) return currentHidden;
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
