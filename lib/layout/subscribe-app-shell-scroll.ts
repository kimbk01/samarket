"use client";

import {
  getStoreDetailAppScrollRoot,
  invalidateStoreDetailScrollRootCache,
  isDocumentScrollRoot,
} from "@/lib/ui/store-detail-scroll-root";

/**
 * 메인 셸 스크롤 구독 — `scroll` 은 버블하지 않아 `<main>` 과 `window` 를 모두 연결한다.
 * (`use-bottom-nav-scroll-hide` · 당김 새로고침 등 공통)
 */
export function subscribeAppShellScroll(
  onScroll: (event: Event) => void,
  options?: { passive?: boolean }
): () => void {
  if (typeof window === "undefined") return () => {};

  const passive = options?.passive ?? true;
  const attached = new Set<EventTarget>();
  let retryId: number | null = null;

  const bindTargets = (refreshRoot: boolean) => {
    if (refreshRoot) {
      invalidateStoreDetailScrollRootCache();
    }
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
  };

  bindTargets(false);
  retryId = window.setTimeout(() => bindTargets(true), 0);

  return () => {
    if (retryId != null) {
      window.clearTimeout(retryId);
      retryId = null;
    }
    for (const t of attached) {
      t.removeEventListener("scroll", onScroll);
    }
    attached.clear();
  };
}
