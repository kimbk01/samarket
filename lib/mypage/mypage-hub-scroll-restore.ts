"use client";

/**
 * Slice 3 Runtime — `/mypage` hub scroll restore (Karrot-style back).
 * Mirror of delivery-list-scroll-restore, scoped to exact hub `/mypage` only.
 */

import {
  getMainAppScrollRoot,
  getMainAppScrollTop,
  setMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";

const KEY_SCROLL = "dibay:mypage-hub-scroll";
const KEY_POPSTATE_PENDING = "dibay:mypage-hub-scroll-popstate-pending";
const HUB = "/mypage";
const TTL_MS = 60_000;

let manualScrollRestorationApplied = false;

export function isMypageHubPath(pathname: string | null | undefined): boolean {
  const p = (pathname || "").split("?")[0]?.replace(/\/+$/, "") || "/";
  return p === HUB;
}

export function ensureMypageHubManualScrollRestoration(): void {
  if (typeof window === "undefined" || manualScrollRestorationApplied) return;
  try {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    manualScrollRestorationApplied = true;
  } catch {
    /* ignore */
  }
}

function readSavedScrollY(): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY_SCROLL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { y?: number; saved_at?: number };
    if (!parsed?.saved_at || parsed.saved_at + TTL_MS < Date.now()) {
      sessionStorage.removeItem(KEY_SCROLL);
      return null;
    }
    const y = Math.max(0, Math.round(Number(parsed.y) || 0));
    return y > 0 ? y : null;
  } catch {
    return null;
  }
}

export function saveMypageHubScroll(): void {
  if (typeof window === "undefined") return;
  if (!isMypageHubPath(window.location.pathname)) return;
  const y = Math.max(0, Math.round(getMainAppScrollTop()));
  try {
    sessionStorage.setItem(KEY_SCROLL, JSON.stringify({ y, saved_at: Date.now() }));
  } catch {
    /* quota */
  }
}

export function noteMypageHubScrollPopstatePending(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY_POPSTATE_PENDING, HUB);
  } catch {
    /* quota */
  }
}

function isBackForwardNavigation(): boolean {
  if (typeof performance === "undefined") return false;
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === "back_forward";
}

export function consumeMypageHubScrollPopstatePending(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const pending = sessionStorage.getItem(KEY_POPSTATE_PENDING);
    if (pending === HUB) {
      sessionStorage.removeItem(KEY_POPSTATE_PENDING);
      return true;
    }
    if (isBackForwardNavigation() && readSavedScrollY() != null) {
      if (pending) sessionStorage.removeItem(KEY_POPSTATE_PENDING);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function restoreMypageHubScrollY(targetY: number, opts?: { maxAttempts?: number }): void {
  if (typeof window === "undefined") return;
  const maxAttempts = opts?.maxAttempts ?? 24;
  let attempts = 0;
  const tryOnce = () => {
    const root = getMainAppScrollRoot();
    const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
    const y = Math.min(targetY, maxScroll);
    setMainAppScrollTop(y, { behavior: "auto", scrollRoot: root });
    attempts += 1;
    if (attempts < maxAttempts && y < targetY && maxScroll < targetY - 8) {
      requestAnimationFrame(tryOnce);
    }
  };
  tryOnce();
}

export function tryRestoreMypageHubScroll(): { restored: boolean; scroll_y: number } {
  if (!isMypageHubPath(typeof window !== "undefined" ? window.location.pathname : null)) {
    return { restored: false, scroll_y: 0 };
  }
  if (!consumeMypageHubScrollPopstatePending()) {
    return { restored: false, scroll_y: 0 };
  }
  const scrollY = readSavedScrollY();
  if (scrollY == null) return { restored: false, scroll_y: 0 };
  restoreMypageHubScrollY(scrollY);
  return { restored: true, scroll_y: scrollY };
}

/** Soft leave hub → child: save + mark pending restore for next hub entry via back. */
export function prepareMypageHubScrollForLeave(): void {
  saveMypageHubScroll();
  noteMypageHubScrollPopstatePending();
}

export function resetMypageHubScrollRestoreForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  manualScrollRestorationApplied = false;
  sessionStorage.removeItem(KEY_SCROLL);
  sessionStorage.removeItem(KEY_POPSTATE_PENDING);
}
