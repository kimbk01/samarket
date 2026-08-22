import {
  getMainAppScrollRoot,
  getMainAppScrollTop,
  setMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";
import { readStoreDetailFixedHeaderOffsetPxCached } from "@/lib/ui/store-detail-viewport-metrics";
import { STORE_DETAIL_TABS_PIN_EXIT_PX } from "@/lib/ui/store-detail-viewport-tuning";

/** 매장 상세 카테고리 보드 — `pinFocusedProductInMenuSections` 후 해당 행 하이라이트·스크롤 */
export const STORE_MENU_PRODUCT_DOM_ID_PREFIX = "store-menu-product-";

/** focus landing 허용 오차 — pin 해제 히스테리시스와 동일(신규 magic number 금지) */
export const STORE_MENU_FOCUS_LANDING_TOLERANCE_PX = STORE_DETAIL_TABS_PIN_EXIT_PX;

export function storeMenuProductDomId(productId: string): string {
  return `${STORE_MENU_PRODUCT_DOM_ID_PREFIX}${productId.trim()}`;
}

export function parseStoreMenuProductDomId(elementId: string): string | null {
  const id = elementId.trim();
  if (!id.startsWith(STORE_MENU_PRODUCT_DOM_ID_PREFIX)) return null;
  const productId = id.slice(STORE_MENU_PRODUCT_DOM_ID_PREFIX.length).trim();
  return productId.length > 0 ? productId : null;
}

const FOCUS_RING_CLASSES = ["ring-2", "ring-sam-primary", "ring-offset-2", "ring-offset-sam-surface"] as const;
const focusRingTimers = new Map<string, number>();

/**
 * focus landing sticky 하단 — pinned 탭 실측이 있으면 그것, 없으면 header+tabs 높이 합.
 * in-flow 미안정 탭(bottom >= viewport)은 READY 가 아니므로 fallback 사용.
 */
export function resolveStoreMenuFocusStickyBottomPx(opts: {
  tabsEl: HTMLElement | null | undefined;
  tabsHeightPx: number;
  pinned: boolean;
  viewportHeightPx?: number;
}): number {
  const tabsH = Math.max(0, opts.tabsHeightPx);
  const fallback = readStoreDetailFixedHeaderOffsetPxCached() + tabsH;
  const vh =
    opts.viewportHeightPx ??
    (typeof window !== "undefined" ? window.innerHeight : 0);
  if (opts.pinned && opts.tabsEl) {
    const bottom = opts.tabsEl.getBoundingClientRect().bottom;
    if (Number.isFinite(bottom) && bottom > 0 && (vh <= 0 || bottom < vh)) {
      return bottom;
    }
  }
  return fallback;
}

/** focused row top − stickyBottom. DOM 없으면 null */
export function measureStoreMenuProductFocusDeltaPx(
  productId: string,
  stickyBottomPx: number
): number | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById(storeMenuProductDomId(productId));
  if (!el) return null;
  return el.getBoundingClientRect().top - stickyBottomPx;
}

export function isStoreMenuProductFocusLandingAligned(
  productId: string,
  stickyBottomPx: number,
  tolerancePx: number = STORE_MENU_FOCUS_LANDING_TOLERANCE_PX
): boolean {
  const delta = measureStoreMenuProductFocusDeltaPx(productId, stickyBottomPx);
  if (delta == null || !Number.isFinite(delta)) return false;
  return delta >= -tolerancePx && delta <= tolerancePx;
}

export function storeMenuSectionDomId(sectionIndex: number): string {
  return `store-sec-${sectionIndex}`;
}

/** category section header top − stickyBottom */
export function measureStoreMenuSectionHeaderDeltaPx(
  sectionIndex: number,
  stickyBottomPx: number
): number | null {
  if (typeof document === "undefined") return null;
  const el = document.getElementById(storeMenuSectionDomId(sectionIndex));
  if (!el) return null;
  return el.getBoundingClientRect().top - stickyBottomPx;
}

export function isStoreMenuSectionHeaderLandingAligned(
  sectionIndex: number,
  stickyBottomPx: number,
  tolerancePx: number = STORE_MENU_FOCUS_LANDING_TOLERANCE_PX
): boolean {
  const delta = measureStoreMenuSectionHeaderDeltaPx(sectionIndex, stickyBottomPx);
  if (delta == null || !Number.isFinite(delta)) return false;
  return delta >= -tolerancePx && delta <= tolerancePx;
}

function applyFocusProductRing(productId: string): void {
  const el = document.getElementById(storeMenuProductDomId(productId));
  if (!el) return;
  const prior = focusRingTimers.get(productId);
  if (prior) window.clearTimeout(prior);
  el.classList.add(...FOCUS_RING_CLASSES);
  const timer = window.setTimeout(() => {
    focusRingTimers.delete(productId);
    el.classList.remove(...FOCUS_RING_CLASSES);
  }, 2200);
  focusRingTimers.set(productId, timer);
}

