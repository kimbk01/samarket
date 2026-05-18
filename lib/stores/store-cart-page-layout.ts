/**
 * `/stores/[slug]/cart` 레이아웃 (배민·요기요식)
 *
 * - `ConditionalAppShell`: 뷰포트 높이 잠금 + `main` flex (문서 스크롤 아님)
 * - 셸: 상단 헤더·하단 주문 CTA `shrink-0`, 가운데만 `overflow-y-auto`
 * - `sticky`/`fixed` 미사용 — 중간 래퍼(`AppRouteTransition`) 때문에 깨지는 문제 회피
 */

/** 페이지 루트 — 부모 flex 체인에서 남은 높이를 채움 */
export const STORE_CART_PAGE_ROOT_CLASS =
  "flex min-h-0 flex-1 flex-col overflow-hidden w-full min-w-0 bg-sam-app";

/** 가운데 스크롤 영역 */
export const STORE_CART_SCROLL_BODY_CLASS =
  "min-h-0 flex-1 overflow-y-auto overscroll-y-contain";

export const STORE_CART_SCROLL_BODY_DATA_ATTR = "store-cart-scroll";

/** 상단 CartTopBar 래퍼 */
export const STORE_CART_HEADER_CHROME_CLASS = "shrink-0 z-30 bg-sam-surface";

/** 하단 가게배달 주문하기 래퍼 */
export const STORE_CART_FOOTER_CHROME_CLASS =
  "shrink-0 z-30 border-t border-sam-border bg-white pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]";

export const STORE_CART_CHECKOUT_ACTION_INNER_CLASS =
  "flex w-full min-w-0 items-center gap-3 px-3";

/** @deprecated flex 푸터 래퍼가 스타일 담당 — 앵커용 속성만 유지 */
export const STORE_CART_CHECKOUT_ACTION_CLASS = "";

export const STORE_CART_CHECKOUT_ACTION_DATA_ATTR = "store-cart-checkout-action";

/** @deprecated `STORE_CART_HEADER_CHROME_CLASS` + CartTopBar bleed */
export const STORE_CART_HEADER_STICKY_CLASS = "";

/** @deprecated 내부 스크롤 — 별도 pb 불필요 */
export const STORE_CART_PAGE_CONTENT_PAD_CLASS = "";

export function isStoreCommerceCartCheckoutPath(pathname: string | null | undefined): boolean {
  const path = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return /^\/stores\/[^/]+\/(cart|checkout)(\/|$)/.test(path);
}
