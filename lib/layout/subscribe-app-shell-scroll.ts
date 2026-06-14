"use client";

import {
  getStoreDetailAppScrollRoot,
  invalidateStoreDetailScrollRootCache,
  isDocumentScrollRoot,
} from "@/lib/ui/store-detail-scroll-root";

export type SubscribeAppShellScrollOptions = {
  passive?: boolean;
  /** 허브 `[data-main-hub-scroll-body]` 가 늦게 붙을 때(440ms push) 동기화 */
  onTargetsChanged?: () => void;
};

/**
 * 메인 셸 스크롤 구독 — `scroll` 은 버블하지 않아 `<main>` 과 `window` 를 모두 연결한다.
 * (`use-bottom-nav-scroll-hide` · 당김 새로고침 등 공통)
 */
export function subscribeAppShellScroll(
  onScroll: (event: Event) => void,
  options?: SubscribeAppShellScrollOptions | { passive?: boolean }
): () => void {
  if (typeof window === "undefined") return () => {};

  const passive = options?.passive ?? true;
  const onTargetsChanged =
    options && "onTargetsChanged" in options ? options.onTargetsChanged : undefined;
  const attached = new Set<EventTarget>();
  let retryId: number | null = null;
  let burstTimerIds: number[] = [];

  const bindTargets = (refreshRoot: boolean) => {
    if (refreshRoot) {
      invalidateStoreDetailScrollRootCache();
    }
    const before = attached.size;
    const next: (HTMLElement | Window)[] = [];
    try {
      const root = getStoreDetailAppScrollRoot();
      if (!isDocumentScrollRoot(root)) {
        next.push(root);
      }
    } catch {
      /* ignore */
    }
    next.push(window);

    for (const t of next) {
      if (attached.has(t)) continue;
      t.addEventListener("scroll", onScroll, { passive });
      attached.add(t);
    }
    if (attached.size !== before) {
      onTargetsChanged?.();
    }
  };

  bindTargets(false);
  retryId = window.setTimeout(() => bindTargets(true), 0);

  burstTimerIds = [50, 150, 450].map((ms) =>
    window.setTimeout(() => bindTargets(true), ms)
  );

  const mutationObserver =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => bindTargets(true))
      : null;
  mutationObserver?.observe(document.body, { childList: true, subtree: true });

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => bindTargets(true));
    resizeObserver.observe(document.body);
  }

  return () => {
    if (retryId != null) {
      window.clearTimeout(retryId);
      retryId = null;
    }
    for (const id of burstTimerIds) {
      window.clearTimeout(id);
    }
    burstTimerIds = [];
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    for (const t of attached) {
      t.removeEventListener("scroll", onScroll);
    }
    attached.clear();
  };
}
