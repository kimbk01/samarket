/**
 * 매장 상세 스크롤 컨테이너 — `ConditionalAppShell` `<main>` vs 문서 스크롤 단일 판별.
 */

function isScrollable(el: HTMLElement): boolean {
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  const oy = getComputedStyle(el).overflowY;
  return oy === "auto" || oy === "scroll" || oy === "overlay";
}

export function isDocumentScrollRoot(root: HTMLElement): boolean {
  return typeof document !== "undefined" && root === document.documentElement;
}

let cachedScrollRoot: HTMLElement | null = null;

export function invalidateStoreDetailScrollRootCache(): void {
  cachedScrollRoot = null;
}

/** 앱 본문이 실제로 스크롤되는 요소 */
export function getStoreDetailAppScrollRoot(): HTMLElement {
  if (typeof document === "undefined") {
    throw new Error("getStoreDetailAppScrollRoot requires document");
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
    window.scrollTo({ top: y, behavior });
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
