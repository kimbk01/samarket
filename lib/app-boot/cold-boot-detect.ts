"use client";

import { COLD_BOOT_SESSION_KEY } from "@/lib/app-boot/cold-boot-constants";

/**
 * App icon cold start — not in-tab navigation (bottom-nav / trade-primary push).
 * Tab transition skeleton overlay must stay off per trade-primary-tab-transition contract.
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
    if (sessionStorage.getItem(COLD_BOOT_SESSION_KEY) === "1") return false;
    sessionStorage.setItem(COLD_BOOT_SESSION_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

export function shouldShowColdBootContentOverlay(hasPendingMenuIntent: boolean): boolean {
  if (hasPendingMenuIntent) return false;
  return isColdAppLaunchNavigation();
}
