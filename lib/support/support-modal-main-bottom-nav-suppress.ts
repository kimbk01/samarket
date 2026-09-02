"use client";

import { useLayoutEffect } from "react";

/**
 * Support Sheet open ↔ ConditionalAppShell main BottomNav.
 * Nav must unmount via shell authority (not CSS cover) while Support modal is open.
 */

let suppressCount = 0;
const listeners = new Set<() => void>();

function notifySuppressListeners(): void {
  for (const l of listeners) l();
}

export function pushSupportModalMainBottomNavSuppressed(): () => void {
  suppressCount += 1;
  notifySuppressListeners();
  return () => {
    suppressCount = Math.max(0, suppressCount - 1);
    notifySuppressListeners();
  };
}

export function getSupportModalMainBottomNavSuppressed(): boolean {
  return suppressCount > 0;
}

export function subscribeSupportModalMainBottomNavSuppressed(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}

export function useSupportModalMainBottomNavSuppress(enabled: boolean): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    return pushSupportModalMainBottomNavSuppressed();
  }, [enabled]);
}
