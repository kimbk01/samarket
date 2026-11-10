"use client";

import { subscribeAppShellScrollRoots } from "@/lib/layout/app-shell-scroll-root-registry";
import {
  invalidateStoreDetailScrollRootCache,
  noteStoreDetailScrollRootFromScrollEvent,
} from "@/lib/ui/store-detail-scroll-root";

export type SubscribeAppShellScrollOptions = {
  passive?: boolean;
  /** 허브 `[data-main-hub-scroll-body]` 가 늦게 붙을 때(440ms push) 동기화 */
  onTargetsChanged?: () => void;
};

/**
 * 스크롤 이벤트를 받을 후보 — 허브 본문 `<main data-main-hub-scroll-body>` · 셸 `<main>` · window.
 * F 단계 (Owner 「정해진 설계안 순서대로」 2026-11-10): 예전에는 DOM 이 바뀔 때마다 「지금 실제로 스크롤되는 요소」를
 * getComputedStyle·scrollHeight 로 다시 판정해 그 하나에만 붙였다(탭 이동당 0.2~0.3초 강제 계산).
 * 이제 후보 전부에 붙인다 — `scroll` 이벤트는 실제로 스크롤된 요소에서만 나므로 받는 이벤트는 같고 판정 비용이 없다.
 */
function scrollCandidates(): (HTMLElement | Window)[] {
  const out: (HTMLElement | Window)[] = [];
  document.querySelectorAll<HTMLElement>("[data-main-hub-scroll-body]").forEach((el) => out.push(el));
  const main = document.querySelector("main");
  if (main instanceof HTMLElement && !out.includes(main)) out.push(main);
  out.push(window);
  return out;
}

/**
 * 메인 셸 스크롤 구독 — `scroll` 은 버블하지 않아 `<main>` 과 `window` 를 모두 연결한다.
 * (`use-bottom-nav-scroll-hide` · 당김 새로고침 등 공통)
 *
 * 다시 연결하는 때: 구독 직후 · 다음 프레임 1회(같은 커밋에서 늦게 붙는 허브 본문) · 허브 본문 소유자가 바뀜을 알릴 때
 * (`MainHubScrollBody` → `notifyAppShellScrollRootsChanged`). 전역 MutationObserver·ResizeObserver·타이머 없음.
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

  /** 실제로 스크롤된 요소 = 앱 스크롤 루트 — 캐시를 이벤트로 맞춘다(판정 계산 없음) */
  const handle = (event: Event) => {
    noteStoreDetailScrollRootFromScrollEvent(event.target);
    onScroll(event);
  };

  const bindTargets = () => {
    const before = attached.size;
    for (const t of scrollCandidates()) {
      if (attached.has(t)) continue;
      t.addEventListener("scroll", handle, { passive });
      attached.add(t);
    }
    if (attached.size !== before) {
      onTargetsChanged?.();
    }
  };

  bindTargets();
  const raf = window.requestAnimationFrame(() => bindTargets());
  const unsubscribeRoots = subscribeAppShellScrollRoots(() => {
    invalidateStoreDetailScrollRootCache();
    bindTargets();
  });

  return () => {
    window.cancelAnimationFrame(raf);
    unsubscribeRoots();
    for (const t of attached) {
      t.removeEventListener("scroll", handle);
    }
    attached.clear();
  };
}
