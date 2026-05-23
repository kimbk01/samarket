import {
  getMainAppScrollRoot,
  getMainAppScrollTop,
  setMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";

/** 매장 상세 카테고리 보드 — `pinFocusedProductInMenuSections` 후 해당 행 하이라이트·스크롤 */
export const STORE_MENU_PRODUCT_DOM_ID_PREFIX = "store-menu-product-";

export function storeMenuProductDomId(productId: string): string {
  return `${STORE_MENU_PRODUCT_DOM_ID_PREFIX}${productId.trim()}`;
}

export function parseStoreMenuProductDomId(elementId: string): string | null {
  const id = elementId.trim();
  if (!id.startsWith(STORE_MENU_PRODUCT_DOM_ID_PREFIX)) return null;
  const productId = id.slice(STORE_MENU_PRODUCT_DOM_ID_PREFIX.length).trim();
  return productId.length > 0 ? productId : null;
}

const FOCUS_RING_CLASSES = ["ring-2", "ring-[#1C8DB8]", "ring-offset-2", "ring-offset-white"] as const;

/** sticky 탭 하단 기준으로 메뉴 행을 보이게 스크롤. 성공 시 true */
export function scrollStoreMenuProductIntoView(
  productId: string,
  stickyBottomPx: number
): boolean {
  if (typeof window === "undefined") return false;
  const el = document.getElementById(storeMenuProductDomId(productId));
  if (!el) return false;
  const stickyBottom = Number.isFinite(stickyBottomPx) ? stickyBottomPx : 120;
  const scrollRoot = getMainAppScrollRoot();
  const rootRect = scrollRoot.getBoundingClientRect();
  const top = el.getBoundingClientRect().top;
  const y = getMainAppScrollTop(scrollRoot) + (top - rootRect.top - stickyBottom - 10);
  setMainAppScrollTop(Math.max(0, y), { behavior: "smooth", scrollRoot });
  el.classList.add(...FOCUS_RING_CLASSES);
  window.setTimeout(() => {
    el.classList.remove(...FOCUS_RING_CLASSES);
  }, 2200);
  return true;
}
