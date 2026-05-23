"use client";

import {
  getStoreDetailAppScrollRoot,
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
  const targets: (HTMLElement | Window)[] = [];
  try {
    const root = getStoreDetailAppScrollRoot();
    if (!isDocumentScrollRoot(root)) {
      targets.push(root);
    }
  } catch {
    /* ignore */
  }
  targets.push(window);

  for (const t of targets) {
    t.addEventListener("scroll", onScroll, { passive });
  }
  return () => {
    for (const t of targets) {
      t.removeEventListener("scroll", onScroll);
    }
  };
}
