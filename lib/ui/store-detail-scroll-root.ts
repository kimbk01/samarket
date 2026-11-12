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

/**
 * C4 (Owner 「C4 구현 승인」 2026-11-12): 허브 본문 `<main data-main-hub-scroll-body class="main-hub-scroll-body">` 은
 * `app/app-shell.css` 에서 항상 `overflow-y: auto` — 잠금 클래스(`--child-scroll-lock`·`--room-host`)나 인라인 overflow 가
 * 없으면 계산된 스타일을 읽지 않고 스크롤 루트로 본다. 첫 화면 그리기 중 강제 스타일 계산(샤오미 측정 17~69ms)을 피한다.
 * 그 밖의 경우는 예전 판정 그대로.
 */
function isHubScrollBodyByContract(el: HTMLElement): boolean {
  if (el.tagName !== "MAIN") return false;
  const cl = el.classList;
  if (!cl.contains("main-hub-scroll-body")) return false;
  if (cl.contains("main-hub-scroll-body--child-scroll-lock") || cl.contains("main-hub-scroll-body--room-host")) {
    return false;
  }
  /** 다른 overflow 유틸이 덧붙으면 예전 판정으로 */
  if (/(^|\s)!?overflow-(y-)?(hidden|visible|clip)(\s|$)/.test(el.className)) return false;
  return !el.style.overflow && !el.style.overflowY;
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
  if (hubMain instanceof HTMLElement && isHubScrollBodyByContract(hubMain)) {
    return hubMain;
  }
  if (hubMain instanceof HTMLElement && isScrollable(hubMain)) {
    return hubMain;
  }
  const main = document.querySelector("main");
  if (main instanceof HTMLElement && isScrollable(main)) {
    return main;
  }
  return document.documentElement;
}

/**
 * F 단계 (2026-11-10): 스크롤 이벤트가 난 요소 = 지금 실제로 스크롤되는 루트 — 판정 계산(getComputedStyle) 없이 캐시를 맞춘다.
 * window/document 에서 난 이벤트는 문서 스크롤 루트.
 */
export function noteStoreDetailScrollRootFromScrollEvent(target: EventTarget | null): void {
  if (typeof document === "undefined" || !target) return;
  // 요소가 아니면(window·document) 문서 스크롤 루트
  cachedScrollRoot = target instanceof HTMLElement ? target : document.documentElement;
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
