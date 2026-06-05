"use client";

import { resolveBottomNavScrollChromeAction } from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import {
  getStoreDetailScrollTop,
  invalidateStoreDetailScrollRootCache,
} from "@/lib/ui/store-detail-scroll-root";

function readScrollTopFromScrollTarget(target: EventTarget | null): number {
  if (target instanceof Element) {
    const el =
      target === document.documentElement ?
        (document.scrollingElement ?? document.documentElement)
      : target;
    if (
      el instanceof HTMLElement &&
      el !== document.body &&
      (el.scrollHeight > el.clientHeight + 1 || el === document.scrollingElement)
    ) {
      return el.scrollTop;
    }
  }
  return getStoreDetailScrollTop();
}

let hidden = false;
let lastY = 0;
let subscriberCount = 0;
let unsubscribeScroll: (() => void) | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** 4단(2차 칩) 전용 — overflow 게이트 없음, scrollY 임계값만 */
function applySubtopicScrollChrome(y: number): void {
  const action = resolveBottomNavScrollChromeAction(lastY, y);
  if (action === "hide") {
    if (!hidden) {
      hidden = true;
      notify();
    }
  } else if (action === "reveal") {
    if (hidden) {
      hidden = false;
      notify();
    }
  } else if (action === "hold") {
    /* 관성 스크롤 잔진동에서 hide/reveal 깜빡임 방지 */
  }
  lastY = y;
}

function onAppShellScroll(event: Event): void {
  applySubtopicScrollChrome(readScrollTopFromScrollTarget(event.target));
}

function attachScrollListeners(): void {
  unsubscribeScroll = subscribeAppShellScroll(onAppShellScroll);
}

function scheduleSubtopicRecheck(): void {
  if (typeof window === "undefined") return;
  if (resizeTimer != null) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    refreshBrowseSubtopicScrollChromeBindings();
  }, 100);
}

/** 목록 paint·resize 후 스크롤 루트 재연결 */
export function refreshBrowseSubtopicScrollChromeBindings(): void {
  if (typeof window === "undefined") return;
  if (subscriberCount === 0) return;
  invalidateStoreDetailScrollRootCache();
  if (unsubscribeScroll) {
    unsubscribeScroll();
    unsubscribeScroll = null;
  }
  attachScrollListeners();
  lastY = getMainAppScrollTop();
  applySubtopicScrollChrome(lastY);
}

function startBrowseSubtopicScrollChrome(): void {
  if (unsubscribeScroll) return;
  lastY = getMainAppScrollTop();
  attachScrollListeners();
  window.addEventListener("resize", scheduleSubtopicRecheck, { passive: true });
  applySubtopicScrollChrome(lastY);
}

function stopBrowseSubtopicScrollChrome(): void {
  if (unsubscribeScroll) {
    unsubscribeScroll();
    unsubscribeScroll = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", scheduleSubtopicRecheck);
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
  }
  hidden = false;
  notify();
}

function acquireBrowseSubtopicScrollChrome(): void {
  subscriberCount += 1;
  if (subscriberCount === 1) startBrowseSubtopicScrollChrome();
}

function releaseBrowseSubtopicScrollChrome(): void {
  subscriberCount = Math.max(0, subscriberCount - 1);
  if (subscriberCount === 0) stopBrowseSubtopicScrollChrome();
}

/** 1차/2차 전환 시 4단 접힘 해제 */
export function resetBrowseSubtopicScrollChrome(): void {
  hidden = false;
  lastY = getMainAppScrollTop();
  notify();
  refreshBrowseSubtopicScrollChromeBindings();
}

/** @internal vitest */
export function applyBrowseSubtopicScrollChromeForTests(y: number): void {
  applySubtopicScrollChrome(y);
}

/** @internal vitest */
export function resetBrowseSubtopicScrollChromeStateForTests(): void {
  hidden = false;
  lastY = 0;
}

export function subscribeBrowseSubtopicScrollChrome(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBrowseSubtopicScrollChromeHiddenSnapshot(): boolean {
  return hidden;
}

export function getBrowseSubtopicScrollChromeHiddenServerSnapshot(): boolean {
  return false;
}

export function subscribeBrowseSubtopicScrollChromeWithLifecycle(
  listener: () => void,
  enabled: boolean
): () => void {
  if (enabled) acquireBrowseSubtopicScrollChrome();
  const unsub = subscribeBrowseSubtopicScrollChrome(listener);
  return () => {
    unsub();
    if (enabled) releaseBrowseSubtopicScrollChrome();
  };
}
