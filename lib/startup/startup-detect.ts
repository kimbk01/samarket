"use client";

import { STARTUP_SESSION_KEY, STARTUP_HANDOFF_SESSION_KEY } from "@/lib/startup/startup-constants";

/**
 * App icon cold start — not in-tab navigation.
 * Handoff from Local Boot Shell counts as continuing the same cold session (no second intro).
 */
export function isColdAppLaunchNavigation(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.type !== "navigate" && nav.type !== "reload") return false;
  } catch {
    /* continue */
  }
  try {
    if (sessionStorage.getItem(STARTUP_HANDOFF_SESSION_KEY) === "1") {
      // Local shell already painted intro — treat as same cold session, not a fresh cold intro.
      sessionStorage.setItem(STARTUP_SESSION_KEY, "1");
      return false;
    }
    if (sessionStorage.getItem(STARTUP_SESSION_KEY) === "1") return false;
    sessionStorage.setItem(STARTUP_SESSION_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

export function consumeStartupHandoffFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(STARTUP_HANDOFF_SESSION_KEY) !== "1") return false;
    sessionStorage.removeItem(STARTUP_HANDOFF_SESSION_KEY);
    sessionStorage.setItem(STARTUP_SESSION_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function shouldShowColdBootContentOverlay(hasPendingMenuIntent: boolean): boolean {
  if (hasPendingMenuIntent) return false;
  return isColdAppLaunchNavigation();
}
