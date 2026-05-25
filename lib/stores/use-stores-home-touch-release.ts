"use client";

import { useEffect } from "react";
import {
  getMainAppScrollRootCached,
  invalidateMainAppScrollRootCache,
} from "@/lib/layout/main-app-scroll-root";

/**
 * iOS Safari — `:active`·포커스가 touchend 후에도 남아 스크롤이 “눌린 채”처럼 느껴지는 현상 완화.
 * 입력 필드는 blur 하지 않음.
 */
export function useStoresHomeTouchRelease(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    invalidateMainAppScrollRootCache();
    const root = getMainAppScrollRootCached();

    const release = () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || active === document.body) return;
        if (
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          active instanceof HTMLSelectElement
        ) {
          return;
        }
        if (active instanceof HTMLButtonElement || active instanceof HTMLAnchorElement) {
          active.blur();
        }
      });
    };

    const opts = { passive: true, capture: true } as const;
    root.addEventListener("touchend", release, opts);
    root.addEventListener("touchcancel", release, opts);

    return () => {
      root.removeEventListener("touchend", release, opts);
      root.removeEventListener("touchcancel", release, opts);
    };
  }, [enabled]);
}