export function clearStoreMenuProductFocusRing(productId: string | null | undefined): void {
  const id = productId?.trim();
  if (!id) return;
  const timer = focusRingTimers.get(id);
  if (timer) {
    window.clearTimeout(timer);
    focusRingTimers.delete(id);
  }
  document.getElementById(storeMenuProductDomId(id))?.classList.remove(...FOCUS_RING_CLASSES);
}

function syncScrollNudgeToTargetTop(
  targetTopPx: number,
  stickyBottomPx: number,
  scrollRoot: HTMLElement
): void {
  void scrollRoot.offsetHeight;
  const delta = targetTopPx - stickyBottomPx;
  if (Number.isFinite(delta) && Math.abs(delta) > 1 && Math.abs(delta) <= 800) {
    const nudged = getMainAppScrollTop(scrollRoot) + delta;
    setMainAppScrollTop(Math.max(0, nudged), {
      behavior: "auto",
      scrollRoot,
    });
    void scrollRoot.offsetHeight;
  }
}

/**
 * focusProduct entry — category section header만 sticky 하단에 맞춘다.
 * product 행 sync nudge 금지(섹션 내 하위 행이면 header가 viewport 위로 밀림).
 */
export function scrollStoreMenuFocusEntryIntoView(
  sectionIndex: number,
  productId: string,
  stickyBottomPx: number,
  opts?: { behavior?: ScrollBehavior }
): boolean {
  if (typeof window === "undefined") return false;
  const sectionEl = document.getElementById(storeMenuSectionDomId(sectionIndex));
  const productEl = document.getElementById(storeMenuProductDomId(productId));
  if (!sectionEl || !productEl) return false;
  const stickyBottom = Number.isFinite(stickyBottomPx) ? stickyBottomPx : 0;
  if (!(stickyBottom > 0)) return false;
  const scrollRoot = getMainAppScrollRoot();
  const behavior = opts?.behavior ?? "auto";
  const margin = `${Math.max(0, Math.round(stickyBottom))}px`;

  const prevSectionMargin = sectionEl.style.scrollMarginTop;
  sectionEl.style.scrollMarginTop = margin;
  try {
    sectionEl.scrollIntoView({ block: "start", behavior });
  } finally {
    sectionEl.style.scrollMarginTop = prevSectionMargin;
  }

  syncScrollNudgeToTargetTop(sectionEl.getBoundingClientRect().top, stickyBottom, scrollRoot);
  applyFocusProductRing(productId);
  return true;
}

/** pin·spacer settle 후 section header만 미세 보정 */
export function nudgeStoreMenuSectionHeaderToSticky(
  sectionIndex: number,
  stickyBottomPx: number
): boolean {
  if (typeof window === "undefined") return false;
  const sectionEl = document.getElementById(storeMenuSectionDomId(sectionIndex));
  if (!sectionEl) return false;
  const stickyBottom = Number.isFinite(stickyBottomPx) ? stickyBottomPx : 0;
  if (!(stickyBottom > 0)) return false;
  const scrollRoot = getMainAppScrollRoot();
  syncScrollNudgeToTargetTop(sectionEl.getBoundingClientRect().top, stickyBottom, scrollRoot);
  return isStoreMenuSectionHeaderLandingAligned(sectionIndex, stickyBottom);
}

/**
 * sticky 하단 기준으로 메뉴 행 정렬 스크롤.
 * Prefer scroll-margin + scrollIntoView (single browser scroll), then sync nudge.
 */
export function scrollStoreMenuProductIntoView(
  productId: string,
  stickyBottomPx: number,
  opts?: { behavior?: ScrollBehavior; syncNudge?: boolean }
): boolean {
  if (typeof window === "undefined") return false;
  const el = document.getElementById(storeMenuProductDomId(productId));
  if (!el) return false;
  const stickyBottom = Number.isFinite(stickyBottomPx) ? stickyBottomPx : 0;
  if (!(stickyBottom > 0)) return false;
  const scrollRoot = getMainAppScrollRoot();
  const behavior = opts?.behavior ?? "auto";

  const prevMargin = el.style.scrollMarginTop;
  el.style.scrollMarginTop = `${Math.max(0, Math.round(stickyBottom))}px`;
  try {
    el.scrollIntoView({ block: "start", behavior });
  } finally {
    el.style.scrollMarginTop = prevMargin;
  }

  if (opts?.syncNudge !== false) {
    syncScrollNudgeToTargetTop(el.getBoundingClientRect().top, stickyBottom, scrollRoot);
  }

  applyFocusProductRing(productId);
  return true;
}
