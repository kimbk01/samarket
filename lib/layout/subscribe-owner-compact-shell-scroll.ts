"use client";

import {
  OWNER_COMPACT_SHELL_BODY_DATA_ATTR,
  OWNER_COMPACT_SHELL_MAIN_PB_CLASS,
  OWNER_COMPACT_SHELL_SCROLL_CLASS,
} from "@/lib/business/owner-compact-shell-layout";

/** 오너 compact 본문 스크롤 루트 — 대시 `__scroll` · 주문 목록 `__main-pb`+overflow-y-auto */
const OWNER_SCROLL_TARGET_SELECTOR = [
  `.${OWNER_COMPACT_SHELL_SCROLL_CLASS}`,
  `.${OWNER_COMPACT_SHELL_MAIN_PB_CLASS}`,
].join(",");

function ownerCompactShellActive(): boolean {
  return (
    typeof document !== "undefined" &&
    document.body.hasAttribute(OWNER_COMPACT_SHELL_BODY_DATA_ATTR)
  );
}

function collectOwnerScrollTargets(): HTMLElement[] {
  if (!ownerCompactShellActive()) return [];
  return [...document.querySelectorAll<HTMLElement>(OWNER_SCROLL_TARGET_SELECTOR)];
}

/**
 * 매장 오너 compact — `.owner-compact-shell__scroll` / `__main-pb` 스크롤만 구독.
 * (`useBottomNavScrollHide` 의 window 구독과 분리)
 */
export function subscribeOwnerCompactShellScroll(
  onScroll: (event: Event) => void,
  options?: { passive?: boolean }
): () => void {
  if (typeof window === "undefined") return () => {};

  const passive = options?.passive ?? true;
  const attached = new Set<HTMLElement>();
  let retryId: number | null = null;

  const bindTargets = () => {
    if (!ownerCompactShellActive()) return;
    for (const el of collectOwnerScrollTargets()) {
      if (attached.has(el)) continue;
      el.addEventListener("scroll", onScroll, { passive });
      attached.add(el);
    }
  };

  bindTargets();
  retryId = window.setTimeout(bindTargets, 0);

  const mutationObserver = new MutationObserver(bindTargets);
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(bindTargets);
    resizeObserver.observe(document.body);
  }

  return () => {
    if (retryId != null) window.clearTimeout(retryId);
    mutationObserver.disconnect();
    resizeObserver?.disconnect();
    for (const el of attached) {
      el.removeEventListener("scroll", onScroll);
    }
    attached.clear();
  };
}

export function readOwnerCompactShellScrollTopFromEvent(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const host = target.closest(OWNER_SCROLL_TARGET_SELECTOR);
  return host instanceof HTMLElement ? host.scrollTop : null;
}

export function getOwnerCompactShellScrollTopSnapshot(): number {
  let max = 0;
  for (const el of collectOwnerScrollTargets()) {
    max = Math.max(max, el.scrollTop);
  }
  return max;
}
