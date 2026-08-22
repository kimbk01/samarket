import {
  getMainAppScrollRoot,
  setMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";
import {
  measureStoreDetailElementScrollTop,
  isDocumentScrollRoot,
} from "@/lib/ui/store-detail-scroll-root";
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

/**
 * focus landing sticky 하단 — pinned 탭 실측이 있으면 그것, 없으면 header+tabs 높이 합.
 * (in-flow 미pin 탭의 getBoundingClientRect().bottom 은 쓰지 않음)
 */
export function resolveStoreMenuFocusStickyBottomPx(opts: {
  tabsEl: HTMLElement | null | undefined;
  tabsHeightPx: number;
  pinned: boolean;
}): number {
  const tabsH = Math.max(0, opts.tabsHeightPx);
  const fallback = readStoreDetailFixedHeaderOffsetPxCached() + tabsH;
  if (opts.pinned && opts.tabsEl) {
    const bottom = opts.tabsEl.getBoundingClientRect().bottom;
    if (Number.isFinite(bottom) && bottom > 0) return bottom;
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

/**
 * sticky 하단 기준으로 메뉴 행 정렬 스크롤.
 * 좌표계 = 카테고리 탭 앵커와 동일 계열:
 * y = measureElementScrollTop(el) − stickyInset
 * (viewport absolute stickyBottom − rootTop = stickyInset)
 */
export function scrollStoreMenuProductIntoView(
  productId: string,
  stickyBottomPx: number,
  opts?: { behavior?: ScrollBehavior }
): boolean {
  if (typeof window === "undefined") return false;
  const el = document.getElementById(storeMenuProductDomId(productId));
  if (!el) return false;
  const stickyBottom = Number.isFinite(stickyBottomPx) ? stickyBottomPx : 0;
  if (!(stickyBottom > 0)) return false;
  const scrollRoot = getMainAppScrollRoot();
  const elScrollTop = measureStoreDetailElementScrollTop(el, scrollRoot);
  const rootTop = isDocumentScrollRoot(scrollRoot) ? 0 : scrollRoot.getBoundingClientRect().top;
  const stickyInset = stickyBottom - rootTop;
  const y = elScrollTop - stickyInset;
  setMainAppScrollTop(Math.max(0, y), {
    behavior: opts?.behavior ?? "auto",
    scrollRoot,
  });
  el.classList.add(...FOCUS_RING_CLASSES);
  window.setTimeout(() => {
    el.classList.remove(...FOCUS_RING_CLASSES);
  }, 2200);
  return true;
}
