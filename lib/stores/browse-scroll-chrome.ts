"use client";

import { resolveBottomNavScrollChromeAction } from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import { getMainAppScrollTop } from "@/lib/layout/main-app-scroll-root";
import { getStoreDetailScrollTop, isMainAppScrollBodyOverflowing } from "@/lib/ui/store-detail-scroll-root";

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

function applyScrollChrome(y: number): void {
  if (!isMainAppScrollBodyOverflowing()) {
    if (hidden) {
      hidden = false;
      notify();
    }
    lastY = y;
    return;
  }
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
    /* 상태 유지 — 짧은 목록·관성 스크롤 잔진동에서 hide/reveal 깜빡임 방지 */
  }
  lastY = y;
}

function scheduleOverflowRecheck(): void {
  if (typeof window === "undefined") return;
  if (resizeTimer != null) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    applyScrollChrome(getMainAppScrollTop());
  }, 100);
}

function startBrowseScrollChrome(): void {
  if (unsubscribeScroll) return;
  lastY = getMainAppScrollTop();
  unsubscribeScroll = subscribeAppShellScroll((event) => {
    applyScrollChrome(readScrollTopFromScrollTarget(event.target));
  });
  window.addEventListener("resize", scheduleOverflowRecheck, { passive: true });
  applyScrollChrome(lastY);
}

function stopBrowseScrollChrome(): void {
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
  hidden = false;
  notify();
}

function acquireBrowseScrollChrome(): void {
  subscriberCount += 1;
  if (subscriberCount === 1) startBrowseScrollChrome();
}

function releaseBrowseScrollChrome(): void {
  subscriberCount = Math.max(0, subscriberCount - 1);
  if (subscriberCount === 0) stopBrowseScrollChrome();
}

/** 목록·empty 전환 후 overflow 재판정 */
export function resetBrowseScrollChrome(): void {
  hidden = false;
  lastY = getMainAppScrollTop();
  notify();
  scheduleOverflowRecheck();
}

/** @internal vitest — scroll Y 적용 로직 검증 */
export function applyBrowseScrollChromeForTests(y: number): void {
  applyScrollChrome(y);
}

/** @internal vitest */
export function resetBrowseScrollChromeStateForTests(): void {
  hidden = false;
  lastY = 0;
}

export function subscribeBrowseScrollChrome(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBrowseScrollChromeHiddenSnapshot(): boolean {
  return hidden;
}

export function getBrowseScrollChromeHiddenServerSnapshot(): boolean {
  return false;
}

export function subscribeBrowseScrollChromeWithLifecycle(
  listener: () => void,
  enabled: boolean
): () => void {
  if (enabled) acquireBrowseScrollChrome();
  const unsub = subscribeBrowseScrollChrome(listener);
  return () => {
    unsub();
    if (enabled) releaseBrowseScrollChrome();
  };
}
