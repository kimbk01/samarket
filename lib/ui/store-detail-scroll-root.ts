/**
 * 앱 본문 스크롤 루트 — `ConditionalAppShell` `<main>` vs 문서 스크롤 단일 판별.
 * (매장 상세·배달 허브·필라이프·거래 피드 등 메인 셸 공통)
 */

function overflowYAllowsScroll(el: HTMLElement): boolean {
  const oy = getComputedStyle(el).overflowY;
  return oy === "auto" || oy === "scroll" || oy === "overlay";
}

function isScrollable(el: HTMLElement): boolean {
  if (el.tagName === "MAIN" && overflowYAllowsScroll(el)) {
    return true;
  }
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  return overflowYAllowsScroll(el);
}

/** 메인 허브·`<main>` 스크롤 본문이 실제로 넘치는지 — browse scroll-chrome hide 게이트 */
export function isMainAppScrollBodyOverflowing(minOverflowPx = 24): boolean {
  if (typeof document === "undefined") return false;
  const root = getStoreDetailAppScrollRootCached();
  if (isDocumentScrollRoot(root)) {
    const doc = document.documentElement;
    return doc.scrollHeight > doc.clientHeight + minOverflowPx;
  }
  return root.scrollHeight > root.clientHeight + minOverflowPx;
}

export function isDocumentScrollRoot(root: HTMLElement): boolean {
  return typeof document !== "undefined" && root === document.documentElement;
}

let cachedScrollRoot: HTMLElement | null = null;

export function invalidateStoreDetailScrollRootCache(): void {
  cachedScrollRoot = null;
}

/** 앱 본문이 실제로 스크롤되는 요소 (허브 `[data-main-hub-scroll-body]` · `<main>` 우선) */
export function getStoreDetailAppScrollRoot(): HTMLElement {
  if (typeof document === "undefined") {
    throw new Error("getStoreDetailAppScrollRoot requires document");
  }
  const hubMain = document.querySelector("[data-main-hub-scroll-body]");
  if (hubMain instanceof HTMLElement && isScrollable(hubMain)) {
    return hubMain;
  }
  const main = document.querySelector("main");
  if (main instanceof HTMLElement && isScrollable(main)) {
    return main;
  }
  return document.documentElement;
}

/** 핫패스 — layout effect 구독 시 1회 resolve 후 캐시 */
export function getStoreDetailAppScrollRootCached(): HTMLElement {
  if (cachedScrollRoot && document.contains(cachedScrollRoot)) {
    return cachedScrollRoot;
  }
  cachedScrollRoot = getStoreDetailAppScrollRoot();
  return cachedScrollRoot;
}

export function getStoreDetailScrollTop(scrollRoot?: HTMLElement): number {
  const root = scrollRoot ?? getStoreDetailAppScrollRoot();
  if (isDocumentScrollRoot(root)) {
    return (
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body?.scrollTop ||
      0
    );
  }
  return root.scrollTop;
}

export function setStoreDetailScrollTop(
  top: number,
  opts?: { behavior?: ScrollBehavior; scrollRoot?: HTMLElement }
): void {
  const root = opts?.scrollRoot ?? getStoreDetailAppScrollRoot();
  const y = Math.max(0, Math.floor(top));
  const behavior = opts?.behavior ?? "auto";
  if (isDocumentScrollRoot(root)) {
    if (behavior === "auto") {
      window.scrollTo(0, y);
      document.documentElement.scrollTop = y;
      if (document.body) document.body.scrollTop = y;
      return;
    }
    window.scrollTo({ top: y, behavior });
    return;
  }
  if (behavior === "auto") {
    root.scrollTop = y;
    return;
  }
  root.scrollTo({ top: y, behavior });
}

/** 요소 상단의 스크롤 루트 기준 offsetTop */
export function measureStoreDetailElementScrollTop(
  el: HTMLElement,
  scrollRoot?: HTMLElement
): number {
  const root = scrollRoot ?? getStoreDetailAppScrollRoot();
  const rect = el.getBoundingClientRect();
  if (isDocumentScrollRoot(root)) {
    return getStoreDetailScrollTop(root) + rect.top;
  }
  const rootRect = root.getBoundingClientRect();
  return root.scrollTop + (rect.top - rootRect.top);
}
