"use client";

import { useEffect } from "react";
import {
  getMainAppScrollRootCached,
  invalidateMainAppScrollRootCache,
} from "@/lib/layout/main-app-scroll-root";
import { clearStuckTextSelection } from "@/lib/ui/clear-stuck-text-selection";

function blurInteractiveFocus(): void {
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
}

/**
 * 배달 목록(`/stores` · `/stores/browse/*`) — iOS `:active`/포커스 잔상 완화.
 *
 * PERF: 텍스트 선택 방지는 `.delivery-ui [data-main-hub-scroll-body]` 등 CSS `user-select`
 * 가 1차. JS는 touchend 1회(rAF)만 — scroll root `pointermove` capture 금지(체감 지연 원인).
 */
export function useStoresHomeTouchRelease(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    invalidateMainAppScrollRootCache();
    const root = getMainAppScrollRootCached();

    const release = () => {
      requestAnimationFrame(() => {
        blurInteractiveFocus();
        clearStuckTextSelection();
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
